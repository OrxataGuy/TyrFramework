import { ShellManager } from '../lib/ShellManager.js';
import { FileSystemManager } from '../lib/FileSystemManager.js';
import { PackageManager } from '../lib/PackageManager.js';
import { DockerManager } from '../lib/DockerManager.js';
import { GitManager } from '../lib/GitManager.js';
import { SystemManager } from '../lib/SystemManager.js';
import { SQLManager } from '../lib/SQLManager.js';
import { MongoManager } from '../lib/MongoManager.js';
import { WebManager } from '../lib/WebManager.js';
import { WorkspaceManager } from '../lib/WorkspaceManager.js';
import { JiraManager } from '../lib/JiraManager.js';
import { SetupManager } from '../lib/SetupManager.js';
import { AIVendorManager } from '../lib/AIVendorManager.js';
import { AIContextManager } from '../lib/AIContextManager.js';
import { PromptTemplateManager } from '../lib/PromptTemplateManager.js';
import { TokenManager } from '../lib/TokenManager.js';
import { Logger, createLogger } from './Logger.js';

import path from 'path';

export type { Logger };

export interface ServiceContainer {
    logger: Logger;
    path: typeof path;
    shell: ShellManager;
    fs: FileSystemManager;
    pkg: PackageManager;
    docker: DockerManager;
    git: GitManager;
    sys: SystemManager;
    db: SQLManager;
    mongo: MongoManager;
    web: WebManager;
    workspace: WorkspaceManager;
    jira: JiraManager;
    setup: SetupManager;
    aiVendor: AIVendorManager;
    aiContext: AIContextManager;
    prompts: PromptTemplateManager;
    tokens: TokenManager;
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
        const mongo = new MongoManager();
        const web = new WebManager(logger);
        const fs = new FileSystemManager(logger);
        const aiVendor = new AIVendorManager(logger);
        const aiContext = new AIContextManager(fs, aiVendor, logger);

        this.services = {
            logger,
            path,
            shell,
            db,
            mongo,
            web,
            fs,
            pkg: new PackageManager(shell, logger),
            docker: new DockerManager(shell, logger),
            git: new GitManager(shell, logger),
            sys: new SystemManager(shell, logger),
            workspace: new WorkspaceManager(shell, fs, logger),
            jira: new JiraManager(web, shell, logger),
            setup: new SetupManager(shell, fs, logger),
            aiVendor,
            aiContext,
            prompts: new PromptTemplateManager(aiContext, logger),
            tokens: new TokenManager(logger),
        };
    }

    public get(): ServiceContainer {
        if (!this.services.logger) {
            throw new Error('Container not initialised. Call .init() first.');
        }
        return this.services as ServiceContainer;
    }
}
