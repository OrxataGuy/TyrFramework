import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import { homedir } from 'os';

export interface Logger {
    line(opts: any): void;
    log(msg: any): void;
    info(msg: any): void;
    success(msg: any): void;
    error(msg: any): void;
    warn(msg: any): void;
}

export function createLogger(isDebug: boolean): Logger {
    const logDir = path.join(homedir(), '.tyr', 'logs');
    const logFile = path.join(logDir, `${new Date().toISOString().slice(0, 10)}.log`);

    const writeToFile = (level: string, msg: any) => {
        try {
            fs.mkdirSync(logDir, { recursive: true });
            const timestamp = new Date().toISOString();
            const line = `[${timestamp}] [${level}] ${String(msg)}\n`;
            fs.appendFileSync(logFile, line, 'utf-8');
        } catch {
            // Logging failures must never crash the application
        }
    };

    return {
        line: (opts) => {
            if (opts) {
                let {char, title, count} = opts;
                if (!count) count = 45;
                let content = '';
                if (title) content = `${char} ${title} ${char}`;
                else {
                    for (let i = 0; i < count; i++) content += char;
                }
                console.log(content);
            } else {
                console.log('');
            }
        },
        log: (msg) => {
            console.log(msg);
            writeToFile('LOG', msg);
        },
        info: (msg) => {
            console.log(chalk.blue('ℹ'), msg);
            writeToFile('INFO', msg);
        },
        success: (msg) => {
            console.log(chalk.green('✔'), msg);
            writeToFile('SUCCESS', msg);
        },
        error: (msg) => {
            if (isDebug) console.error(chalk.red('✖'), msg);
            writeToFile('ERROR', msg);
        },
        warn: (msg) => {
            if (isDebug) console.warn(chalk.yellow('⚠'), msg);
            writeToFile('WARN', msg);
        },
    };
}
