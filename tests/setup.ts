/**
 * Setup global para los tests de Vitest
 */

import { vi } from 'vitest';

// Mock global del contexto de Tyr
export const createMockContext = () => {
    return {
        frameworkRoot: '/mock/root',
        logger: {
            info: vi.fn(),
            success: vi.fn(),
            error: vi.fn(),
            warn: vi.fn(),
        },
        shell: {
            cd: vi.fn(),
            exec: vi.fn().mockResolvedValue({ stdout: '', stderr: '', code: 0 }),
            input: vi.fn().mockResolvedValue('mock-input'),
            showLoader: vi.fn(() => ({
                stop: vi.fn()
            }))
        },
        fs: {
            exists: vi.fn().mockReturnValue(true),
            createDir: vi.fn().mockResolvedValue(undefined),
            read: vi.fn().mockResolvedValue('mock-content'),
            write: vi.fn().mockResolvedValue(undefined),
            readFile: vi.fn().mockResolvedValue('mock-content'),
            writeFile: vi.fn().mockResolvedValue(undefined),
            mkdir: vi.fn().mockResolvedValue(undefined)
        },
        db: {
            searchBrokerOnDB: vi.fn().mockResolvedValue('mock-broker'),
            query: vi.fn().mockResolvedValue([])
        },
        git: {
            clone: vi.fn().mockResolvedValue(undefined),
            checkout: vi.fn().mockResolvedValue(undefined)
        },
        docker: {
            run: vi.fn().mockResolvedValue(undefined),
            exec: vi.fn().mockResolvedValue(undefined)
        },
        web: {
            fetch: vi.fn().mockResolvedValue({ status: 200, data: {} })
        },
        pkg: {
            install: vi.fn().mockResolvedValue(undefined),
            run: vi.fn().mockResolvedValue(undefined)
        },
        task: vi.fn(async (description: string, action: () => any) => {
            return await action();
        }),
        run: vi.fn(),
        fail: vi.fn((msg: string, suggestion?: string) => {
            const error = new Error(msg);
            (error as any).suggestion = suggestion;
            throw error;
        })
    };
};

// Exportar para uso en tests
global.createMockContext = createMockContext;
