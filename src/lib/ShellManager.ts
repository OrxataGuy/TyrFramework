import { execa } from 'execa';
import { resolve } from 'path';
import { homedir } from 'os';
import inquirer from 'inquirer';
import { TyrError } from '../core/TyrError';

/**
 * @class ShellManager
 * @description Ejecutor de comandos de terminal. Mantiene el estado del directorio de trabajo (CWD) para encadenar comandos en carpetas específicas.
 */
export class ShellManager {
    private cwd: string;

    constructor() {
        this.cwd = process.cwd();
    }

    /**
     * @method exec
     * @description Ejecuta un comando en la shell del sistema y devuelve la salida estándar.
     * @param {string} command - El comando completo a ejecutar.
     * @returns {Promise<string>} El output (stdout) del comando limpio de espacios extra.
     * @example
     * const version = await shell.exec('node -v');
     */
    public async exec(command: string): Promise<string> {
        try {
            const result = await execa(command, { shell: true, cwd: this.cwd });
            return result.stdout.trim();
        } catch (error: unknown) {
            throw new TyrError(`Se ha producido un error al ejecutar el comando: ${command}`, error);
        }
    }

     /**
     * @method showLoader
     * @description Muestra un loader en terminal.
     * @param {string} message - Texto informativo.
     * @returns {void} 
     * @example
     * shell.showLoader('Cargando...');
     */
    public showLoader = (message: string): { stop: () => void } => {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        let stopped = false;

        const interval = setInterval(() => {
            if (!stopped) {
                process.stdout.write(`\r${frames[i]} ${message}`);
                i = (i + 1) % frames.length;
            }
        }, 80);

        return {
            stop: () => {
                stopped = true;
                clearInterval(interval);
                process.stdout.write('\r');
            }
        };
    };

    /**
     * @method input
     * @description Recoge un valor de CLI.
     * @param {string} question - Texto informativo.
     * @returns {Promise<string>} Valor recogido.
     * @example
     * const name = await shell.input("What's your name?");
     */
    public async input(question: string): Promise<string> {
        try {
            const result = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'value',
                    message: question,
                },
            ]);

            return result.value.trim();
        } catch (error: unknown) {
            throw new TyrError(`Se ha producido un error al lanzar la pregunta: ${question}`, error);
        }
    }

    /**
     * @method cd
     * @description Cambia el directorio de trabajo interno para los siguientes comandos ejecutados por esta instancia.
     * @param {string} path - Ruta absoluta o relativa a donde moverse.
     * @example
     * shell.cd('./backend');
     * await shell.exec('npm install'); // Se ejecuta dentro de /backend
     */
    public cd(path: string): void {
        let expandedPath = path;
        if (path.startsWith('~/')) {
            expandedPath = path.replace('~', homedir());
        } else if (path === '~') {
            expandedPath = homedir();
        }

        this.cwd = resolve(this.cwd, expandedPath);
    }
}

/**
 * @object ShellManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de ShellManager.
 */
export const ShellManagerTests = {
    exec: { command: 'node -v' },
    cd: { path: '/tmp' },
    input: { question: 'Ingrese un valor de prueba:' },
    showLoader: { message: 'Cargando prueba...' }
};