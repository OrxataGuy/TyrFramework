import { ShellManager } from './ShellManager.js';
import { Logger } from '../core/Container.js';
import { execa } from 'execa';

export interface DockerRunOptions {
    image: string;
    name: string;
    port?: string; 
    env?: string[];
}

/**
 * @class DockerManager
 * @description Gestor de bajo nivel para interactuar con el Docker Daemon. 
 * Permite levantar contenedores individuales, verificar estados y gestionar Docker Compose.
 */
export class DockerManager {
    // Definimos propiedades privadas tipadas
    private shell: ShellManager;
    private logger: Logger;

    constructor(shell: ShellManager, logger: Logger) {
        this.shell = shell;
        this.logger = logger;
    }

    /**
     * @method isRunning
     * @description Verifica si el servicio de Docker está activo y respondiendo en el sistema host.
     * @returns {Promise<boolean>} True si Docker está corriendo, False si está apagado o no instalado.
     * @example
     * const active = await docker.isRunning();
     * if (!active) console.error("Enciende Docker primero");
     */
    public async isRunning(): Promise<boolean> {
        try {
            await this.shell.exec('docker info');
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @method run
     * @description Despliega un contenedor individual en modo 'detach'. Si ya existe, lo reinicia.
     * @param {DockerRunOptions} config - Configuración del despliegue.
     * @example
     * await docker.run({
     *  name: 'mi-base-datos',
     *  image: 'mongo:latest',
     *  port: '27017:27017',
     *  env: ['MONGO_INITDB_ROOT_USERNAME=admin']
     * });
     */
    public async run({ image, name, port, env = [] }: DockerRunOptions): Promise<void> {
        this.logger.info(`Arrancando contenedor: ${name} (${image})...`);

        if (await this.containerExists(name)) {
            this.logger.warn(`Contenedor ${name} ya existe. Reiniciando...`);
            await this.shell.exec(`docker rm -f ${name}`);
        }

        const envFlags = env.map(e => `-e ${e}`).join(' ');
        
        const portMapping = port ? `-p ${port}` : '';

        const cmd = `docker run -d --name ${name} ${portMapping} ${envFlags} ${image}`;
        
        const containerId = await this.shell.exec(cmd);
        this.logger.success(`Contenedor activo. ID: ${containerId.substring(0, 12)}`);
    }

    /**
     * @method containerExists
     * @description Comprueba si un contenedor específico existe (corriendo o detenido).
     * @param {string} name - El nombre del contenedor a buscar.
     * @returns {Promise<boolean>} True si existe.
     * @example
     * if (await docker.containerExists('mi-app')) { ... }
     */
    public async containerExists(name: string): Promise<boolean> {
        try {
            await this.shell.exec(`docker inspect ${name}`);
            return true;
        } catch (e) {
            return false;
        }
    }

    /**
     * @method composeUp
     * @description Levanta un stack completo usando un archivo docker-compose.
     * @param {string} [file='docker-compose.yml'] - Ruta relativa al archivo compose.
     * @example
     * // Usar el defecto
     * await docker.composeUp();
     * // Usar uno específico
     * await docker.composeUp('infrastructure/db-compose.yml');
     */
    public async composeUp(file: string = 'docker-compose.yml'): Promise<void> {
        this.logger.info(`Levantando stack desde ${file}...`);
        await this.shell.exec(`docker-compose -f ${file} up -d`);
        this.logger.success('Stack desplegado correctamente.');
    }
}


/**
 * @object DockerManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de DockerManager.
 * 
 * HOJA DE RUTA DE TESTS:
 * =====================
 * 
 * 1. isRunning - Verifica que Docker está instalado y el daemon activo
 * 2. run - Despliega un contenedor ligero de prueba
 * 3. containerExists - Verifica que el contenedor de prueba existe
 * 4. composeUp - Valida sintaxis de docker-compose.yml
 */
export const DockerManagerTests = {
    isRunning: {},
    run: { image: 'alpine:latest', name: 'tyr-test-container', env: [] },
    containerExists: { name: 'tyr-test-container' },
    composeUp: { file: 'docker-compose.yml' }
};