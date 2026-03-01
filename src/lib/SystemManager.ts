import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

/**
 * @class SystemManager
 * @description General OS maintenance and cleanup utilities.
 */
export class SystemManager {
    private shell: ShellManager;
    private logger: Logger;

    constructor(shell: ShellManager, logger: Logger) {
        this.shell = shell;
        this.logger = logger;
    }

    /**
     * @method killPort
     * @description Identifies which process is occupying a port and force-kills it.
     * @param {number|string} port - The port to free (e.g. 3000).
     * @returns {Promise<boolean>} True if a process was killed, False if the port was already free.
     * @example
     * await sys.killPort(8080);
     */
    public async killPort(port: number | string): Promise<boolean> {
    try {
        const pid = await this.shell.exec(`lsof -t -i:${port}`).catch(() => null);
        if (!pid?.trim()) return false;

        this.logger.warn(`Port ${port} blocked by PID ${pid.trim()}. Killing...`);
        await this.shell.exec(`kill -9 ${pid.trim()}`);
        this.logger.success(`Port ${port} freed.`);
        return true;
    } catch (e) {
        throw new TyrError(`Could not free port: ${port}`, e, 'Check that lsof is available on your system.');
    }
}

    /**
     * @method nukeNodeModules
     * @description Removes node_modules and package-lock.json from the current directory.
     * Useful for fixing corrupted NPM installations.
     * @example
     * await sys.nukeNodeModules();
     */
    public async nukeNodeModules(): Promise<void> {
        this.logger.info('Cleaning up dependencies...');
        try {
            await this.shell.exec('rm -rf node_modules package-lock.json');
            this.logger.success('node_modules and package-lock.json removed.');
        } catch (e) {
            if (e instanceof TyrError) throw e;
            throw new TyrError('Could not remove node_modules.', e, 'Check write permissions on the current directory.');
        }
    }
}

export const SystemManagerTests = {
    killPort: { port: 8080 },
};
