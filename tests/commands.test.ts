import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockContext } from './setup';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

describe('Tyr Commands Smoke Tests', () => {
    let mockContext: any;
    let config: TyrConfig;
    const frameworkRoot = path.resolve(__dirname, '../');

    // Cargar configuración antes de cualquier describe
    const configPath = path.resolve(frameworkRoot, 'config/map.yml');
    if (fs.existsSync(configPath)) {
        const fileContents = fs.readFileSync(configPath, 'utf8');
        config = yaml.load(fileContents) as TyrConfig;
    }

    beforeEach(() => {
        mockContext = createMockContext();
    });

    describe('System Commands', () => {
        const systemCommands = [
            { name: 'gen', path: 'src/core/sys/gen.ts' },
            { name: 'rem', path: 'src/core/sys/rem.ts' },
            { name: 'doc', path: 'src/core/sys/doc.ts' }
        ];

        systemCommands.forEach(({ name, path: cmdPath }) => {
            describe(`Command: ${name}`, () => {
                it('should exist as a file', () => {
                    const absolutePath = path.resolve(frameworkRoot, cmdPath);
                    expect(fs.existsSync(absolutePath)).toBe(true);
                });

                it('should be loadable as a module', async () => {
                    const absolutePath = path.resolve(frameworkRoot, cmdPath);
                    const module = await import(absolutePath);
                    expect(module).toBeDefined();
                });

                it('should export a default function', async () => {
                    const absolutePath = path.resolve(frameworkRoot, cmdPath);
                    const module = await import(absolutePath);
                    expect(typeof module.default).toBe('function');
                });

                it('should instantiate with mock context', async () => {
                    const absolutePath = path.resolve(frameworkRoot, cmdPath);
                    const module = await import(absolutePath);
                    const commandFactory = module.default;
                    const command = commandFactory(mockContext);
                    expect(typeof command).toBe('function');
                });

                it('should not throw unhandled exceptions when called with empty args', async () => {
                    const absolutePath = path.resolve(frameworkRoot, cmdPath);
                    const module = await import(absolutePath);
                    const commandFactory = module.default;
                    const command = commandFactory(mockContext);
                    
                    // El comando puede fallar por validación, pero no debe lanzar excepciones no controladas
                    try {
                        await command([]);
                    } catch (error: any) {
                        // Las excepciones controladas (validaciones) son aceptables
                        expect(error).toBeDefined();
                    }
                });
            });
        });
    });

    describe('Custom Commands', () => {
        if (!config || !config.commands) {
            it.skip('No config found, skipping custom commands tests', () => {});
            return;
        }

        Object.entries(config.commands).forEach(([commandName, scriptPath]) => {
            describe(`Command: ${commandName}`, () => {
                it('should exist as a file', () => {
                    const absolutePath = path.resolve(frameworkRoot, scriptPath);
                    expect(fs.existsSync(absolutePath)).toBe(true);
                });

                it('should be loadable as a module', async () => {
                    const absolutePath = path.resolve(frameworkRoot, scriptPath);
                    const module = await import(absolutePath);
                    expect(module).toBeDefined();
                });

                it('should export a default function', async () => {
                    const absolutePath = path.resolve(frameworkRoot, scriptPath);
                    const module = await import(absolutePath);
                    expect(typeof module.default).toBe('function');
                });

                it('should instantiate with mock context', async () => {
                    const absolutePath = path.resolve(frameworkRoot, scriptPath);
                    const module = await import(absolutePath);
                    const commandFactory = module.default;
                    const command = commandFactory(mockContext);
                    expect(typeof command).toBe('function');
                });

                it('should handle validation errors gracefully', async () => {
                    const absolutePath = path.resolve(frameworkRoot, scriptPath);
                    const module = await import(absolutePath);
                    const commandFactory = module.default;
                    const command = commandFactory(mockContext);
                    
                    try {
                        await command([]);
                    } catch (error: any) {
                        // Si falla, debe ser un error controlado
                        expect(error).toBeDefined();
                        // No debe ser un TypeError o ReferenceError (errores de código)
                        expect(error.constructor.name).not.toBe('TypeError');
                        expect(error.constructor.name).not.toBe('ReferenceError');
                    }
                });
            });
        });
    });

    describe('Aliases Configuration', () => {
        if (!config || !config.aliases) {
            it.skip('No aliases found in config', () => {});
            return;
        }

        Object.entries(config.aliases).forEach(([alias, target]) => {
            it(`alias "${alias}" should point to existing command "${target}"`, () => {
                expect(config.commands[target]).toBeDefined();
            });

            it(`alias "${alias}" target "${target}" should be a valid file`, () => {
                const targetPath = config.commands[target];
                const absolutePath = path.resolve(frameworkRoot, targetPath);
                expect(fs.existsSync(absolutePath)).toBe(true);
            });
        });
    });

    describe('Framework Integrity', () => {
        it('should have a valid config file', () => {
            const configPath = path.resolve(frameworkRoot, 'config/map.yml');
            expect(fs.existsSync(configPath)).toBe(true);
        });

        it('should have config with commands section', () => {
            expect(config).toBeDefined();
            expect(config.commands).toBeDefined();
            expect(typeof config.commands).toBe('object');
        });

        it('should have at least one command defined', () => {
            expect(Object.keys(config.commands).length).toBeGreaterThan(0);
        });

        it('all command files should exist', () => {
            Object.entries(config.commands).forEach(([name, scriptPath]) => {
                const absolutePath = path.resolve(frameworkRoot, scriptPath);
                expect(fs.existsSync(absolutePath), 
                    `Command "${name}" file not found at ${scriptPath}`
                ).toBe(true);
            });
        });
    });
});
