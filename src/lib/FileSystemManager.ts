import fs from 'fs/promises';
import { existsSync } from 'fs';
import { homedir } from 'os';
import path from 'path';

import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

/**
 * @class FileSystemManager
 * @description Abstraction layer over the file system (fs).
 * Includes safety utilities such as automatic backups when overwriting and idempotent writes.
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
     * @description Synchronously checks whether a file or directory exists at the given path.
     * @param {string} filePath - Relative or absolute path to check.
     * @returns {boolean} True if the file exists.
     * @example
     * if (fs.exists('./config.json')) {
     *   logger.info('Config found.');
     * }
     */
    public exists(filePath: string): boolean {
        const resolvedPath = this.resolvePath(filePath);
        return existsSync(resolvedPath);
    }

    /**
     * @method read
     * @description Reads the content of a file in UTF-8 format. Returns null if the file does not exist.
     * @param {string} filePath - Path to the file.
     * @returns {Promise<string|null>} File content or null if it does not exist.
     * @example
     * const content = await fs.read('.env');
     */
    public async read(filePath: string): Promise<string | null> {
        const resolvedPath = this.resolvePath(filePath);
        try {
            return await fs.readFile(resolvedPath, 'utf-8');
        } catch (e) {
            if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null;
            throw new TyrError(`Could not read file: ${filePath}`, e, 'Check that the file exists and has read permissions.');
        }
    }

    /**
     * @method delete
     * @description Deletes a file if it exists.
     * @param {string} filePath - Path to the file to delete.
     * @example
     * await fs.delete('./temp/cache.log');
     */
    public async delete(filePath: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);
        if (!this.exists(resolvedPath)) {
            throw new TyrError(`Cannot delete: file not found: ${filePath}`, null, 'Check that the path is correct.');
        }
        try {
            await fs.unlink(resolvedPath);
            this.logger.success(`File deleted: ${filePath}`);
        } catch (e) {
            throw new TyrError(`Could not delete file: ${filePath}`, e);
        }
    }

    /**
     * @method write
     * @description Writes content to a file. If the file already exists, creates a .bak backup before overwriting.
     * @param {string} filePath - Destination path.
     * @param {string} content - Text content to write.
     * @example
     * await fs.write('src/config.js', 'export const port = 3000;');
     */
    public async write(filePath: string, content: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);
        try {
            const dir = path.dirname(resolvedPath);
            await fs.mkdir(dir, { recursive: true });

            if (this.exists(resolvedPath)) {
                const backupPath = `${resolvedPath}.bak`;
                await fs.copyFile(resolvedPath, backupPath);
                this.logger.info(`Backup created at: ${backupPath}`);
            }

            await fs.writeFile(resolvedPath, content, 'utf-8');
            this.logger.success(`File written: ${filePath}`);
        } catch (e) {
            if (e instanceof TyrError) throw e;
            throw new TyrError(`Could not write file: ${filePath}`, e, 'Check write permissions on the destination directory.');
        }
    }

    /**
     * @method createDir
     * @description Creates a directory recursively (like mkdir -p). Does nothing if it already exists.
     * @param {string} dirPath - Path of the directory to create.
     * @example
     * await fs.createDir('src/controllers/api/v1');
     */
    public async createDir(dirPath: string): Promise<void> {
        const resolvedPath = this.resolvePath(dirPath);
        if (this.exists(resolvedPath)) return;
        try {
            await fs.mkdir(resolvedPath, { recursive: true });
            this.logger.info(`Directory created: ${dirPath}`);
        } catch (e) {
            throw new TyrError(`Could not create directory: ${dirPath}`, e, 'Check write permissions on the parent directory.');
        }
    }

    /**
     * @method ensureLine
     * @description Ensures that a specific line exists in a file. Useful for adding environment variables or config entries without duplicating them.
     * @param {string} filePath - Path to the file.
     * @param {string} line - The exact line to ensure.
     * @example
     * await fs.ensureLine('.env', 'PORT=8080');
     */
    public async ensureLine(filePath: string, line: string): Promise<void> {
        const resolvedPath = this.resolvePath(filePath);
        const content = (await this.read(resolvedPath)) || '';
        if (content.includes(line)) {
            this.logger.info(`Line already present in ${filePath}. Skipping.`);
            return;
        }
        const newContent = content.endsWith('\n') ? content + line : content + '\n' + line;
        await this.write(filePath, newContent);
    }
}

export const FileSystemManagerTests = {
    exists: { filePath: '~/Projects/TyrFramework/package.json' },
    read:   { filePath: '~/Projects/TyrFramework/package.json' },
    write:  { filePath: '~/Projects/TyrFramework/tests/foo.test.txt', content: 'Test content from TyrFramework' },
    delete: { filePath: '~/Projects/TyrFramework/tests/foo.test.txt' },
    ensureLine: { filePath: '~/Projects/TyrFramework/package.json', line: '"type": "module",' },
};
