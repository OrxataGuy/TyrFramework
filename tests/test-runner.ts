#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';
import { Logger } from '../src/core/Container.js';
import { TyrContext } from '../src/core/Kernel.js';
import { ShellManager } from '../src/lib/ShellManager.js';
import { FileSystemManager } from '../src/lib/FileSystemManager.js';
import { PackageManager } from '../src/lib/PackageManager.js';
import { DockerManager } from '../src/lib/DockerManager.js';
import { GitManager } from '../src/lib/GitManager.js';
import { SystemManager } from '../src/lib/SystemManager.js';
import { SQLManager } from '../src/lib/SQLManager.js';
import { WebManager } from '../src/lib/WebManager.js';

// Importar los test parameter objects
import { DockerManagerTests } from '../src/lib/DockerManager.js';
import { FileSystemManagerTests } from '../src/lib/FileSystemManager.js';
import { GitManagerTests } from '../src/lib/GitManager.js';
import { PackageManagerTests } from '../src/lib/PackageManager.js';
import { SQLManagerTests } from '../src/lib/SQLManager.js';
import { SystemManagerTests } from '../src/lib/SystemManager.js';
import { WebManagerTests } from '../src/lib/WebManager.js';
import { ShellManagerTests } from '../src/lib/ShellManager.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
    command: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    error?: string;
    details?: string;
    file?: string;
    timestamp?: number;
    executionTime?: number;
    mockOutputs?: string[];
}

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

type CommandFunction = (args: string[]) => Promise<void>;
type CommandFactory = (context: TyrContext) => CommandFunction;

/**
 * Utilidades para generar datos de prueba realistas
 */
class TestDataGenerator {
    static generateRandomId(length: number = 12): string {
        const chars = '0123456789abcdef';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    static generateCommitHash(): string {
        return this.generateRandomId(40);
    }

    static generateContainerId(): string {
        return this.generateRandomId(12);
    }

    static generatePort(): number {
        return Math.floor(Math.random() * (65535 - 1024) + 1024);
    }

    static generateFileContent(lines: number = 5): string {
        const sampleLines = [
            '// Configuration file',
            'export const config = { port: 3000 };',
            'import express from "express";',
            'const app = express();',
            'app.listen(3000);',
            'console.log("Server running");'
        ];
        const result: string[] = [];
        for (let i = 0; i < lines; i++) {
            result.push(sampleLines[Math.floor(Math.random() * sampleLines.length)]);
        }
        return result.join('\n');
    }

    static generateProcessId(): number {
        return Math.floor(Math.random() * (65535 - 1000) + 1000);
    }

    static generateImageName(): string {
        const images = ['node:20-alpine', 'postgres:15', 'redis:7', 'nginx:latest', 'mongo:6'];
        return images[Math.floor(Math.random() * images.length)];
    }

    static generateHtmlContent(): string {
        return `<!DOCTYPE html>
<html>
<head><title>Test Page</title></head>
<body>
  <h1>Sample Content</h1>
  <p>Generated at ${new Date().toISOString()}</p>
</body>
</html>`;
    }
}

class TyrTestRunner {
    private frameworkRoot: string;
    private config: TyrConfig | null = null;
    private results: TestResult[] = [];
    private testStartTime: number = Date.now();
    private capturedLogs: string[] = [];
    private mockContext: TyrContext;

    constructor() {
        this.frameworkRoot = path.resolve(__dirname, '..');
        this.mockContext = this.createMockContext();
    }

