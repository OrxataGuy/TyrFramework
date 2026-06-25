import fs from 'fs';
import path from 'path';
import { TyrContext } from '../Kernel';

interface CommandDoc {
    name: string;
    description: string;
    usage: string;
}

function parseCommandDoc(filePath: string): CommandDoc {
    const fileName = path.basename(filePath, '.tyr.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) {
        return { name: fileName, description: '', usage: '' };
    }

    const lines = match[1]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trimEnd());

    const usoIndex = lines.findIndex(l => /^uso:/i.test(l.trim()));

    let description = '';
    let usage = '';

    if (usoIndex !== -1) {
        description = lines
            .slice(0, usoIndex)
            .filter(l => l.trim() !== '')
            .join('\n')
            .trim();

        usage = lines
            .slice(usoIndex + 1)
            .filter(l => l.trim() !== '')
            .map(l => l.trim())
            .join('\n')
            .trim();
    } else {
        description = lines.filter(l => l.trim() !== '').join('\n').trim();
    }

    return { name: fileName, description, usage };
}

export default function help({ userRoot }: TyrContext) {
    return async (_args: string[]) => {
        const commandsDir = path.join(userRoot, 'commands');

        // ── ANSI ──────────────────────────────────────────────────────────
        const reset  = '\x1b[0m';
        const bold   = '\x1b[1m';
        const dim    = '\x1b[2m';
        const cyan   = '\x1b[36m';
        const green  = '\x1b[32m';
        const yellow = '\x1b[33m';
        const gray   = '\x1b[90m';
        const white  = '\x1b[37m';
        // ──────────────────────────────────────────────────────────────────

        const separator = `${gray}  ${'─'.repeat(50)}${reset}`;

        console.log('');
        console.log(`  ${bold}${cyan}tyr${reset}  ${white}Available commands${reset}`);
        console.log(separator);
        console.log('');

        const builtins = [
            { name: '--help',    description: 'Shows this command listing.',                  usage: 'tyr --help' },
            { name: '--version', description: 'Shows the installed version of tyr.',          usage: 'tyr --version' },
            { name: '--config',  description: 'Configures tyr for the first time.',           usage: 'tyr --config' },
            { name: '--update',  description: 'Updates ~/.tyr from the git repository.',      usage: 'tyr --update' },
            { name: '--upgrade', description: 'Upgrades the tyr npm package.',                usage: 'tyr --upgrade' },
            { name: 'gen',       description: 'Generates a new command from a description using AI.', usage: 'tyr gen <name> "<description>"' },
            { name: 'doc',       description: 'Opens the framework documentation in the browser.', usage: 'tyr doc' },
        ];

        console.log(`  ${bold}${yellow}Framework${reset}`);
        console.log('');

        for (const cmd of builtins) {
            console.log(`  ${bold}${green}${cmd.name.padEnd(14)}${reset}${dim}${cmd.description}${reset}`);
            console.log(`  ${' '.repeat(14)}${gray}${cmd.usage}${reset}`);
            console.log('');
        }

        // User commands in ~/.tyr/commands/
        if (!fs.existsSync(commandsDir)) {
            console.log(separator);
            console.log(`  ${yellow}Commands folder not found: ${commandsDir}${reset}`);
            console.log('');
            return;
        }

        const files = fs.readdirSync(commandsDir)
            .filter(f => f.endsWith('.tyr.ts'))
            .sort();

        if (files.length === 0) {
            console.log(separator);
            console.log(`  ${dim}No commands in ${commandsDir}${reset}`);
            console.log('');
            return;
        }

        console.log(separator);
        console.log('');
        console.log(`  ${bold}${yellow}User commands${reset}  ${gray}(~/.tyr/commands/)${reset}`);
        console.log('');

        for (const file of files) {
            const doc = parseCommandDoc(path.join(commandsDir, file));

            console.log(`  ${bold}${green}${doc.name}${reset}`);

            if (doc.description) {
                for (const line of doc.description.split('\n')) {
                    console.log(`  ${dim}${line}${reset}`);
                }
            } else {
                console.log(`  ${gray}No description${reset}`);
            }

            if (doc.usage) {
                console.log('');
                console.log(`  ${gray}  Usage:${reset}`);
                for (const line of doc.usage.split('\n')) {
                    console.log(`  ${cyan}    ${line}${reset}`);
                }
            }

            console.log('');
        }

        console.log(separator);
        console.log(`  ${dim}Generate a new command with ${cyan}tyr gen <name> "<what it should do>"${reset}`);
        console.log('');
    };
}
