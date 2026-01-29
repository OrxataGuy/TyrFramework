import fs from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';
import { Logger } from '../core/Container.js'; // Ajusta la ruta si es necesario

/**
 * @class FileSystemManager
 * @description Capa de abstracción sobre el sistema de archivos (fs). 
 * Incluye utilidades de seguridad como backups automáticos al sobrescribir y escritura idempotente.
 */
export class FileSystemManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private resolvePath(filePath: string): string {
        return filePath.startsWith('~/')
            ? path.join(homedir(), filePath.slice(2))
            : filePath;
    }

    /**
     * @method exists
     * @description Verifica de forma síncrona si un archivo o directorio existe en la ruta dada.
     * @param {string} filePath - Ruta relativa o absoluta a verificar.
     * @returns {Promise<boolean>} True si el archivo existe.
     * @example
     * if (await fs.exists('./config.json')) {
     *  console.log("Configuración encontrada");
     * }
     */
    public exists(filePath: string): boolean {
        const resolvedPath = this.resolvePath(filePath);
        return existsSync(resolvedPath);
    }

    /**
     * @method read
     * @description Lee el contenido de un archivo en formato UTF-8. Controla errores devolviendo null si falla.
     * @param {string} filePath - Ruta al archivo.
     * @returns {Promise<string|null>} El contenido del archivo o null si hubo error.
     * @example
     * const content = await fs.read('.env');
     * console.log(content);
     */
    public async read(filePath: string): Promise<string | null> {
        try {
            const resolvedPath = this.resolvePath(filePath);
            return await fs.readFile(resolvedPath, 'utf-8');
        } catch (e) {
            return null;
        }
    }

    /**
     * @method delete
     * @description Elimina un archivo si existe. Registra el éxito o fallo en el logger.
     * @param {string} filePath - Ruta al archivo a eliminar.
     * @example
     * await fs.delete('./temp/cache.log');
     */
    public async delete(filePath: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);

        if (this.exists(resolvedPath)) {
            await fs.unlink(resolvedPath);
            this.logger.success(`Archivo eliminado: ${filePath}`);
        } else {
            this.logger.warn(`No se pudo borrar: ${filePath} (No existe)`);
        }
    }

    /**
     * @method write
     * @description Escribe contenido en un archivo. Si el archivo ya existe, crea una copia .bak automáticamente antes de sobrescribir.
     * @param {string} filePath - Ruta de destino.
     * @param {string} content - Contenido de texto a escribir.
     * @example
     * await fs.write('src/config.js', 'export const port = 3000;');
     */
    public async write(filePath: string, content: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);

        // Crear directorio padre si no existe
        const dir = path.dirname(resolvedPath);
        await fs.mkdir(dir, { recursive: true });

        // Backup si el archivo ya existe
        if (this.exists(resolvedPath)) {
            const backupPath = `${resolvedPath}.bak`;
            await fs.copyFile(resolvedPath, backupPath);
            this.logger.info(`Backup creado en: ${backupPath}`);
        }

        // Escribir usando la ruta resuelta
        await fs.writeFile(resolvedPath, content, 'utf-8');
        this.logger.success(`Archivo escrito: ${filePath}`);
    }

    /**
     * @method createDir
     * @description Crea un directorio de forma recursiva (como mkdir -p). No hace nada si ya existe.
     * @param {string} path - Ruta del directorio a crear.
     * @example
     * await fs.createDir('src/controllers/api/v1');
     */
    public async createDir(dirPath: string): Promise<void> {
        const resolvedPath = this.resolvePath(dirPath);

        if (!this.exists(resolvedPath)) {
            await fs.mkdir(resolvedPath, { recursive: true });
            this.logger.info(`Directorio creado: ${dirPath}`);
        }
    }

    /**
     * @method ensureLine
     * @description Asegura que una línea de texto específica exista en un archivo. Útil para añadir variables de entorno o configuraciones sin duplicarlas.
     * @param {string} filePath - Ruta al archivo.
     * @param {string} line - La línea exacta que se desea asegurar.
     * @example
     * // Añadir puerto si no está
     * await fs.ensureLine('.env', 'PORT=8080');
     */
    public async ensureLine(filePath: string, line: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);

        const content = (await this.read(resolvedPath)) || '';
        if (content.includes(line)) {
            this.logger.info(`Línea ya existente en ${filePath}. Saltando.`);
            return;
        }

        const newContent = content.endsWith('\n') ? content + line : content + '\n' + line;
        await this.write(filePath, newContent);
    }
}

/**
 * @object FileSystemManagerTests
 * @description Parámetros de pruebas para validar la funcionalidad de FileSystemManager.
 */
const testFile = '~/Projects/TyrFramework/package.json';
const testFileWrite = '~/Projects/TyrFramework/tests/foo.test.txt';

export const FileSystemManagerTests = {
    exists: { filePath: testFile },
    read: { filePath: testFile },
    write: { filePath: testFileWrite, content: 'Test content from TyrFramework' },
    delete: { filePath: testFileWrite },
    ensureLine: { filePath: testFile, line: '"type": "module",' }
};