    /**
     * Crea un contexto simulado con todas las dependencias mockeadas
     * Tipado según TyrContext del Kernel
     */
    private createMockContext(): TyrContext {
        const mockLogger: Logger = {
            log: (...args: unknown[]) => console.log('[LOG]', ...args),
            info: (...args: unknown[]) => console.log('[ℹ️  INFO]', ...args),
            success: (...args: unknown[]) => console.log('[✅ SUCCESS]', ...args),
            error: (...args: unknown[]) => console.error('[❌ ERROR]', ...args),
            warn: (...args: unknown[]) => console.warn('[⚠️  WARN]', ...args),
        };

        // Mock ShellManager - Simula ejecución real de comandos
        const mockShell: Partial<ShellManager> = {
            cd: (dir: string): void => {
                console.log(`   → cd ${dir}`);
            },
            exec: async (cmd: string): Promise<string> => {
                console.log(`   → exec: ${cmd}`);
                // Simular diferentes comandos
                if (cmd.includes('--version') || cmd.includes('-v')) {
                    const versions: Record<string, string> = {
                        'node': 'v20.10.0',
                        'npm': '10.2.3',
                        'git': 'git version 2.43.0',
                        'docker': 'Docker version 24.0.7'
                    };
                    for (const [key, val] of Object.entries(versions)) {
                        if (cmd.includes(key)) return val;
                    }
                    return 'v1.0.0';
                }
                if (cmd.includes('which')) {
                    return '/usr/local/bin/' + cmd.split('which ')[1];
                }
                return TestDataGenerator.generateRandomId(16);
            },
            input: async (prompt: string): Promise<string> => {
                console.log(`   → user input: "${prompt}"`);
                const responses = ['default-response', 'y', 'main', 'v1.0.0'];
                return responses[Math.floor(Math.random() * responses.length)];
            },
            showLoader: (msg: string) => {
                console.log(`   ⏳ ${msg}...`);
                return {
                    stop: (): void => console.log(`   ✓ ${msg} completed`)
                };
            }
        };

        // Mock FileSystemManager - Simula operaciones de archivo
        const mockFs: Partial<FileSystemManager> = {
            exists: (filePath: string): boolean => {
                // Paths que siempre deben retornar true en tests
                const requiredPaths = [
                    '/Projects/TyrFramework',
                    '/avantio/framework',
                    '/.zshrc'
                ];
                
                // Verificar si el path contiene alguno de los requeridos
                const isRequired = requiredPaths.some(p => filePath.includes(p));
                const exists = isRequired ? true : Math.random() > 0.3; // Si es requerido, siempre true
                console.log(`   📁 exists("${filePath}") → ${exists}`);
                return exists;
            },
            read: async (filePath: string): Promise<string | null> => {
                // Los templates siempre deben existir y retornar contenido válido
                const isTemplate = filePath.includes('template');
                const isConfig = filePath.includes('config') || filePath.includes('zshrc') || filePath.includes('.sh');
                
                if (isTemplate || isConfig) {
                    // Generar contenido realista para templates y configs
                    let content = '';
                    if (filePath.includes('aliases')) {
                        content = '#!/bin/bash\n# Alias definitions\nalias ll="ls -la"\nalias tyre="cd ~/Projects/TyrFramework && npm run dev"\n';
                    } else if (filePath.includes('plugins')) {
                        content = '#!/bin/bash\n# Plugin loader\n# Load custom plugins\nfor plugin in ~/.plugins/*; do source $plugin; done\n';
                    } else if (filePath.includes('zshrc')) {
                        content = '# Zsh configuration\nexport PATH=$PATH:~/.local/bin\nsource ~/.zprofile\n';
                    } else {
                        content = TestDataGenerator.generateFileContent(Math.floor(Math.random() * 5) + 2);
                    }
                    console.log(`   📖 read("${filePath}") → ${content.split('\n').length} lines`);
                    return content;
                }
                
                // Para otros archivos, tener 80% de probabilidad de éxito
                const exists = Math.random() > 0.2;
                if (exists) {
                    const content = TestDataGenerator.generateFileContent(Math.floor(Math.random() * 5) + 2);
                    console.log(`   📖 read("${filePath}") → ${content.split('\n').length} lines`);
                    return content;
                }
                console.log(`   📖 read("${filePath}") → null (not found)`);
                return null;
            },
            write: async (filePath: string, content: string): Promise<void> => {
                const size = (content.length / 1024).toFixed(2);
                console.log(`   ✍️  write("${filePath}") → ${size} KB`);
            },
            createDir: async (dirPath: string): Promise<void> => {
                console.log(`   📂 mkdir -p "${dirPath}"`);
            },
            delete: async (filePath: string): Promise<void> => {
                console.log(`   🗑️  delete("${filePath}")`);
            },
            ensureLine: async (filePath: string, line: string): Promise<void> => {
                const lineNum = Math.floor(Math.random() * 100) + 1;
                console.log(`   📝 ensureLine("${filePath}", line ${lineNum})`);
            }
        };

        // Mock SQLManager - Simula operaciones de base de datos
        const mockDb: any = {
            disconnect: async (): Promise<void> => {
                console.log(`   🔌 disconnect()`);
            },
            execute: async (sql: string): Promise<void> => {
                const affectedRows = Math.floor(Math.random() * 100) + 1;
                const sanitized = sql.substring(0, 50) + (sql.length > 50 ? '...' : '');
                console.log(`   📊 execute("${sanitized}") → ${affectedRows} rows affected`);
            }
        };

        // Mock GitManager - Simula operaciones de git
        const mockGit: Partial<GitManager> = {
            clone: async (url: string): Promise<void> => {
                const repoName = url.split('/').pop()?.replace('.git', '') || 'repo';
                console.log(`   📥 clone("${repoName}") → ${TestDataGenerator.generateRandomId(8)}`);
            },
            init: async (): Promise<void> => {
                console.log(`   🔧 init() → Initialized empty Git repository`);
            },
            commit: async (message: string): Promise<void> => {
                const hash = TestDataGenerator.generateCommitHash();
                console.log(`   💾 commit("${message.substring(0, 30)}...") → ${hash.substring(0, 7)}`);
            },
            addAll: async (): Promise<void> => {
                const filesCount = Math.floor(Math.random() * 20) + 1;
                console.log(`   📦 addAll() → ${filesCount} files staged`);
            }
        };

        // Mock DockerManager - Simula operaciones de Docker
        const mockDocker: any = {
            run: async (): Promise<void> => {
                const image = TestDataGenerator.generateImageName();
                const cid = TestDataGenerator.generateContainerId();
                const port = TestDataGenerator.generatePort();
                console.log(`   🐳 run("${image}") → container ${cid} on port ${port}`);
            },
            stop: async (): Promise<void> => {
                const cid = TestDataGenerator.generateContainerId();
                console.log(`   🛑 stop("${cid}") → stopped`);
            },
            build: async (): Promise<void> => {
                const time = Math.floor(Math.random() * 30) + 5;
                console.log(`   🔨 build() → completed in ${time}s`);
            },
            isRunning: async (): Promise<boolean> => {
                const running = Math.random() > 0.3;
                console.log(`   🔍 isRunning() → ${running ? 'running' : 'stopped'}`);
                return running;
            },
            containerExists: async (): Promise<boolean> => {
                const exists = Math.random() > 0.4;
                console.log(`   🔍 containerExists() → ${exists ? 'exists' : 'not found'}`);
                return exists;
            },
            composeUp: async (): Promise<void> => {
                const services = Math.floor(Math.random() * 5) + 1;
                console.log(`   🐳 composeUp() → ${services} services running`);
            }
        };

        // Mock WebManager - Simula descargas web
        const mockWeb: Partial<WebManager> = {
            selectFromWeb: async (url: string, selector: ($: any) => any): Promise<string[]> => {
                const htmlContent = TestDataGenerator.generateHtmlContent();
                const elemCount = Math.floor(Math.random() * 10) + 1;
                console.log(`   🌐 selectFromWeb("${url.substring(0, 40)}...") → ${elemCount} elements`);
                return Array.from({ length: elemCount }, () => `<element>${TestDataGenerator.generateRandomId(8)}</element>`);
            }
        };

        // Mock PackageManager - Simula instalación de paquetes
        const mockPkg: Partial<PackageManager> = {
            install: async (packageName: string): Promise<void> => {
                const version = `${Math.floor(Math.random() * 10)}.${Math.floor(Math.random() * 20)}.${Math.floor(Math.random() * 30)}`;
                const size = (Math.random() * 50).toFixed(1);
                console.log(`   📦 install("${packageName}@${version}") → ${size} MB`);
            },
            detect: async (): Promise<string> => {
                const managers = ['npm', 'yarn', 'pnpm'];
                const detected = managers[Math.floor(Math.random() * managers.length)];
                console.log(`   🔍 detect() → ${detected}`);
                return detected;
            }
        };

        // Mock SystemManager - Simula operaciones del sistema
        const mockSys: Partial<SystemManager> = {
            killPort: async (port: number | string): Promise<boolean> => {
                const killed = Math.random() > 0.3;
                const pid = TestDataGenerator.generateProcessId();
                console.log(`   ⚔️  killPort(${port}) → PID ${pid} ${killed ? 'killed' : 'not found'}`);
                return killed;
            },
            nukeNodeModules: async (): Promise<void> => {
                const size = (Math.random() * 500 + 100).toFixed(0);
                console.log(`   💥 nukeNodeModules() → removed ${size} MB`);
            }
        };

        // Crear el contexto tipado según TyrContext
        const context: TyrContext = {
            frameworkRoot: this.frameworkRoot,
            logger: mockLogger,
            shell: mockShell as any,
            fs: mockFs as any,
            docker: mockDocker as any,
            run: async (commandName: string, args?: string[]): Promise<void> => {
                console.log(`   ▶️  run("${commandName}") with args: [${args?.join(', ')}]`);
            },
            task: async <T,>(
                description: string,
                action: () => Promise<T> | T,
                next?: boolean,
                onFail?: () => void
            ): Promise<T | undefined> => {
                console.log(`   📋 task("${description}")`);
                try {
                    return await action();
                } catch (e) {
                    if (onFail) onFail();
                    if (!next) throw e;
                }
            },
            fail: (msg: string, suggestion?: string): never => {
                const error = new Error(msg);
                (error as any).suggestion = suggestion;
                throw error;
            },
            // Incluir todos los managers en el contexto
            db: mockDb as any,
            git: mockGit as any,
            web: mockWeb as any,
            pkg: mockPkg as any,
            sys: mockSys as any
        };

        return context;
    }

