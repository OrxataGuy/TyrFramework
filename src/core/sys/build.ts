/**
 * build.ts — sistema: tyr build
 *
 * Compila AOT (Ahead-of-Time) todos los comandos registrados en ~/.tyr/map.yml
 * desde TypeScript a JavaScript puro usando esbuild.
 *
 * El resultado se escribe en ~/.tyr/dist/<basename>.js.
 * Una vez compilado, el Kernel detecta automáticamente los ficheros .js en dist/
 * y los usa en lugar de los .ts originales, eliminando por completo el coste
 * de transpilación en tiempo de ejecución.
 *
 * Uso:
 *   tyr build              — compila todos los comandos de map.yml
 *   tyr build --clean      — elimina ~/.tyr/dist/ antes de compilar
 */

import path from 'path';
import fs   from 'fs';
import yaml from 'js-yaml';
import type { TyrContext } from '../Kernel.js';

interface MapYml {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

export default function build({ logger, userRoot }: TyrContext) {
    return async (args: string[]) => {
        const clean   = args.includes('--clean');
        const mapPath = path.join(userRoot, 'map.yml');
        const distDir = path.join(userRoot, 'dist');

        // ── Leer map.yml ──────────────────────────────────────────────────────
        if (!fs.existsSync(mapPath)) {
            logger.error(`No se encontró map.yml en ${userRoot}`);
            return;
        }

        const raw = yaml.load(fs.readFileSync(mapPath, 'utf8')) as MapYml;
        const commands = raw?.commands ?? {};
        const entries  = Object.entries(commands);

        if (entries.length === 0) {
            logger.warn('map.yml no contiene comandos. Nada que compilar.');
            return;
        }

        // ── Limpiar dist/ si se pide ──────────────────────────────────────────
        if (clean && fs.existsSync(distDir)) {
            fs.rmSync(distDir, { recursive: true, force: true });
            logger.info('dist/ eliminado.');
        }

        if (!fs.existsSync(distDir)) {
            fs.mkdirSync(distDir, { recursive: true });
        }

        // ── Importar esbuild dinámicamente (dep de producción en @orxataguy/tyr) ──
        // La importación dinámica garantiza que si esbuild no estuviese disponible
        // se obtiene un error claro en lugar de un crash al arrancar el framework.
        let esbuild: typeof import('esbuild');
        try {
            esbuild = await import('esbuild');
        } catch {
            logger.error('esbuild no está disponible. Reinstala: npm install -g @orxataguy/tyr');
            return;
        }

        // ── Compilar cada comando ─────────────────────────────────────────────
        let compiled = 0;
        let failed   = 0;

        for (const [name, relPath] of entries) {
            const srcPath = path.isAbsolute(relPath)
                ? relPath
                : path.resolve(userRoot, relPath);

            if (!fs.existsSync(srcPath)) {
                logger.warn(`[${name}] Fichero no encontrado: ${srcPath} — omitido.`);
                failed++;
                continue;
            }

            const outFile = path.join(
                distDir,
                path.basename(srcPath).replace(/\.ts$/, '.js'),
            );

            try {
                await esbuild.build({
                    entryPoints: [srcPath],
                    outfile:     outFile,
                    bundle:      false,      // solo transpila, no empaqueta deps
                    platform:    'node',
                    format:      'esm',
                    target:      'node18',
                    sourcemap:   false,      // sin sourcemaps en producción
                    packages:    'external', // mantiene imports de npm tal cual
                    logLevel:    'silent',
                });
                logger.success(`[${name}] → ${path.relative(userRoot, outFile)}`);
                compiled++;
            } catch (err: any) {
                logger.error(`[${name}] Error de compilación: ${err?.message ?? err}`);
                failed++;
            }
        }

        // ── Resumen ────────────────────────────────────────────────────────────
        console.log('');
        if (compiled > 0) {
            logger.success(
                `Build completado: ${compiled} comando${compiled !== 1 ? 's' : ''} compilado${compiled !== 1 ? 's' : ''} en dist/`,
            );
            logger.info('El Kernel usará automáticamente los ficheros compilados en la próxima ejecución.');
        }
        if (failed > 0) {
            logger.warn(`${failed} comando${failed !== 1 ? 's' : ''} no pudieron compilarse.`);
        }
    };
}
