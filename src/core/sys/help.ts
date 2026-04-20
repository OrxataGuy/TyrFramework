import fs from 'fs';
import path from 'path';
import { TyrContext } from '../Kernel';

interface CommandDoc {
    name: string;
    description: string;
    usage: string;
}

/**
 * Extrae el primer bloque JSDoc de un archivo .tyr.ts y lo parsea
 * en descripción y ejemplos de uso.
 */
function parseCommandDoc(filePath: string): CommandDoc {
    const fileName = path.basename(filePath, '.tyr.ts');
    const content = fs.readFileSync(filePath, 'utf-8');

    const match = content.match(/\/\*\*([\s\S]*?)\*\//);
    if (!match) {
        return { name: fileName, description: '', usage: '' };
    }

    // Limpiar cada línea: eliminar el * inicial y espacios
    const lines = match[1]
        .split('\n')
        .map(line => line.replace(/^\s*\*\s?/, '').trimEnd());

    // Separar en descripción y bloque "Uso:"
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
        console.log(`  ${bold}${cyan}tyr${reset}  ${white}Comandos disponibles${reset}`);
        console.log(separator);
        console.log('');

        // Flags y comandos built-in del framework
        const builtins = [
            { name: '--help',    description: 'Muestra este listado de comandos.',          usage: 'tyr --help' },
            { name: '--version', description: 'Muestra la versión instalada de tyr.',       usage: 'tyr --version' },
            { name: '--config',  description: 'Configura tyr por primera vez.',             usage: 'tyr --config' },
            { name: '--update',  description: 'Actualiza ~/.tyr desde el repositorio git.', usage: 'tyr --update' },
            { name: '--upgrade', description: 'Actualiza el paquete npm de tyr.',           usage: 'tyr --upgrade' },
            { name: 'gen',       description: 'Genera un nuevo comando a partir de una descripción con IA.', usage: 'tyr gen <nombre> "<descripción>"' },
            { name: 'doc',       description: 'Levanta la documentación del framework en el navegador.', usage: 'tyr doc' },
        ];

        console.log(`  ${bold}${yellow}Framework${reset}`);
        console.log('');

        for (const cmd of builtins) {
            console.log(`  ${bold}${green}${cmd.name.padEnd(14)}${reset}${dim}${cmd.description}${reset}`);
            console.log(`  ${' '.repeat(14)}${gray}${cmd.usage}${reset}`);
            console.log('');
        }

        // Comandos de usuario en ~/.tyr/commands/
        if (!fs.existsSync(commandsDir)) {
            console.log(separator);
            console.log(`  ${yellow}No se encontró la carpeta de comandos: ${commandsDir}${reset}`);
            console.log('');
            return;
        }

        const files = fs.readdirSync(commandsDir)
            .filter(f => f.endsWith('.tyr.ts'))
            .sort();

        if (files.length === 0) {
            console.log(separator);
            console.log(`  ${dim}No hay comandos en ${commandsDir}${reset}`);
            console.log('');
            return;
        }

        console.log(separator);
        console.log('');
        console.log(`  ${bold}${yellow}Comandos de usuario${reset}  ${gray}(~/.tyr/commands/)${reset}`);
        console.log('');

        for (const file of files) {
            const doc = parseCommandDoc(path.join(commandsDir, file));

            console.log(`  ${bold}${green}${doc.name}${reset}`);

            if (doc.description) {
                for (const line of doc.description.split('\n')) {
                    console.log(`  ${dim}${line}${reset}`);
                }
            } else {
                console.log(`  ${gray}Sin descripción${reset}`);
            }

            if (doc.usage) {
                console.log('');
                console.log(`  ${gray}  Uso:${reset}`);
                for (const line of doc.usage.split('\n')) {
                    console.log(`  ${cyan}    ${line}${reset}`);
                }
            }

            console.log('');
        }

        console.log(separator);
        console.log(`  ${dim}Genera un comando nuevo con ${cyan}tyr gen <nombre> "<qué debe hacer>"${reset}`);
        console.log('');
    };
}