    /**
     * Carga la configuración del framework
     */
    private async loadConfig(): Promise<void> {
        const configPath = path.resolve(this.frameworkRoot, 'config/map.yml');

        if (!fs.existsSync(configPath)) {
            throw new Error(`No se encuentra el archivo de configuración: ${configPath}`);
        }

        const fileContents = fs.readFileSync(configPath, 'utf8');
        this.config = yaml.load(fileContents) as TyrConfig;
    }

    /**
     * Prueba un comando específico
     */
    private async testCommand(commandName: string, scriptPath: string): Promise<TestResult> {
        const result: TestResult = {
            command: commandName,
            status: 'PASS',
            file: scriptPath
        };

        try {
            const absolutePath = path.resolve(this.frameworkRoot, scriptPath);

            // Verificar que el archivo existe
            if (!fs.existsSync(absolutePath)) {
                result.status = 'FAIL';
                result.error = `Archivo no encontrado: ${absolutePath}`;
                return result;
            }

            // Intentar cargar el módulo
            console.log(`\n📦 Cargando comando: ${commandName}`);
            console.log(`   Archivo: ${scriptPath}`);

            const module = await import(absolutePath);

            // Verificar que tiene export default
            if (typeof module.default !== 'function') {
                result.status = 'FAIL';
                result.error = `El módulo no exporta una función por defecto`;
                return result;
            }

            // Intentar instanciar el comando con el contexto mock
            console.log(`   [OK] - Módulo cargado correctamente`);
            const commandFactory: CommandFactory = module.default;

            try {
                const command: CommandFunction = commandFactory(this.mockContext);

                if (typeof command !== 'function') {
                    result.status = 'FAIL';
                    result.error = `La factory no devuelve una función`;
                    return result;
                }

                console.log(`   [OK] - Factory ejecutada correctamente`);

                // Intentar ejecutar el comando en modo dry-run (sin argumentos)
                // Esto puede fallar por validaciones, pero no debería lanzar excepciones no controladas
                try {
                    console.log(`   Probando ejecución con argumentos vacíos...`);
                    await command([]);
                    console.log(`   [OK] - Comando ejecutado sin excepciones`);
                } catch (e: unknown) {
                    const error = e as Error;
                    // Si falla por validación de argumentos, está OK
                    if (error.message && error.message.includes('No se especificó')) {
                        console.log(`   [OK] - Validación de argumentos funcionando`);
                        result.details = 'Comando requiere argumentos (esperado)';
                    } else {
                        // Cualquier otro error puede ser problemático
                        result.status = 'FAIL';
                        result.error = `Error al ejecutar: ${error.message}`;
                        result.details = error.stack;
                    }
                }

            } catch (e: unknown) {
                const error = e as Error;
                result.status = 'FAIL';
                result.error = `Error al instanciar comando: ${error.message}`;
                result.details = error.stack;
                return result;
            }

        } catch (e: unknown) {
            const error = e as Error;
            result.status = 'FAIL';
            result.error = `Error al cargar módulo: ${error.message}`;
            result.details = error.stack;
        }

        return result;
    }

