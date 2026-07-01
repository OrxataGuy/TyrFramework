import path from 'path';

import { FileSystemManager } from './FileSystemManager.js';
import { AIVendorManager, AIMessage } from './AIVendorManager.js';
import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

import { getEnvInt } from '../core/util/getenv.js';


const CONTEXT_FILENAMES = [
    'CLAUDE.md',
    'AGENTS.md',
    'CONTEXT.md',
    '.cursorrules',
    path.join('.github', 'copilot-instructions.md'),
];

const GENERATED_FILENAME = 'CLAUDE.md';

const SNAPSHOT_TREE_MAX_DEPTH =  getEnvInt('SNAPSHOT_TREE_MAX_DEPTH', 5);
const SNAPSHOT_TREE_MAX_ENTRIES_PER_DIR = getEnvInt('SNAPSHOT_TREE_MAX_ENTRIES_PER_DIR', 250);
const SNAPSHOT_SECTION_MAX_CHARS = getEnvInt('SNAPSHOT_SECTION_MAX_CHARS', 40000);

const DEFAULT_IGNORED_DIRS = new Set<string>([
    'node_modules', '.git', '.hg', '.svn',
    '.turbo', '.next', '.nuxt', '.cache', '.parcel-cache',
    '.vscode', '.idea',
    'dist', 'build', 'out', 'coverage', '.nyc_output',
    'target', 'vendor',
]);

const PACKAGE_JSON_FIELDS = ['name', 'version', 'type', 'dependencies', 'devDependencies', 'scripts'] as const;

const GUIDELINES_SYSTEM_PROMPT =
    'You are a senior software architect. Given a snapshot of a project (package manifest, README ' +
    'and file structure), produce a concise, well-structured Markdown file of coding guidelines and ' +
    'project conventions (stack, architecture, naming, testing, error handling) meant to be read by ' +
    'an AI coding assistant before making changes. Be specific to this project and avoid generic ' +
    'advice. Output only the Markdown content, with no surrounding commentary.';

interface GuidelinesBlock {
    fileName: string;
    content: string;
}

/**
 * @class AIContextManager
 * @description Encuentra, valida y lee los archivos de directrices del proyecto (CLAUDE.md,
 * AGENTS.md, etc.). Si no existen, escanea el proyecto (100% Node.js nativo, sin subprocesos de
 * shell) y le pide al vendor de IA configurado que genere un archivo de directrices óptimo.
 * Expone tanto el texto plano de las directrices (para sesiones de chat que gestionan su propia
 * ventana de contexto) como un mensaje de sistema listo para usar (para completions puntuales).
 */
export class AIContextManager {
    private fs: FileSystemManager;
    private ai: AIVendorManager;
    private logger: Logger;

    constructor(fs: FileSystemManager, ai: AIVendorManager, logger: Logger) {
        this.fs = fs;
        this.ai = ai;
        this.logger = logger;
    }

    /**
     * @method findContextFiles
     * @description Busca los archivos de directrices conocidos directamente dentro del directorio
     * del proyecto.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {string[]} Rutas absolutas de los archivos de directrices que existen.
     */
    public findContextFiles(dir: string): string[] {
        return CONTEXT_FILENAMES
            .map(name => path.join(dir, name))
            .filter(fullPath => this.fs.exists(fullPath));
    }

    private async readAndValidate(filePath: string): Promise<string | null> {
        const content = await this.fs.read(filePath);
        if (!content || !content.trim()) return null;
        return content.trim();
    }

    /**
     * @method buildPackageJsonSummary
     * @description Parsea package.json de forma segura (try/catch) y vuelve a serializar
     * únicamente los campos relevantes para el contexto arquitectónico. A diferencia de un
     * `.slice()` a ciegas, nunca entrega al vendor de IA un JSON truncado y sintácticamente roto.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {Promise<string | null>} Sección Markdown lista para el snapshot, o null si no
     * hay package.json legible o válido.
     */
    private async buildPackageJsonSummary(dir: string): Promise<string | null> {
        const pkgPath = path.join(dir, 'package.json');
        if (!this.fs.exists(pkgPath)) return null;

        const raw = await this.fs.read(pkgPath);
        if (!raw) return null;

        try {
            const parsed = JSON.parse(raw) as Record<string, unknown>;
            const summary: Record<string, unknown> = {};
            for (const field of PACKAGE_JSON_FIELDS) {
                if (parsed[field] !== undefined) summary[field] = parsed[field];
            }
            return `# package.json (summary)\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\``;
        } catch {
            this.logger.info(`package.json en ${pkgPath} no es JSON válido, se omite del snapshot.`);
            return null;
        }
    }

