import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Container.js';

/**
 * @class PackageManager
 * @description Gestor agnóstico de paquetes del Sistema Operativo. 
 * Detecta automáticamente si el sistema usa apt, brew o dnf e instala software nativo.
 */
export class PackageManager {
    private shell: ShellManager;
    private logger: Logger;
    private manager: string | null;

    constructor(shell: ShellManager, logger: Logger) {
        this.shell = shell;
        this.logger = logger;
        this.manager = null; 
    }

    /**
     * @method detect
     * @description Intenta identificar el gestor de paquetes instalado en el sistema host.
     * @returns {Promise<string>} El nombre del binario detectado ('apt', 'brew', 'dnf').
     * @throws {Error} Si no se detecta ninguno soportado.
     * @example
     * const mgr = await pkg.detect();
     * console.log(`Usando: ${mgr}`);
     */
    public async detect(): Promise<string> {
        if (this.manager) return this.manager;

        try {
            await this.shell.exec('which apt-get');
            this.manager = 'apt';
            return 'apt';
        } catch(e) {}

        try {
            await this.shell.exec('which brew');
            this.manager = 'brew';
            return 'brew';
        } catch(e) {}

        try {
            await this.shell.exec('which dnf');
            this.manager = 'dnf';
            return 'dnf';
        } catch(e) {}

        throw new Error('No se detectó un gestor de paquetes soportado (apt/brew/dnf).');
    }

    /**
     * @method install
     * @description Instala un paquete del sistema usando el gestor detectado previamente.
     * @param {string} packageName - Nombre del paquete a instalar (ej: 'nginx', 'python3').
     * @example
     * // Instala nginx (usará sudo apt-get, brew o sudo dnf según el OS)
     * await pkg.install('nginx');
     */
    public async install(packageName: string): Promise<void> {
        const mgr = await this.detect();
        this.logger.info(`Instalando ${packageName} usando ${mgr}...`);

        let cmd = '';
        switch (mgr) {
            case 'apt': 
                cmd = `sudo apt-get install -y ${packageName}`; 
                break;
            case 'brew':
                cmd = `brew install ${packageName}`;
                break;
            case 'dnf':
                cmd = `sudo dnf install -y ${packageName}`;
                break;
        }

        await this.shell.exec(cmd);
        this.logger.success(`Paquete ${packageName} instalado.`);
    }
}


/**
 * @object PackageManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de PackageManager.
 */
export const PackageManagerTests = {
    detect: {},
};