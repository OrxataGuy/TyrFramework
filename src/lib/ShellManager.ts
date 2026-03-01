import { execa } from 'execa';
import { resolve } from 'path';
import { homedir } from 'os';
import inquirer from 'inquirer';

import { TyrError } from '../core/TyrError.js';

/**
 * @class ShellManager
 * @description Terminal command executor. Maintains the working directory (CWD) state to chain commands in specific folders.
 */
export class ShellManager {
    private cwd: string;

    constructor() {
        this.cwd = process.cwd();
    }

    /**
     * @method exec
     * @description Executes a command in the system shell and returns the standard output.
     * @param {string} command - The full command to execute.
     * @returns {Promise<string>} The command output (stdout) trimmed of extra whitespace.
     * @example
     * const version = await shell.exec('node -v');
     */
    public async exec(command: string): Promise<string> {
        try {
            const result = await execa(command, { shell: true, cwd: this.cwd });
            return result.stdout.trim();
        } catch (e) {
            throw new TyrError(`An error occurred while executing the command: ${command}`, e);
        }
    }

    /**
    * @method showLoader
    * @description Displays a spinner loader in the terminal.
    * @param {string} message - Informational text to show alongside the spinner.
    * @returns {void}
    * @example
    * shell.showLoader('Loading...');
    */
    public showLoader = (message: string): { stop: () => void } => {
        const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
        let i = 0;
        let stopped = false;

        const interval = setInterval(() => {
            if (!stopped) {
                process.stdout.write(`\r${frames[i]} ${message}`);
                i = (i + 1) % frames.length;
            }
        }, 80);

        return {
            stop: () => {
                stopped = true;
                clearInterval(interval);
                process.stdout.write('\r');
            }
        };
    };

    /**
     * @method input
     * @description Prompts the user for a value via CLI.
     * @param {string} question - Informational text shown as the prompt.
     * @returns {Promise<string>} The value entered by the user.
     * @example
     * const name = await shell.input("What's your name?");
     */
    public async input(question: string): Promise<string> {
        try {
            const result = await inquirer.prompt([
                {
                    type: 'input',
                    name: 'value',
                    message: question,
                },
            ]);

            return result.value.trim();
        } catch (e) {
            throw new TyrError(`An error occurred while prompting the question: ${question}`, e);
        }
    }

    /**
     * @method cd
     * @description Changes the internal working directory for subsequent commands executed by this instance.
     * @param {string} path - Absolute or relative path to change to.
     * @example
     * shell.cd('./backend');
     * await shell.exec('npm install'); // Runs inside /backend
     */
    public cd(path: string): void {
        let expandedPath = path;
        if (path.startsWith('~/')) {
            expandedPath = path.replace('~', homedir());
        } else if (path === '~') {
            expandedPath = homedir();
        }

        this.cwd = resolve(this.cwd, expandedPath);
    }
}

/**
 * @object ShellManagerTests
 * @description Test parameters to validate ShellManager functionality.
 */
export const ShellManagerTests = {
    exec: { command: 'node -v' },
    cd: { path: '/tmp' },
    input: { question: 'Enter a test value:' },
    showLoader: { message: 'Loading test...' }
};