    /**
     * Prueba los comandos del sistema (gen, rem, doc)
     */
    private async testSystemCommands(): Promise<void> {
        const systemCommands = ['gen', 'rem', 'doc'];

        for (const cmdName of systemCommands) {
            const scriptPath = `src/core/sys/${cmdName}.ts`;
            const result = await this.testCommand(cmdName, scriptPath);
            this.results.push(result);
        }
    }

    /**
     * Ejecuta tests de los managers usando los datos de prueba definidos
     */
    private async testManagers(): Promise<void> {
        console.log('\n🧪 Probando Managers...\n');

        // Crear instancias de managers con el logger mock
        const mockLogger = this.mockContext.logger;
        const mockShell = new ShellManager();
        
        const managers = [
            { 
                name: 'ShellManager', 
                instance: new ShellManager(),
                tests: ShellManagerTests 
            },
            { 
                name: 'FileSystemManager', 
                instance: new FileSystemManager(mockLogger),
                tests: FileSystemManagerTests 
            },
            { 
                name: 'DockerManager', 
                instance: new DockerManager(mockShell, mockLogger),
                tests: DockerManagerTests 
            },
            { 
                name: 'GitManager', 
                instance: new GitManager(mockShell, mockLogger),
                tests: GitManagerTests 
            },
            { 
                name: 'PackageManager', 
                instance: new PackageManager(mockShell, mockLogger),
                tests: PackageManagerTests 
            },
            { 
                name: 'SQLManager', 
                instance: new SQLManager(),
                tests: SQLManagerTests 
            },
            { 
                name: 'SystemManager', 
                instance: new SystemManager(mockShell, mockLogger),
                tests: SystemManagerTests 
            },
            { 
                name: 'WebManager', 
                instance: new WebManager(mockLogger),
                tests: WebManagerTests 
            }
        ];

        for (const manager of managers) {
            console.log(`\n📦 ${manager.name}:`);
            
            const testEntries = Object.entries(manager.tests);
            const testResults: { name: string; status: 'PASS' | 'FAIL'; error?: string }[] = [];
            
            // Ejecutar cada test definido en los TestParams
            for (const [testName, testParams] of testEntries) {
                console.log(`   🧪 ${testName}...`);
                
                try {
                    // Obtener el método del manager
                    const method = (manager.instance as any)[testName];
                    
                    if (typeof method !== 'function') {
                        console.log(`      ⚠️  No es una función (propiedades: ${Object.keys(testParams).join(', ')})`);
                        testResults.push({ name: testName, status: 'FAIL', error: 'No es una función' });
                        continue;
                    }

                    // Ejecutar el método con los parámetros definidos en los Tests
                    // Si los parámetros están vacíos, ejecutar sin argumentos
                    // Si tienen propiedades, pasarlas como objeto (destructurado si tiene una propiedad) o como argumentos
                    const paramValues = Object.values(testParams as Record<string, unknown>);
                    const hasParams = paramValues.length > 0;
                    
                    let result: unknown;
                    if (hasParams) {
                        // Si es un único objeto, pasarlo como tal
                        result = await method.call(manager.instance, testParams);
                    } else {
                        // Sin parámetros
                        result = await method.call(manager.instance);
                    }
                    
                    console.log(`      ✅ ${testName} passed`);
                    testResults.push({ name: testName, status: 'PASS' });
                } catch (testError: unknown) {
                    const error = testError as Error;
                    const errorMsg = error.message || 'Error desconocido';
                    console.log(`      ❌ ${testName} failed: ${errorMsg}`);
                    testResults.push({ name: testName, status: 'FAIL', error: errorMsg });
                }
            }
            
            // Determinar el estado general del manager basado en los resultados individuales
            const failedTests = testResults.filter(r => r.status === 'FAIL');
            const passedTests = testResults.filter(r => r.status === 'PASS');
            const overallStatus = failedTests.length === 0 ? 'PASS' : 'FAIL';
            
            const summary = `${passedTests.length}/${testResults.length} tests passed`;
            const errorDetails = failedTests.length > 0 
                ? failedTests.map(f => `${f.name}: ${f.error}`).join('; ')
                : undefined;
            
            this.results.push({
                command: `${manager.name}`,
                status: overallStatus,
                details: summary,
                error: errorDetails,
                file: `src/lib/${manager.name}.ts`
            });
        }
    }

