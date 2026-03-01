import { ShellManager } from '../lib/ShellManager.js';
import { FileSystemManager } from '../lib/FileSystemManager.js';
import { PackageManager } from '../lib/PackageManager.js';
import { DockerManager } from '../lib/DockerManager.js';
import { GitManager } from '../lib/GitManager.js';
import { SystemManager } from '../lib/SystemManager.js';
import { SQLManager } from '../lib/SQLManager.js';
import { WebManager } from '../lib/WebManager.js';
import { Logger, createLogger } from './Logger.js';

export type { Logger };

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
        const logger = createLogger(isDebug);
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
            sys: new SystemManager(shell, logger),
        };
    }

    public get(): ServiceContainer {
        if (!this.services.logger) {
            throw new Error('Container not initialised. Call .init() first.');
        }
        return this.services as ServiceContainer;
    }
}
