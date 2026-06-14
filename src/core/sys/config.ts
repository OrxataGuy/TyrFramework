import path from 'path';
import { homedir, platform } from 'os';
import { existsSync, cpSync, rmSync, mkdirSync, readdirSync } from 'fs';
import { execSync } from 'child_process';
import type { TyrContext } from '../Kernel';

function removeDirRecursive(dirPath: string): void {
    if (platform() === 'win32') {
        execSync(`rd /s /q "${dirPath}"`, { stdio: 'pipe' });
    } else {
        rmSync(dirPath, { recursive: true, force: true });
    }
}

function clearDirExceptLogs(dirPath: string): void {
    if (!existsSync(dirPath)) return;
    for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
        if (entry.name === 'logs') continue;
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            removeDirRecursive(fullPath);
        } else {
            rmSync(fullPath, { force: true });
        }
    }
}

function copyDirContents(srcDir: string, destDir: string): void {
    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        cpSync(
            path.join(srcDir, entry.name),
            path.join(destDir, entry.name),
            { recursive: true, force: true },
        );
    }
}

function backupUserRoot(userRoot: string, backupPath: string): void {
    mkdirSync(backupPath, { recursive: true });
    for (const entry of readdirSync(userRoot, { withFileTypes: true })) {
        if (entry.name === 'logs') continue;
        cpSync(
            path.join(userRoot, entry.name),
            path.join(backupPath, entry.name),
            { recursive: true },
        );
    }
}

function detectShellRcFile(homeDir: string): string | null {
    const shell = process.env.SHELL || '';
    if (shell.includes('zsh'))  return path.join(homeDir, '.zshrc');
    if (shell.includes('fish')) return path.join(homeDir, '.config', 'fish', 'config.fish');
    if (shell.includes('bash')) {
        const candidates = [path.join(homeDir, '.bash_profile'), path.join(homeDir, '.bashrc')];
        return candidates.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
    }
    const fallbacks = [path.join(homeDir, '.zshrc'), path.join(homeDir, '.bashrc'), path.join(homeDir, '.bash_profile')];
    return fallbacks.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
}

const PACKAGE_JSON_TEMPLATE = `{
  "name": "tyr-commands",
  "version": "1.0.0",
  "type": "module",
  "private": true,
  "description": "Comandos personalizados de Tyr (~/.tyr/)",
  "dependencies": {
    "@orxataguy/tyr": "latest"
  }
}
`;

const TSCONFIG_TEMPLATE = `{
  "compilerOptions": {
    "target": "ESNext",
    "module": "ESNext",
    "moduleResolution": "node",
    "esModuleInterop": true,
    "strict": true,
    "allowSyntheticDefaultImports": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["commands/**/*.ts"]
}
`;

const ENV_TEMPLATE = `# ~/.tyr/.env
# Variables de entorno para Tyr. Este archivo nunca debe subirse a git.
#
# Base de datos SQL Server
MSSQL_USER=
MSSQL_PASSWORD=
MSSQL_SERVER=
MSSQL_DATABASE=
# Basde de datos de Mongo
MONGO_URI=
MONGO_DATABASE=
`;

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

