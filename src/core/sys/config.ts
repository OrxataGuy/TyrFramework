import path from 'path';
import yaml from 'js-yaml';
import { homedir, platform } from 'os';
import { existsSync } from 'fs';
import type { TyrContext } from '../Kernel';

function detectShellRcFile(homeDir: string): string | null {
    const shell = process.env.SHELL || '';

    if (shell.includes('zsh'))  return path.join(homeDir, '.zshrc');
    if (shell.includes('fish')) return path.join(homeDir, '.config', 'fish', 'config.fish');
    if (shell.includes('bash')) {
        const candidates = [path.join(homeDir, '.bash_profile'), path.join(homeDir, '.bashrc')];
        return candidates.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
    }

    const fallbacks = [
        path.join(homeDir, '.zshrc'),
        path.join(homeDir, '.bashrc'),
        path.join(homeDir, '.bash_profile'),
    ];
    return fallbacks.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
}

const SH_ALIASES_TEMPLATE = `# ~/.tyr/aliases
# Añade aquí tus aliases personalizados.
# Este archivo se carga automáticamente por tu shell.
#
# Ejemplos:
#   alias gs='git status'
#   alias tyr-deploy='tyr deploy'
`;

const SH_PLUGINS_TEMPLATE = `# ~/.tyr/plugins
# Añade aquí tus plugins de shell.
# Compatible con zsh, bash y otros shells POSIX.
#
# Ejemplos (zsh):
#   source /usr/share/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh
`;

const PS_ALIASES_TEMPLATE = `# ~/.tyr/aliases.ps1
# Añade aquí tus aliases personalizados para PowerShell.
#
# Ejemplos:
#   Set-Alias gs git-status
#   function tyr-deploy { tyr deploy @args }
`;

const PS_PLUGINS_TEMPLATE = `# ~/.tyr/plugins.ps1
# Añade aquí tus módulos y plugins de PowerShell.
#
# Ejemplos:
#   Import-Module posh-git
#   Import-Module PSReadLine
`;

export default function config({ logger, fs: tyrFs, frameworkRoot }: TyrContext) {
    return async (_args: string[]) => {
        const homeDir = homedir();
        const userRoot = path.join(homeDir, '.tyr');
        const isWindows = platform() === 'win32';
        const ext = isWindows ? '.ps1' : '';

        logger.info('Iniciando configuración de Tyr...\n');

        // 1. ~/.tyr/commands/
        await tyrFs.createDir(path.join(userRoot, 'commands'));
        logger.success(`Directorio creado: ${path.join(userRoot, 'commands')}`);

        // 2. ~/.tyr/aliases(.ps1)
        const aliasesPath = path.join(userRoot, `aliases${ext}`);
        if (!tyrFs.exists(aliasesPath)) {
            await tyrFs.write(aliasesPath, isWindows ? PS_ALIASES_TEMPLATE : SH_ALIASES_TEMPLATE);
            logger.success(`Archivo creado: ${aliasesPath}`);
        } else {
            logger.info(`Ya existe: ${aliasesPath}`);
        }

        // 3. ~/.tyr/plugins(.ps1)
        const pluginsPath = path.join(userRoot, `plugins${ext}`);
        if (!tyrFs.exists(pluginsPath)) {
            await tyrFs.write(pluginsPath, isWindows ? PS_PLUGINS_TEMPLATE : SH_PLUGINS_TEMPLATE);
            logger.success(`Archivo creado: ${pluginsPath}`);
        } else {
            logger.info(`Ya existe: ${pluginsPath}`);
        }

        // 4. ~/.tyr/map.yml — create or update, registering framework commands with absolute paths
        const mapPath = path.join(userRoot, 'map.yml');
        const currentRaw = await tyrFs.read(mapPath);
        const userConfig: { commands: Record<string, string> } =
            (yaml.load(currentRaw ?? '') as any) ?? { commands: {} };
        if (!userConfig.commands) userConfig.commands = {};

        const frameworkMapPath = path.join(frameworkRoot, 'config', 'map.yml');
        if (existsSync(frameworkMapPath)) {
            const frameworkRaw = await tyrFs.read(frameworkMapPath);
            const frameworkConfig = (yaml.load(frameworkRaw ?? '') as any) ?? {};
            for (const [name, relPath] of Object.entries(frameworkConfig.commands ?? {})) {
                const absPath = path.resolve(frameworkRoot, relPath as string);
                if (existsSync(absPath) && !userConfig.commands[name]) {
                    userConfig.commands[name] = absPath;
                    logger.info(`  Comando registrado: ${name}`);
                }
            }
        }

        await tyrFs.write(mapPath, yaml.dump(userConfig, { indent: 2, lineWidth: -1 }));
        logger.success(`Configuración guardada: ${mapPath}`);

        // 5. Configure shell to source aliases and plugins
        logger.info('\nConfigurando shell...');
        if (isWindows) {
            await configureWindowsShell(tyrFs, logger, aliasesPath, pluginsPath);
        } else {
            await configureUnixShell(tyrFs, logger, homeDir, aliasesPath, pluginsPath);
        }

        logger.success('\nTyr configurado correctamente.');
        logger.info(`\nDirectorio de configuración: ${userRoot}`);
        logger.info('\nPróximos pasos:');
        logger.info('  tyr gen <nombre> <archivo>   Crear un nuevo comando');
        logger.info('  tyr doc                      Ver documentación de la API');
    };
}

async function configureUnixShell(
    tyrFs: any, logger: any,
    homeDir: string, aliasesPath: string, pluginsPath: string
): Promise<void> {
    const rcFile = detectShellRcFile(homeDir);
    if (!rcFile) {
        logger.warn('No se pudo detectar el archivo de configuración del shell.');
        logger.info(`Añade manualmente:\n  source "${aliasesPath}"\n  source "${pluginsPath}"`);
        return;
    }
    await tyrFs.ensureLine(rcFile, `source "${aliasesPath}"`);
    await tyrFs.ensureLine(rcFile, `source "${pluginsPath}"`);
    logger.success(`Shell configurado: ${rcFile}`);
    logger.info(`Ejecuta: source ${rcFile}  (o abre una nueva terminal)`);
}

async function configureWindowsShell(
    tyrFs: any, logger: any,
    aliasesPath: string, pluginsPath: string
): Promise<void> {
    const psProfile = process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, 'Documents', 'PowerShell', 'Microsoft.PowerShell_profile.ps1')
        : null;

    if (!psProfile) {
        logger.warn('No se pudo detectar el perfil de PowerShell.');
        logger.info(`Añade manualmente:\n  . "${aliasesPath}"\n  . "${pluginsPath}"`);
        return;
    }
    await tyrFs.ensureLine(psProfile, `. "${aliasesPath}"`);
    await tyrFs.ensureLine(psProfile, `. "${pluginsPath}"`);
    logger.success(`Perfil de PowerShell configurado: ${psProfile}`);
    logger.info('Reinicia PowerShell para aplicar los cambios.');
}
