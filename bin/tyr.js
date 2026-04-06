#!/usr/bin/env node
import { fileURLToPath } from 'url';
import { dirname, resolve, join } from 'path';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const tsxBin = join(packageRoot, 'node_modules', '.bin', isWindows ? 'tsx.cmd' : 'tsx');
const entry = join(__dirname, 'tyr.ts');

const child = spawn(tsxBin, [entry, ...process.argv.slice(2)], {
    stdio: 'inherit',
    shell: isWindows
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
    console.error(`Error: Could not start tyr. ${err.message}`);
    console.error(`tsx not found at: ${tsxBin}`);
    console.error(`Try reinstalling: npm install -g tyr.framework.cli`);
    process.exit(1);
});