    /**
     * Ejecuta todas las pruebas
     */
    public async runAllTests(): Promise<void> {
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║   TYR FRAMEWORK - SMOKE TESTING                      ║');
        console.log('╚═══════════════════════════════════════════════════════╝\n');

        try {
            // Cargar configuración
            console.log('📋 Cargando configuración...');
            await this.loadConfig();
            console.log('[OK] - Configuración cargada\n');

            // Probar managers
            await this.testManagers();

            // Probar comandos del sistema
            console.log('\n🔧 Probando comandos del sistema...');
            await this.testSystemCommands();

            // Probar comandos personalizados
            if (this.config && this.config.commands) {
                console.log('\n📝 Probando comandos personalizados...');

                for (const [commandName, scriptPath] of Object.entries(this.config.commands)) {
                    const result = await this.testCommand(commandName, scriptPath);
                    this.results.push(result);
                }
            }

            // Probar aliases
            if (this.config && this.config.aliases) {
                console.log('\n🔗 Verificando aliases...');

                for (const [alias, target] of Object.entries(this.config.aliases)) {
                    const targetPath: string | undefined = this.config.commands?.[target];
                    if (!targetPath) {
                        this.results.push({
                            command: `${alias} (alias)`,
                            status: 'FAIL',
                            error: `Alias apunta a comando inexistente: ${target}`
                        });
                    } else {
                        this.results.push({
                            command: `${alias} (alias → ${target})`,
                            status: 'PASS',
                            details: `Apunta correctamente a ${target}`
                        });
                    }
                }
            }

        } catch (e: unknown) {
            const error = e as Error;
            console.error('\n❌ Error crítico durante las pruebas:', error.message);
            process.exit(1);
        }
    }

