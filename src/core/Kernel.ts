import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import dotenv from 'dotenv';
import { fileURLToPath, pathToFileURL } from 'url';
import { homedir } from 'os';
import { Container } from './Container';

import gen from './sys/gen';
import rem from './sys/rem';
import doc from './sys/doc';
import ai from './sys/ai';
import config from './sys/config';

import { TyrError } from './TyrError';

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

export interface TyrContext {
    frameworkRoot: string;
    userRoot: string;
    logger: any;
    shell: any;
    fs: any;
    docker?: any;
    run: (commandName: string, args?: string[]) => Promise<void>;
    task: <T>(description: string, action: () => Promise<T> | T, next?: boolean, onFail?: () => void) => Promise<T | undefined>;
    fail: (msg: string, suggestion?: string) => never;
    [key: string]: any;
}

type CommandFunction = (args: string[]) => Promise<void>;
type CommandFactory = (context: TyrContext) => CommandFunction;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class Kernel {
    private container: Container;
    private config: TyrConfig | null;
    private frameworkRoot: string;
    private userRoot: string;

    constructor() {
        this.container = new Container();
        this.config = null;
        this.frameworkRoot = path.resolve(__dirname, '../../');
        this.userRoot = path.join(homedir(), '.tyr');
    }

    public async boot(args: string[]): Promise<void> {
        const isDebug = args.includes('--debug');

        // Load all env vars from ~/.tyr/.env once, before anything else
        (dotenv as any).config({ path: path.join(this.userRoot, '.env'), quiet: true });

        await this.container.init(isDebug);

        // All commands live in ~/.tyr/map.yml — the framework ships no runtime commands
        this.config = { commands: {}, aliases: {} };

        const userConfigPath = path.join(this.userRoot, 'map.yml');
        if (fs.existsSync(userConfigPath)) {
            try {
                const raw = yaml.load(fs.readFileSync(userConfigPath, 'utf8')) as TyrConfig;
                for (const [name, cmdPath] of Object.entries(raw.commands ?? {})) {
                    // Absolute paths used as-is; relative paths resolved from userRoot
                    this.config.commands[name] = path.isAbsolute(cmdPath)
                        ? cmdPath
                        : path.resolve(this.userRoot, cmdPath);
                }
                this.config.aliases = raw.aliases ?? {};
            } catch {
                console.error(`Warning: could not load user config at ${userConfigPath}`);
            }
        }
    }

    public async handle(args: string[]): Promise<void> {
        const commandName = args[0];

        if (!commandName) {
            console.log('Usage: tyr <command> [args...]');
            console.log('       tyr --config     Configure Tyr for the first time');
            console.log('       tyr --version    Show version');
            console.log('       tyr --update     Pull latest changes from the linked ~/.tyr repo');
            console.log('       tyr --upgrade    Upgrade Tyr to the latest npm version');
            return;
        }

        // --version / -v
        if (commandName === '--version' || commandName === '-v') {
            const pkgPath = path.resolve(this.frameworkRoot, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            console.log(`tyr v${pkg.version}`);
            return;
        }

        // --update: pull latest changes from the linked ~/.tyr git repo
        if (commandName === '--update') {
            const shell = this.container.get().shell;
            const gitDir = path.join(this.userRoot, '.git');
            if (!fs.existsSync(gitDir)) {
                console.log('~/.tyr no está vinculado a ningún repositorio git.');
                console.log('Ejecuta: tyr --config --repo <url>  para vincularlo.');
                return;
            }
            console.log('Actualizando ~/.tyr desde el repositorio...');
            shell.cd(this.userRoot);
            await shell.exec('git pull');
            console.log('Actualización completada.');
            return;
        }

        // --upgrade: update the Tyr npm package itself
        if (commandName === '--upgrade') {
            const pkgPath = path.resolve(this.frameworkRoot, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const shell = this.container.get().shell;
            console.log(`Actualizando ${pkg.name}...`);
            await shell.exec(`npm update -g ${pkg.name}`);
            console.log('Actualización completada. Ejecuta tyr --version para confirmar.');
            return;
        }

        const runInternal = async (cmd: string, cmdArgs: string[] = []) => {
            await this.handle([cmd, ...cmdArgs]);
        };

        const task = async <T>(description: string, action: () => Promise<T> | T, next: boolean = false, onFail?: () => void): Promise<T | undefined> => {
            try {
                return await action();
            } catch (e) {
                if (onFail) onFail();
                if (!next) {
                    throw new TyrError(
                        `Task failed: "${description}"`,
                        e,
                        'Check the previous logs or the configuration.'
                    );
                }
            }
        };

        const context: TyrContext = {
            ...this.container.get(),
            frameworkRoot: this.frameworkRoot,
            userRoot: this.userRoot,
            run: runInternal,
            task,
            fail: (msg: string, suggestion?: string) => { throw new TyrError(msg, null, suggestion, commandName); }
        };

        // --config (needs context for fs/logger)
        if (commandName === '--config') {
            await config(context)(args.slice(1));
            return;
        }

        const systemCommands: Record<string, CommandFactory> = {
            gen,
            rem,
            doc,
            ai,
        };

        if (systemCommands[commandName]) {
            await systemCommands[commandName](context)(args.slice(1));
            return;
        }

        if (!this.config) {
            throw new Error('Kernel has not been initialized (run boot first).');
        }

        let scriptPath = this.config.commands[commandName];

        if (!scriptPath && this.config.aliases?.[commandName]) {
            const aliasTarget = this.config.aliases[commandName];
            scriptPath = this.config.commands[aliasTarget];
        }

        if (!scriptPath) {
            context.logger?.error(`Command '${commandName}' not found.`);
            return;
        }

        try {
            // Absolute paths (user commands) are used directly; relative paths resolve from frameworkRoot
            const absolutePath = path.isAbsolute(scriptPath)
                ? scriptPath
                : path.resolve(this.frameworkRoot, scriptPath);

            // Convert to file:// URL — required by ESM on Windows for absolute paths
            const moduleUrl = pathToFileURL(absolutePath).href;
            const module = await import(moduleUrl);

            if (typeof module.default !== 'function') {
                throw new Error(`File ${scriptPath} does not export a default function.`);
            }

            const commandFactory: CommandFactory = module.default;
            const command = commandFactory(context);
            await command(args.slice(1));

        } catch (error: any) {
            this.handleError(error, args);
        }
    }

    private handleError(error: unknown, args: string[]): void {
        const isDebug = args.includes('--debug');
        const logger = this.container.get().logger;
        const commandName = args[0];

        if (error instanceof TyrError) {
            const enriched = error.commandName
                ? error
                : new TyrError(error.message, error.originalError, error.suggestion, commandName);
            enriched.handle(isDebug, logger);
        } else {
            (new TyrError('Unhandled critical error', error, undefined, commandName)).handle(isDebug, logger);
        }

        process.exit(1);
    }
}
