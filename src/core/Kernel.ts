import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
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
        await this.container.init(isDebug);

        // Load framework commands (read-only, ships with the package)
        const frameworkConfigPath = path.resolve(this.frameworkRoot, 'config/map.yml');
        let frameworkConfig: TyrConfig = { commands: {} };
        try {
            frameworkConfig = yaml.load(fs.readFileSync(frameworkConfigPath, 'utf8')) as TyrConfig;
        } catch {
            console.error(`Warning: framework config not found at ${frameworkConfigPath}`);
        }

        // Load user commands from ~/.tyr/map.yml (optional)
        const userConfigPath = path.join(this.userRoot, 'map.yml');
        let userConfig: TyrConfig = { commands: {} };
        if (fs.existsSync(userConfigPath)) {
            try {
                const raw = yaml.load(fs.readFileSync(userConfigPath, 'utf8')) as TyrConfig;
                // Resolve user command paths to absolute so they don't get confused with framework paths
                userConfig.commands = {};
                for (const [name, relPath] of Object.entries(raw.commands ?? {})) {
                    userConfig.commands[name] = path.resolve(this.userRoot, relPath);
                }
            } catch {
                console.error(`Warning: could not load user config at ${userConfigPath}`);
            }
        }

        // Merge: user commands override framework commands
        this.config = {
            commands: { ...frameworkConfig.commands, ...userConfig.commands },
            aliases: { ...frameworkConfig.aliases, ...userConfig.aliases },
        };
    }

    public async handle(args: string[]): Promise<void> {
        const commandName = args[0];

        if (!commandName) {
            console.log('Usage: tyr <command> [args...]');
            console.log('       tyr --config     Configure Tyr for the first time');
            console.log('       tyr --version    Show version');
            console.log('       tyr --update     Update Tyr to the latest version');
            return;
        }

        // --version / -v
        if (commandName === '--version' || commandName === '-v') {
            const pkgPath = path.resolve(this.frameworkRoot, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            console.log(`tyr v${pkg.version}`);
            return;
        }

        // --update
        if (commandName === '--update') {
            const pkgPath = path.resolve(this.frameworkRoot, 'package.json');
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            const shell = this.container.get().shell;
            console.log(`Updating ${pkg.name}...`);
            await shell.exec(`npm update -g ${pkg.name}`);
            console.log('Update complete. Run tyr --version to confirm.');
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
            await config(context)([]);
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

            const module = await import(absolutePath);

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
