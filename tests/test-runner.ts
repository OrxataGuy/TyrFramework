#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TestResult {
    command: string;
    status: 'PASS' | 'FAIL' | 'SKIP';
    error?: string;
    details?: string;
    file?: string;
}

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

class TyrTestRunner {
    private frameworkRoot: string;
    private config: TyrConfig | null = null;
    private results: TestResult[] = [];
    private mockContext: any;

    constructor() {
        this.frameworkRoot = path.resolve(__dirname, '..');
        this.mockContext = this.createMockContext();
    }

    /**
     * Crea un contexto simulado con todas las dependencias mockeadas
     */
    private createMockContext() {
        const mockLogger = {
            info: (...args: any[]) => console.log('[MOCK LOG]', ...args),
            success: (...args: any[]) => console.log('[MOCK SUCCESS]', ...args),
            error: (...args: any[]) => console.error('[MOCK ERROR]', ...args),
            warn: (...args: any[]) => console.warn('[MOCK WARN]', ...args),
        };

        const mockShell = {
            cd: (dir: string) => console.log(`[MOCK] cd ${dir}`),
            exec: async (cmd: string) => {
                console.log(`[MOCK] exec: ${cmd}`);
                return { stdout: '', stderr: '', code: 0 };
            },
            input: async (prompt: string) => {
                console.log(`[MOCK] input: ${prompt}`);
                return 'mock-input';
            },
            showLoader: (msg: string) => ({
                stop: () => console.log(`[MOCK] loader stopped: ${msg}`)
            })
        };

        const mockFs = {
            exists: (path: string) => {
                console.log(`[MOCK] checking if exists: ${path}`);
                const pathsToReturn = [
                    '/Users/mandreu/Documents/Archivo/tfg',
                    '/Users/mandreu/avantio/framework/core/include/bin/aliases.template.sh',
                    '/Users/mandreu/avantio/framework/core/include/bin/plugins.template.sh'
                ];
                return pathsToReturn.includes(path) || path.includes('.zshrc');
            },
            readFile: async (path: string) => {
                console.log(`[MOCK] reading file: ${path}`);
                return 'mock-content';
            },
            writeFile: async (path: string, content: string) => {
                console.log(`[MOCK] writing file: ${path}`);
            },
            mkdir: async (path: string) => {
                console.log(`[MOCK] creating directory: ${path}`);
            },
            read: async (path: string) => {
                console.log(`[MOCK] reading file: ${path}`);
                return 'mock-content';
            },
            write: async (path: string, content: string) => {
                console.log(`[MOCK] writing file: ${path}`);
            },
            createDir: async (path: string) => {
                console.log(`[MOCK] creating directory: ${path}`);
            }
        };

        const mockDb = {
            searchBrokerOnDB: async (url: string) => {
                console.log(`[MOCK] searching broker for: ${url}`);
                return 'mock-broker';
            },
            query: async (sql: string) => {
                console.log(`[MOCK] SQL query: ${sql}`);
                return [];
            }
        };

        const mockGit = {
            clone: async (url: string) => {
                console.log(`[MOCK] cloning: ${url}`);
            },
            checkout: async (branch: string) => {
                console.log(`[MOCK] checkout: ${branch}`);
            }
        };

        const mockDocker = {
            run: async (image: string, command: string) => {
                console.log(`[MOCK] docker run ${image} ${command}`);
            },
            exec: async (container: string, command: string) => {
                console.log(`[MOCK] docker exec ${container} ${command}`);
            }
        };

        const mockWeb = {
            fetch: async (url: string) => {
                console.log(`[MOCK] fetching: ${url}`);
                return { status: 200, data: {} };
            }
        };

        const mockPackage = {
            install: async (packages: string[]) => {
                console.log(`[MOCK] installing packages:`, packages);
            },
            run: async (script: string) => {
                console.log(`[MOCK] running npm script: ${script}`);
            }
        };

        return {
            frameworkRoot: this.frameworkRoot,
            logger: mockLogger,
            shell: mockShell,
            fs: mockFs,
            db: mockDb,
            git: mockGit,
            docker: mockDocker,
            web: mockWeb,
            pkg: mockPackage,
            task: async <T>(description: string, action: () => Promise<T> | T, next: boolean = false): Promise<T | undefined> => {
                console.log(`[MOCK TASK] ${description}`);
                try {
                    return await action();
                } catch (e) {
                    if (!next) throw e;
                }
            },
            run: async (commandName: string, args: string[] = []) => {
                console.log(`[MOCK] running command: ${commandName}`, args);
            },
            fail: (msg: string, suggestion?: string) => {
                const error = new Error(msg);
                (error as any).suggestion = suggestion;
                throw error;
            }
        };
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
            const commandFactory = module.default;

            try {
                const command = commandFactory(this.mockContext);

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
                } catch (e: any) {
                    // Si falla por validación de argumentos, está OK
                    if (e.message && e.message.includes('No se especificó')) {
                        console.log(`   [OK] - Validación de argumentos funcionando`);
                        result.details = 'Comando requiere argumentos (esperado)';
                    } else {
                        // Cualquier otro error puede ser problemático
                        result.status = 'FAIL';
                        result.error = `Error al ejecutar: ${e.message}`;
                        result.details = e.stack;
                    }
                }

            } catch (e: any) {
                result.status = 'FAIL';
                result.error = `Error al instanciar comando: ${e.message}`;
                result.details = e.stack;
                return result;
            }

        } catch (e: any) {
            result.status = 'FAIL';
            result.error = `Error al cargar módulo: ${e.message}`;
            result.details = e.stack;
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

            // Probar comandos del sistema
            console.log('🔧 Probando comandos del sistema...');
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
                    const targetPath = this.config.commands[target];
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

        } catch (e: any) {
            console.error('\n❌ Error crítico durante las pruebas:', e.message);
            process.exit(1);
        }
    }

    /**
     * Genera el reporte final
     */
    public printReport(): void {
        console.log('\n\n');
        console.log('╔═══════════════════════════════════════════════════════╗');
        console.log('║              REPORTE DE RESULTADOS                   ║');
        console.log('╚═══════════════════════════════════════════════════════╝\n');

        const passed = this.results.filter(r => r.status === 'PASS').length;
        const failed = this.results.filter(r => r.status === 'FAIL').length;
        const skipped = this.results.filter(r => r.status === 'SKIP').length;
        const total = this.results.length;

        // Resultados individuales
        this.results.forEach(result => {
            const icon = result.status === 'PASS' ? '✅' : result.status === 'FAIL' ? '❌' : '⚠️';
            console.log(`${icon} ${result.command}`);

            if (result.file) {
                console.log(`   📄 ${result.file}`);
            }

            if (result.details && result.status !== 'FAIL') {
                console.log(`   ℹ️  ${result.details}`);
            }

            if (result.error) {
                console.log(`   ❌ ${result.error}`);
                if (result.details) {
                    console.log(`   📋 Detalles:`);
                    console.log(`      ${result.details.split('\n').join('\n      ')}`);
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
            process.exit(1);
        } else {
            console.log('\n🎉 ¡Todos los comandos pasaron las pruebas!\n');
            process.exit(0);
        }
    }
}

// Ejecutar el test runner
(async () => {
    const runner = new TyrTestRunner();
    await runner.runAllTests();
    runner.printReport();
})();
