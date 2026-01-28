import chalk from 'chalk';
import { ShellManager } from '../lib/ShellManager';
import { FileSystemManager } from '../lib/FileSystemManager';    
import { PackageManager } from '../lib/PackageManager'; 
import { DockerManager } from '../lib/DockerManager'; 
import { GitManager } from '../lib/GitManager';
import { SystemManager } from '../lib/SystemManager';
import { SQLManager } from '../lib/SQLManager';
import { WebManager } from '../lib/WebManager';

export interface Logger {
    log(msg: any): void;
    info(msg: any): void;
    success(msg: any): void;
    error(msg: any): void | undefined;
    warn(msg: any): void | undefined;
}

export interface ServiceContainer {
    logger: Logger;
    shell: ShellManager;
    fs: FileSystemManager;
    pkg: PackageManager;
    docker: DockerManager;
    git: GitManager;
    sys: SystemManager;
    db: SQLManager;
    web: WebManager;
}

export class Container {
    private services: Partial<ServiceContainer>;

    constructor() {
        this.services = {};
    }

    public init(isDebug: boolean): void {
        const logger: Logger = {
            log: (...msg) => console.log(...msg),
            info: (...msg) => console.log(chalk.blue('ℹ'), ...msg),
            success: (...msg) => console.log(chalk.green('✔'), ...msg),
            error: (...msg) => undefined,
            warn: (...msg) => undefined
        };

        if (isDebug) {
            logger.error = (...msg) => console.error(chalk.red('✖'), ...msg);
            logger.warn = (...msg) => console.warn(chalk.yellow('⚠'), ...msg);
        }

        const shell = new ShellManager();
        const db = new SQLManager();

        this.services = {
            logger,
            shell,
            db,
            web: new WebManager(logger),
            fs: new FileSystemManager(logger),
            pkg: new PackageManager(shell, logger),
            docker: new DockerManager(shell, logger),
            git: new GitManager(shell, logger),
            sys: new SystemManager(shell, logger)
        };
    }

    public get(): ServiceContainer {
        if (!this.services.logger) {
            throw new Error("El contenedor no ha sido inicializado. Ejecuta .init() primero.");
        }
        
        return this.services as ServiceContainer;
    }
}