import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { Container } from './Container';

import gen from './sys/gen';
import rem from './sys/rem';
import doc from './sys/doc';
import ai from './sys/ai';

import { TyrError } from './TyrError';

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

export interface TyrContext {
    frameworkRoot: string;
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

    constructor() {
        this.container = new Container();
        this.config = null;
        this.frameworkRoot = path.resolve(__dirname, '../../');
    }

    public async boot(args: string[]): Promise<void> {
        const isDebug = args.includes('--debug');
        await this.container.init(isDebug);

        const configPath = path.resolve(this.frameworkRoot, 'config/map.yml');

        try {
            const fileContents = fs.readFileSync(configPath, 'utf8');
            this.config = yaml.load(fileContents) as TyrConfig;
        } catch (error) {
            console.error(`Critical error: configuration not found at ${configPath}`);
            process.exit(1);
        }
    }

    public async handle(args: string[]): Promise<void> {
        const commandName = args[0];

        if (!commandName) {
            console.log("Please provide a command. Example: tyr help");
            return;
        }

        const runInternal = async (cmd: string, cmdArgs: string[] = []) => {
            await this.handle([cmd, ...cmdArgs]);
        };

        const task = async <T>(description: string, action: () => Promise<T> | T, next: boolean = false, onFail?: () => void): Promise<T | undefined> => {
            try {
                return await action();
            } catch (e) {

                if (onFail) {
                    onFail();
                }

                if (!next) {
                    throw new TyrError(
                        `Task failed: "${description}"`,
                        e,
                        "Check the previous logs or the configuration."
                    );
                }
            }
        };

        const context: TyrContext = {
            ...this.container.get(),
            frameworkRoot: this.frameworkRoot,
            run: runInternal,
            task,
            fail: (msg: string, suggestion?: string) => { throw new TyrError(msg, null, suggestion, commandName); }
        };

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
            throw new Error("Kernel has not been initialized (run boot first).");
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
            const absolutePath = path.resolve(this.frameworkRoot, scriptPath);

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