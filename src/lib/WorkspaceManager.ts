import { ShellManager } from './ShellManager.js';
import { FileSystemManager } from './FileSystemManager.js';
import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

/**
 * @class WorkspaceManager
 * @description Manages local workspace directories: checks for existing repos,
 * creates branches and opens the project in VSCode.
 */
export class WorkspaceManager {
    private shell: ShellManager;
    private fs: FileSystemManager;
    private logger: Logger;

    constructor(shell: ShellManager, fs: FileSystemManager, logger: Logger) {
        this.shell = shell;
        this.fs = fs;
        this.logger = logger;
    }

    /**
     * @method checkExisting
     * @description Checks whether a workspace directory already exists.
     * If it does, asks the user if they want to replace it (deleting it first).
     * Returns true if the caller should proceed with creating the workspace.
     * @param {string} dirPath - Absolute path to the workspace directory.
     * @param {string} type - Human-readable type name shown in messages (e.g. 'integración', 'web').
     * @returns {Promise<boolean>} True if the workspace can be created/overwritten.
     * @example
     * const proceed = await workspace.checkExisting('/path/to/repo', 'integración');
     * if (!proceed) return;
     */
    public async checkExisting(dirPath: string, type: string = 'directorio'): Promise<boolean> {
        if (!this.fs.exists(dirPath)) return true;

        this.logger.warn(`Este ${type} ya existe: ${dirPath}`);
        const replace = await this.shell.confirm('¿Quieres reemplazarlo?', false);

        if (!replace) {
            this.logger.info('Operación cancelada.');
            return false;
        }

        try {
            await this.shell.exec(`rm -rf "${dirPath}"`);
            this.logger.info('Directorio existente eliminado.');
            return true;
        } catch (e) {
            throw new TyrError(`No se pudo eliminar el directorio existente: ${dirPath}`, e);
        }
    }

    /**
     * @method tagWorkspace
     * @description Tags a workspace by creating and checking out a new Git branch,
     * and optionally opening it in VSCode.
     * @param {string} dir - Absolute path to the workspace directory.
     * @param {string | null} branch - Branch name to create (null = skip branch creation).
     * @param {boolean} openCode - Whether to open the directory in VSCode (default: true).
     * @example
     * await workspace.tagWorkspace('/path/to/repo', 'PROJ-123', true);
     */
    public async tagWorkspace(dir: string, branch: string | null, openCode: boolean = true): Promise<void> {
        if (branch) {
            try {
                await this.shell.exec(`git -C "${dir}" checkout -b ${branch}`);
                this.logger.success(`Rama '${branch}' creada.`);
            } catch (e) {
                this.logger.warn(`No se pudo crear la rama '${branch}'. Puede que ya exista.`);
            }
        }

        if (openCode) {
            try {
                await this.shell.exec(`code "${dir}"`);
            } catch {
                this.logger.warn('No se pudo abrir VSCode. Asegúrate de tener el comando "code" instalado.');
            }
        }
    }
}

export const WorkspaceManagerTests = {
    checkExisting: { dirPath: '/tmp/tyr-workspace-test', type: 'integración' },
    tagWorkspace: { dir: '/tmp/tyr-workspace-test', branch: null, openCode: false },
};
