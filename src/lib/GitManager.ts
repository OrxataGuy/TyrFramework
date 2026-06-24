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

    /**
     * @method cloneTo
     * @description Clones a remote repository into a specific target directory.
     * @param {string} repoUrl - The HTTPS or SSH URL of the repository.
     * @param {string} destDir - The absolute path of the destination directory.
     * @example
     * await git.cloneTo('git@github.com:org/repo.git', '/path/to/dest');
     */
    public async cloneTo(repoUrl: string, destDir: string): Promise<void> {
        this.logger.info(`Cloning ${repoUrl}...`);
        const loader = this.shell.showLoader('Cloning repository...');
        try {
            await this.shell.exec(`git clone "${repoUrl}" "${destDir}"`);
            await this.shell.exec(`git -C "${destDir}" config --add core.filemode false`);
            loader.stop();
            this.logger.success('Cloning complete.');
        } catch (e) {
            loader.stop();
            throw new TyrError(`Could not clone repository: ${repoUrl}`, e, 'Check that the repository exists and that you have permission to clone it.');
        }
    }

    /**
     * @method checkRepoExists
     * @description Checks if a remote Git repository is accessible via ls-remote.
     * @param {string} repoUrl - The URL of the repository to check.
     * @returns {Promise<boolean>} True if the repository is reachable.
     * @example
     * const exists = await git.checkRepoExists('git@github.com:org/repo.git');
     */
    public async checkRepoExists(repoUrl: string): Promise<boolean> {
        try {
            await this.shell.exec(`git ls-remote "${repoUrl}" HEAD`);
            return true;
        } catch {
            return false;
        }
    }

    /**
     * @method initWithRemote
     * @description Removes an existing .git folder if present, then initialises a new Git repository
     * in the given directory and configures a remote origin.
     * @param {string} dir - The absolute path of the directory to initialise.
     * @param {string} remoteUrl - The remote URL to set as origin.
     * @example
     * await git.initWithRemote('/path/to/dir', 'git@github.com:org/repo.git');
     */
    public async initWithRemote(dir: string, remoteUrl: string): Promise<void> {
        try {
            await this.shell.exec(
                `cd "${dir}" && rm -rf .git && git init -b master && git remote add origin "${remoteUrl}" && git config --add core.filemode false && echo 'node_modules' >> .gitignore`
            );
            this.logger.success(`Git repository initialized at ${dir}`);
        } catch (e) {
            throw new TyrError(`Could not initialize git repository at ${dir}`, e);
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