#!/usr/bin/env node
/**
 * bin/tyr.js — Tyr CLI entry point.
 *
 * Spawns Node.js with a custom ESM loader (bin/loader.mjs) that transpiles
 * TypeScript files in-memory using esbuild. This replaces the previous tsx
 * dependency, eliminating all disk-write overhead from TypeScript compilation
 * caches (~/.cache/tsx).
 *
 * Compatibility: Node.js 18+
 * The --loader flag is experimental in Node 22 but fully functional;
 * NODE_NO_WARNINGS suppresses the deprecation notice.
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);

const loaderPath = join(__dirname, 'loader.mjs');
const entry      = join(__dirname, 'tyr.ts');

const child = spawn(
    process.execPath,
    [
        '--loader', loaderPath,
        '--no-warnings',        // suppress ExperimentalWarning for --loader in Node 22
        entry,
        ...process.argv.slice(2),
    ],
    {
        stdio: 'inherit',
        env: { ...process.env },
    }
);

child.on('exit',  (code) => process.exit(code ?? 0));
child.on('error', (err)  => {
    process.stderr.write(`[tyr] Error: Could not start tyr.\n${err.message}\n`);
    process.stderr.write(`loader path: ${loaderPath}\n`);
    process.stderr.write('Try reinstalling: npm install -g @orxataguy/tyr\n');
    process.exit(1);
});
