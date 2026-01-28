import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Container.js';

/**
 * @class SystemManager
 * @description Utilidades generales de mantenimiento y limpieza del sistema operativo.
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
     * @description Identifica qué proceso está ocupando un puerto y lo fuerza a cerrarse (kill -9).
     * @param {number|string} port - El puerto a liberar (ej: 3000).
     * @returns {Promise<boolean>} True si se mató un proceso, False si el puerto estaba libre o falló.
     * @example
     * await sys.killPort(8080);
     */
    public async killPort(port: number | string): Promise<boolean> {
        try {
            const pid = await this.shell.exec(`lsof -t -i:${port}`);
            
            if (pid) {
                this.logger.warn(`Puerto ${port} bloqueado por PID ${pid}. Eliminando...`);
                await this.shell.exec(`kill -9 ${pid}`);
                this.logger.success(`Puerto ${port} liberado.`);
                return true;
            }
        } catch (e) {
            return false;
        }
        return false;
    }

    /**
     * @method nukeNodeModules
     * @description Elimina radicalmente la carpeta node_modules y el package-lock.json del directorio actual.
     * Útil para arreglar instalaciones corruptas de NPM.
     * @example
     * await sys.nukeNodeModules();
     * Luego podrías hacer: await shell.exec('npm i');
     */
    public async nukeNodeModules(): Promise<void> {
        this.logger.info("Iniciando protocolo de limpieza de dependencias...");
        await this.shell.exec('rm -rf node_modules package-lock.json');
        this.logger.success("Basura eliminada.");
    }
}