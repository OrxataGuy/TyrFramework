import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Container.js';

/**
 * @class GitManager
 * @description Wrapper para operaciones comunes de Git. Automatiza la inicialización, commits y clonado de repositorios.
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
     * @description Inicializa un repositorio Git en el directorio actual y renombra la rama principal a 'main'.
     * @example
     * await git.init();
     */
    public async init(): Promise<void> {
        await this.shell.exec('git init');
        try { await this.shell.exec('git branch -M main'); } catch(e) {}
    }

    /**
     * @method addAll
     * @description Añade todos los archivos al stage (git add .).
     * @example
     * await git.addAll();
     */
    public async addAll(): Promise<void> {
        await this.shell.exec('git add .');
    }

    /**
     * @method commit
     * @description Realiza un commit con el mensaje proporcionado.
     * @param {string} message - El mensaje del commit.
     * @example
     * await git.commit("feat: estructura inicial del proyecto");
     */
    public async commit(message: string): Promise<void> {
        await this.shell.exec(`git commit -m "${message}"`);
        this.logger.success(`Commit realizado: "${message}"`);
    }

    /**
     * @method clone
     * @description Clona un repositorio remoto en el directorio actual.
     * @param {string} repoUrl - La URL HTTPS o SSH del repositorio.
     * @example
     * await git.clone('https://github.com/usuario/repo.git');
     */
    public async clone(repoUrl: string): Promise<void> {
        this.logger.info(`Clonando ${repoUrl}...`);
        await this.shell.exec(`git clone ${repoUrl}`);
    }
}