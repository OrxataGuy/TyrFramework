import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

/**
 * @class GitManager
 * @description Wrapper for common Git operations. Automates repository initialization, commits and cloning.
 */
export class GitManager {
    private shell: ShellManager;
    private logger: Logger;

    constructor(shell: ShellManager, logger: Logger) {
        this.shell = shell;
        this.logger = logger;
    }

    /**
     * @method init
     * @description Initializes a Git repository in the current directory and renames the default branch to 'main'.
     * @example
     * await git.init();
     */
    public async init(): Promise<void> {
        try { await this.shell.exec('git init'); await this.shell.exec('git branch -M main'); } catch (e) {
            throw new TyrError(`Could not init git repository`, e, 'Check if the current directory still exists.');
        }
    }

    /**
     * @method addAll
     * @description Stages all files in the current directory (git add .).
     * @example
     * await git.addAll();
     */
    public async addAll(): Promise<void> {
        await this.shell.exec('git add .');
    }

    /**
     * @method commit
     * @description Creates a commit with the provided message.
     * @param {string} message - The commit message.
     * @example
     * await git.commit("feat: initial project structure");
     */
    public async commit(message: string): Promise<void> {
        await this.shell.exec(`git commit -m "${message}"`);
        this.logger.success(`Commit created: "${message}"`);
    }

    /**
     * @method clone
     * @description Clones a remote repository into the current directory.
     * @param {string} repoUrl - The HTTPS or SSH URL of the repository.
     * @example
     * await git.clone('https://github.com/user/repo.git');
     */
    public async clone(repoUrl: string): Promise<void> {
        this.logger.info(`Cloning ${repoUrl}...`);
        try {
            await this.shell.exec(`git clone ${repoUrl}`);
        } catch (e) {
            throw new TyrError(`Could not find the repository ` + repoUrl, e, 'Check if the repository exists or if you have the right permissions to clone it.');
        }
    }
}

/**
 * @object GitManagerTests
 * @description Test parameters to validate GitManager functionality.
 */
export const GitManagerTests = {
    init: { directory: '/tmp/tyr-git-test' },
    addAll: { directory: '/tmp/tyr-git-test' },
};