function makeTimestamp(): string {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}`;
}

async function configureUnixShell(tyrFs: any, logger: any, homeDir: string, aliasesPath: string, pluginsPath: string): Promise<void> {
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

async function configureWindowsShell(tyrFs: any, logger: any, aliasesPath: string, pluginsPath: string): Promise<void> {
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

export default function config({ logger, fs: tyrFs, frameworkRoot, shell }: TyrContext) {
    return async (args: string[]) => {
        const homeDir = homedir();
        const userRoot = path.join(homeDir, '.tyr');
        const isWindows = platform() === 'win32';
        const ext = isWindows ? '.ps1' : '';

        // Parse --repo <url>
        const repoIndex = args.indexOf('--repo');
        const repoUrl = repoIndex !== -1 ? (args[repoIndex + 1] ?? null) : null;

        if (repoIndex !== -1 && (!repoUrl || repoUrl.startsWith('--'))) {
            logger.error('Falta la URL del repositorio.');
            logger.info('Uso: tyr --config --repo <url>');
            return;
        }

              let backupPath: string | null = null;
        if (existsSync(userRoot)) {
            backupPath = `${userRoot}.bak.${makeTimestamp()}`;
            backupUserRoot(userRoot, backupPath);
            logger.warn(`Configuración anterior respaldada en: ${backupPath}`);
        }

               let repoHasContent = false;
        if (repoUrl) {
            const tempDir = `${userRoot}.setup-temp`;
            if (existsSync(tempDir)) {
                try { removeDirRecursive(tempDir); } catch {}
            }

            logger.info(`\nClonando repositorio: ${repoUrl}`);
            try {
                await shell.exec(`git clone "${repoUrl}" "${tempDir}"`);
            } catch (e) {
                if (existsSync(tempDir)) {
                    try { removeDirRecursive(tempDir); } catch {}
                }
                throw e;
            }

            repoHasContent = existsSync(path.join(tempDir, 'map.yml'));
            logger.success(repoHasContent
                ? 'Repositorio clonado con configuración existente.'
                : 'Repositorio vacío — iniciando configuración por defecto...');

            clearDirExceptLogs(userRoot);
            copyDirContents(tempDir, userRoot);
            try { removeDirRecursive(tempDir); } catch {}
        }

        if (!repoHasContent) {
            logger.info('\nInicializando ~/.tyr...\n');

            await tyrFs.createDir(path.join(userRoot, 'commands'));
            logger.success(`Directorio creado: ${path.join(userRoot, 'commands')}`);

            const aliasesPath = path.join(userRoot, `aliases${ext}`);
            if (!tyrFs.exists(aliasesPath)) {
                await tyrFs.write(aliasesPath, isWindows ? PS_ALIASES_TEMPLATE : SH_ALIASES_TEMPLATE);
                logger.success(`Archivo creado: ${aliasesPath}`);
            }

            const pluginsPath = path.join(userRoot, `plugins${ext}`);
            if (!tyrFs.exists(pluginsPath)) {
                await tyrFs.write(pluginsPath, isWindows ? PS_PLUGINS_TEMPLATE : SH_PLUGINS_TEMPLATE);
                logger.success(`Archivo creado: ${pluginsPath}`);
            }

            const mapPath = path.join(userRoot, 'map.yml');
            await tyrFs.write(mapPath, 'commands: {}\n');
            logger.success(`Archivo creado: ${mapPath}`);

            const envPath = path.join(userRoot, '.env');
            if (!tyrFs.exists(envPath)) {
                await tyrFs.write(envPath, ENV_TEMPLATE);
                logger.success(`Archivo creado: ${envPath}`);
            }

            const packageJsonPath = path.join(userRoot, 'package.json');
            if (!tyrFs.exists(packageJsonPath)) {
                await tyrFs.write(packageJsonPath, PACKAGE_JSON_TEMPLATE);
                logger.success(`Archivo creado: ${packageJsonPath}`);
            }

            const tsconfigPath = path.join(userRoot, 'tsconfig.json');
            if (!tyrFs.exists(tsconfigPath)) {
                await tyrFs.write(tsconfigPath, TSCONFIG_TEMPLATE);
                logger.success(`Archivo creado: ${tsconfigPath}`);
            }

            logger.info('\nInstalando dependencias de tipos en ~/.tyr...');
            shell.cd(userRoot);
            try {
                await shell.exec('npm install');
                logger.success('Dependencias instaladas correctamente.');
            } catch {
                logger.warn('No se pudo ejecutar npm install en ~/.tyr. Hazlo manualmente.');
            }

            if (repoUrl) {
                logger.info('\nSubiendo configuración inicial al repositorio...');
                shell.cd(userRoot);
                try {
                    await shell.exec('git add .');
                    await shell.exec('git commit -m "Initial tyr configuration"');
                    await shell.exec('git push -u origin HEAD');
                    logger.success('Configuración subida al repositorio.');
                } catch (e) {
                    logger.warn('No se pudo hacer push automático. Hazlo manualmente desde ~/.tyr');
                }
            }
        }

        // Garantizar package.json + tsconfig.json + npm install siempre,
        // tanto en init fresh como al clonar un repo existente.
        const packageJsonPath = path.join(userRoot, 'package.json');
        const tsconfigPath    = path.join(userRoot, 'tsconfig.json');
        let needsInstall = false;

        if (!tyrFs.exists(packageJsonPath)) {
            await tyrFs.write(packageJsonPath, PACKAGE_JSON_TEMPLATE);
            logger.success(`Archivo creado: ${packageJsonPath}`);
            needsInstall = true;
        }

        if (!tyrFs.exists(tsconfigPath)) {
            await tyrFs.write(tsconfigPath, TSCONFIG_TEMPLATE);
            logger.success(`Archivo creado: ${tsconfigPath}`);
            needsInstall = true;
        }

        if (needsInstall) {
            logger.info('\nInstalando dependencias de tipos en ~/.tyr...');
            shell.cd(userRoot);
            try {
                await shell.exec('npm install');
                logger.success('Dependencias instaladas.');
            } catch {
                logger.warn('No se pudo ejecutar npm install en ~/.tyr. Hazlo manualmente.');
            }
        }

        const aliasesPath = path.join(userRoot, `aliases${ext}`);
        const pluginsPath = path.join(userRoot, `plugins${ext}`);

        if (tyrFs.exists(aliasesPath) || tyrFs.exists(pluginsPath)) {
            logger.info('\nConfigurando shell...');
            if (isWindows) {
                await configureWindowsShell(tyrFs, logger, aliasesPath, pluginsPath);
            } else {
                await configureUnixShell(tyrFs, logger, homeDir, aliasesPath, pluginsPath);
            }
        }

        logger.success('\nTyr configurado correctamente.');
        logger.info(`Directorio de configuración: ${userRoot}`);
        if (repoUrl) logger.info(`Repositorio vinculado: ${repoUrl}`);
        logger.info('\nPróximos pasos:');
        logger.info('  tyr gen <nombre> <archivo>   Crear un nuevo comando');
        logger.info('  tyr doc                      Ver documentación de la API');
    };
}