    /**
     * @method scanDirectoryTree
     * @description Escaneo recursivo de directorios agnóstico al SO usando la API nativa de
     * Node.js (sin subprocesos de shell, por lo que funciona igual en Windows, macOS y Linux).
     * Genera un árbol de texto indentado, ignora directorios de ruido y limita las entradas por
     * carpeta para que directorios con cientos de archivos generados no colapsen el snapshot.
     * @param {string} rootDir - Ruta absoluta desde la que empezar a escanear.
     * @param {number} maxDepth - Profundidad máxima de recursión.
     * @param {number} maxEntriesPerDir - Máximo de entradas listadas por carpeta antes de truncar.
     * @param {Set<string>} ignoredDirs - Nombres de directorios a omitir por completo.
     * @returns {Promise<string>} Representación en texto indentado del árbol.
     */
    private async scanDirectoryTree(
        rootDir: string,
        maxDepth: number = SNAPSHOT_TREE_MAX_DEPTH,
        maxEntriesPerDir: number = SNAPSHOT_TREE_MAX_ENTRIES_PER_DIR,
        ignoredDirs: Set<string> = DEFAULT_IGNORED_DIRS
    ): Promise<string> {
        const lines: string[] = [path.basename(rootDir) || rootDir];

        const walk = async (currentDir: string, depth: number, prefix: string): Promise<void> => {
            if (depth > maxDepth) return;

            let entries;
            try {
                entries = await this.fs.readdir(currentDir, { withFileTypes: true });
            } catch {
                // Errores de permisos o carpetas borradas a mitad de escaneo no deben abortar
                // todo el snapshot, simplemente se omiten.
                return;
            }

            entries = entries
                .filter(entry => !(entry.isDirectory() && ignoredDirs.has(entry.name)))
                .sort((a, b) => {
                    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

            const visible = entries.slice(0, maxEntriesPerDir);
            const hiddenCount = entries.length - visible.length;

            for (const entry of visible) {
                lines.push(`${prefix}${entry.name}${entry.isDirectory() ? '/' : ''}`);
                if (entry.isDirectory()) {
                    await walk(path.join(currentDir, entry.name), depth + 1, `${prefix}  `);
                }
            }

            if (hiddenCount > 0) {
                lines.push(`${prefix}… y ${hiddenCount} elemento(s) más`);
            }
        };

        await walk(rootDir, 1, '  ');
        return lines.join('\n');
    }

    /**
     * @method buildProjectSnapshot
     * @description Ensambla el material que necesita el vendor de IA para escribir directrices:
     * un resumen seguro de package.json, el README y un árbol de directorios nativo. Sin
     * subprocesos de shell.
     */
    private async buildProjectSnapshot(dir: string): Promise<string> {
        const parts: string[] = [];

        const pkgSummary = await this.buildPackageJsonSummary(dir);
        if (pkgSummary) parts.push(pkgSummary);

        const readmePath = path.join(dir, 'README.md');
        if (this.fs.exists(readmePath)) {
            const readme = await this.fs.read(readmePath);
            // El README es texto libre, no estructurado: aquí el truncado por longitud sí es seguro.
            if (readme) parts.push(`# README.md\n${readme.slice(0, SNAPSHOT_SECTION_MAX_CHARS)}`);
        }

        const tree = await this.scanDirectoryTree(dir).catch(() => '');
        if (tree) parts.push(`# Project structure\n${tree.slice(0, SNAPSHOT_SECTION_MAX_CHARS)}`);

        return parts.join('\n\n');
    }

    /**
     * @method generateContextFile
     * @description Escanea el proyecto y le pide al vendor de IA configurado que sintetice un
     * archivo de directrices, luego lo escribe como CLAUDE.md en la raíz del proyecto.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {Promise<string>} Ruta absoluta del archivo generado.
     */
    public async generateContextFile(dir: string): Promise<string> {
        this.logger.info('No se encontró archivo de contexto. Analizando el proyecto para generar uno...');

        const snapshot = await this.buildProjectSnapshot(dir);
        const messages: AIMessage[] = [
            { role: 'system', content: GUIDELINES_SYSTEM_PROMPT },
            { role: 'user', content: snapshot || 'The project has no readable package.json, README or file tree.' },
        ];

        let result;
        try {
            result = await this.ai.complete(messages, { temperature: 0.2 });
        } catch (err) {
            throw new TyrError(
                `No se pudo generar el archivo de contexto para ${dir}`,
                err,
                'Revisa la configuración de tu vendor de IA y la conectividad de red, luego reintenta.'
            );
        }

        const targetPath = path.join(dir, GENERATED_FILENAME);
        await this.fs.write(targetPath, result.content.trim() + '\n');

        this.logger.success(`Archivo de contexto generado en: ${targetPath}`);
        return targetPath;
    }

    /**
     * @method readGuidelines
     * @description Encuentra los archivos de directrices existentes (generando uno vía IA si no
     * hay ninguno), los lee y valida, y los devuelve como bloques discretos etiquetados — sin
     * colapsarlos en un único string de mensaje de sistema. Esta es la pieza clave para sesiones
     * de chat de larga duración: quien necesite gestionar una ventana de contexto continua (p. ej.
     * un AIChatSessionManager) puede inspeccionar, cachear o descartar bloques individuales en
     * lugar de releer disco y reinyectar un system prompt duplicado en cada turno.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {Promise<GuidelinesBlock[]>}
     */
    public async readGuidelines(dir: string): Promise<GuidelinesBlock[]> {
        let files = this.findContextFiles(dir);

        if (files.length === 0) {
            const generated = await this.generateContextFile(dir);
            files = [generated];
        }

        const blocks: GuidelinesBlock[] = [];
        for (const file of files) {
            const content = await this.readAndValidate(file);
            if (content) blocks.push({ fileName: path.basename(file), content });
        }

        if (blocks.length === 0) {
            throw new TyrError(
                `Se encontraron archivos de contexto pero están vacíos o son ilegibles en: ${dir}`,
                null,
                'Revisa el contenido de tu archivo CLAUDE.md/AGENTS.md.'
            );
        }

        return blocks;
    }

    /**
     * @method getGuidelinesText
     * @description Envoltorio de conveniencia sobre readGuidelines() que devuelve el texto plano
     * combinado de las directrices, sin envolver en roles/mensajes. Pensado para un
     * AIChatSessionManager: se obtiene una vez por sesión, se cachea, y se gestiona dentro de la
     * ventana de contexto de la conversación en lugar de llamar a getContext() (con su relectura
     * de disco y reenvío de un system message completo) en cada turno.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {Promise<string>}
     */
    public async getGuidelinesText(dir: string): Promise<string> {
        const blocks = await this.readGuidelines(dir);
        return blocks.map(b => `<!-- ${b.fileName} -->\n${b.content}`).join('\n\n');
    }

    /**
     * @method getContext
     * @description Punto de entrada para uso puntual: encuentra/genera archivos de directrices y
     * los empaqueta como un único mensaje 'system' listo para prepender a un prompt. Para sesiones
     * de chat continuas, usa getGuidelinesText() junto con tu propia gestión de ventana de contexto
     * en lugar de llamar a este método en cada turno.
     * @param {string} dir - Ruta absoluta a la raíz del proyecto.
     * @returns {Promise<AIMessage[]>}
     * @example
     * const contextMessages = await context.getContext(process.cwd());
     * const result = await ai.complete([...contextMessages, { role: 'user', content: 'Fix this bug...' }]);
     */
    public async getContext(dir: string): Promise<AIMessage[]> {
        const text = await this.getGuidelinesText(dir);
        return [{ role: 'system', content: text }];
    }
}

export const AIContextManagerTests = {
    findContextFiles: { dir: '~/Projects/TyrFramework' },
};