    /**
     * Genera archivo de log con resultados del test
     */
    private async generateLogFile(): Promise<void> {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').split('Z')[0];
        const logFileName = `test-results-${timestamp}.log`;
        const logFilePath = path.join(this.frameworkRoot, 'tests', logFileName);

        const passed: number = this.results.filter(r => r.status === 'PASS').length;
        const failed: number = this.results.filter(r => r.status === 'FAIL').length;
        const skipped: number = this.results.filter(r => r.status === 'SKIP').length;
        const total: number = this.results.length;
        const successRate = total > 0 ? ((passed / total) * 100).toFixed(2) : '0.00';
        const duration = Date.now() - this.testStartTime;

        let logContent = '';
        logContent += `${'═'.repeat(60)}\n`;
        logContent += `  TYR FRAMEWORK - TEST RESULTS LOG\n`;
        logContent += `${'═'.repeat(60)}\n\n`;
        
        logContent += `📋 INFORMACIÓN DEL TEST\n`;
        logContent += `${'-'.repeat(60)}\n`;
        logContent += `Fecha/Hora:     ${new Date().toLocaleString()}\n`;
        logContent += `Duración:       ${duration}ms\n`;
        logContent += `Archivo Log:    ${logFileName}\n\n`;

        logContent += `📊 RESULTADOS GENERALES\n`;
        logContent += `${'-'.repeat(60)}\n`;
        logContent += `Total Tests:    ${total}\n`;
        logContent += `✅ Pasaron:      ${passed}\n`;
        logContent += `❌ Fallaron:     ${failed}\n`;
        logContent += `⚠️  Saltados:     ${skipped}\n`;
        logContent += `📈 Tasa Éxito:   ${successRate}%\n\n`;

        logContent += `🧪 DETALLE DE TESTS\n`;
        logContent += `${'-'.repeat(60)}\n\n`;

        this.results.forEach((result: TestResult, index: number) => {
            const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            logContent += `${index + 1}. ${icon} ${result.command}\n`;
            logContent += `   Estado:     ${result.status}\n`;

            if (result.file) {
                logContent += `   Archivo:    ${result.file}\n`;
            }

            if (result.details && result.status !== 'FAIL') {
                logContent += `   Detalles:   ${result.details}\n`;
            }

            if (result.error) {
                logContent += `   Error:      ${result.error}\n`;
                if (result.details && result.status === 'FAIL') {
                    const stackPreview = result.details.substring(0, 150).replace(/\n/g, '\n              ');
                    logContent += `   Stack:      ${stackPreview}...\n`;
                }
            }

            logContent += `\n`;
        });

        logContent += `\n${'-'.repeat(60)}\n`;
        logContent += `Generado: ${new Date().toISOString()}\n`;

        try {
            await fs.promises.writeFile(logFilePath, logContent, 'utf-8');
            console.log(`\n📝 Log guardado: tests/${logFileName}`);
        } catch (error) {
            console.error(`❌ Error al guardar log: ${error}`);
        }
    }

