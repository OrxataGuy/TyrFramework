import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { Container } from './Container';

import gen from './sys/gen';
import rem from './sys/rem';
import doc from './sys/doc';

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
            console.error(`Error crítico: No se encuentra la configuración en ${configPath}`);
            process.exit(1);
        }
    }

    public async handle(args: string[]): Promise<void> {
        const commandName = args[0];

        if (!commandName) {
            console.log("Por favor, introduce un comando. Ej: tyr help");
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
                        `Falló la tarea: "${description}"`,
                        e,
                        "Revisa los logs anteriores o la configuración."
                    );
                }
            }
        };

        const context: TyrContext = {
            ...this.container.get(),
            frameworkRoot: this.frameworkRoot,
            run: runInternal,
            task,
            fail: (msg: string, suggestion?: string) => { throw new TyrError(msg, null, suggestion); }
        };

        const systemCommands: Record<string, CommandFactory> = {
            gen,
            rem,
            doc,
        };

        if (systemCommands[commandName]) {
            await systemCommands[commandName](context)(args.slice(1));
            return;
        }

        if (!this.config) {
            throw new Error("El Kernel no ha sido inicializado (ejecuta boot primero).");
        }

        let scriptPath = this.config.commands[commandName];

        if (!scriptPath && this.config.aliases?.[commandName]) {
            const aliasTarget = this.config.aliases[commandName];
            scriptPath = this.config.commands[aliasTarget];
        }

        if (!scriptPath) {
            context.logger?.error(`Comando '${commandName}' no encontrado.`);
            return;
        }

        try {
            const absolutePath = path.resolve(this.frameworkRoot, scriptPath);

            const module = await import(absolutePath);

            if (typeof module.default !== 'function') {
                throw new Error(`El archivo ${scriptPath} no exporta una función por defecto.`);
            }

            const commandFactory: CommandFactory = module.default;
            const command = commandFactory(context);

            await command(args.slice(1));

        } catch (error: any) {
            this.handleError(error, args);
        }
    }

    private handleError(error: unknown, args: string[]) {
        let isDebug = args.includes('--debug');

        this.container.get().logger.error("Ups! Ha ocurrido un error.");

        if (error instanceof TyrError) {
            console.error(`↳  ${error.message}`);

            if (error.originalError) {
                const techMsg = this.extractErrorMessage(error.originalError);
                console.log(`      ↳ Caused by: ${techMsg}`);
            }

            if (error.suggestion) {
                console.warn(`\n   Sugerencia: ${error.suggestion}`);
            }

            if (isDebug && error.originalError instanceof Error) {
                console.log('\n--- Stack Trace Original ---');
                console.log(error.originalError.stack);
            } else if (isDebug) {
                console.log('\n--- Stack Trace Original ---');
                console.log(error);
            }

        } else if (error instanceof Error) {
            console.error(`   Error Crítico no controlado: ${error.message}`);
            if (isDebug) console.log(error.stack);
        } else {
            console.error('   Error desconocido:', error);
        }

        if (!isDebug) {
            console.log('\n(Usa --debug para ver el stack trace completo)');
        }

        process.exit(1);
    }

    private extractErrorMessage(err: unknown): string {
        if (err instanceof Error) return err.message;
        if (typeof err === 'string') return err;
        try {
            return JSON.stringify(err);
        } catch {
            return 'Error desconocido (no serializable)';
        }
    }
}