/**
 * bin/loader.mjs
 *
 * Custom Node.js ESM loader for Tyr.
 * Transpiles TypeScript files on-the-fly using esbuild.transformSync().
 *
 * Key properties:
 *   - Zero disk writes: all transpilation happens in memory — no ~/.cache/tsx or similar
 *   - Fast: esbuild native binary is 50-100× faster than the full TypeScript compiler
 *   - No type-checking: types are stripped, not verified (run tsc --noEmit separately)
 *
 * Registered via --loader flag in bin/tyr.js.
 */

import { transformSync } from 'esbuild';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const TS_RE = /\.m?[ct]?ts$/;

/**
 * load() — intercept every ESM import whose URL ends in a TypeScript extension.
 *
 * We do NOT exclude node_modules: the tyr package itself ships as .ts source
 * (bin/tyr.ts, src/core/Kernel.ts, etc.) and those files ARE under node_modules
 * when installed globally. Node.js 24's built-in strip-types refuses to handle
 * .ts files under node_modules, so our loader must cover them.
 *
 * The TS_RE regex already limits interception to .ts/.mts/.cts files — the
 * compiled .js files that third-party packages ship will never match it.
 */
export function load(url, context, next) {
    const isTs = TS_RE.test(url);
    if (!isTs) return next(url, context);

    const filePath = fileURLToPath(url);
    const source   = readFileSync(filePath, 'utf8');

    const { code, warnings } = transformSync(source, {
        loader:     'ts',
        format:     'esm',
        target:     'node18',
        sourcemap:  'inline',   // inline maps so stack traces point to .ts lines
        sourcefile: filePath,
        // Do not inject helpers — keep output minimal
        treeShaking: false,
    });

    for (const w of warnings) {
        process.stderr.write(`[tyr:loader] warning: ${w.text}\n`);
    }

    return { format: 'module', source: code, shortCircuit: true };
}