    /**
     * Genera el reporte final
     */
    public async printReport(): Promise<void> {
        console.log('\n\n');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║              REPORTE DE RESULTADOS                   ║');
        console.log('╚═══════════════════════════════════════════════════════╝\n');

        const passed: number = this.results.filter(r => r.status === 'PASS').length;
        const failed: number = this.results.filter(r => r.status === 'FAIL').length;
        const skipped: number = this.results.filter(r => r.status === 'SKIP').length;
        const total: number = this.results.length;

        // Resultados individuales
        this.results.forEach((result: TestResult) => {
            const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`${icon} ${result.command}`);

            if (result.file) {
                console.log(`   📄 ${result.file}`);
            }

            if (result.executionTime) {
                console.log(`   ⏱️  ${result.executionTime}ms`);
            }

            if (result.details && result.status !== 'FAIL') {
                console.log(`   ℹ️  ${result.details}`);
            }

            if (result.error) {
                console.log(`   ❌ ${result.error}`);
                if (result.details && result.status === 'FAIL') {
                    console.log(`   📋 Detalles:`);
                    console.log(`      ${result.details.split('\n').slice(0, 3).join('\n      ')}`);
                }
            }
            console.log('');
        });

        // Resumen
        console.log('─'.repeat(60));
        console.log(`📊 RESUMEN:`);
        console.log(`   Total:    ${total}`);
        console.log(`   ✅ Pasaron:  ${passed}`);
        console.log(`   ❌ Fallaron: ${failed}`);
        console.log(`   ⚠️  Saltados: ${skipped}`);
        console.log(`   📈 Tasa de éxito: ${((passed / total) * 100).toFixed(2)}%`);
        console.log('─'.repeat(60));

        if (failed > 0) {
            console.log('\n⚠️  ATENCIÓN: Algunos comandos tienen problemas\n');
            // Generar archivo de log antes de fallar
            await this.generateLogFile();
            process.exit(1);
        } else {
            console.log('\n🎉 ¡Todos los comandos pasaron las pruebas!\n');
            // Generar archivo de log
            await this.generateLogFile();
            process.exit(0);
        }
    }
}

// Ejecutar el test runner
(async () => {
    const runner = new TyrTestRunner();
    await runner.runAllTests();
    await runner.printReport();
})();
