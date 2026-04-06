import { TyrContext } from '../core/Kernel';
import { homedir, platform } from 'os';
import { existsSync } from 'fs';
import path from 'path';

function detectShellRcFile(homeDir: string): string | null {
    const shell = process.env.SHELL || '';

    if (shell.includes('zsh')) return path.join(homeDir, '.zshrc');
    if (shell.includes('fish')) return path.join(homeDir, '.config', 'fish', 'config.fish');
    if (shell.includes('bash')) {
        const candidates = [
            path.join(homeDir, '.bash_profile'),
            path.join(homeDir, '.bashrc'),
        ];
        return candidates.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
    }

    // Fallback: try common files in order
    const fallbacks = [
        path.join(homeDir, '.zshrc'),
        path.join(homeDir, '.bashrc'),
        path.join(homeDir, '.bash_profile'),
    ];
    return fallbacks.find(p => existsSync(p)) ?? path.join(homeDir, '.bashrc');
}

async function getPowerShellProfile(shell: any): Promise<string | null> {
    try {
        const profile = await shell.exec('powershell -NoProfile -Command "$PROFILE"').catch(() => null);
        return profile?.trim() || null;
    } catch {
        return null;
    }
}

export default ({ task, fail, logger, fs, shell }: TyrContext) => {
    return async (args: string[]) => {
        const homeDir = homedir();
        const isWindows = platform() === 'win32';

        const tfgPath = path.join(homeDir, 'Projects', 'TyrFramework');
        const addonsPath = path.join(tfgPath, 'local');
        const aliasesTemplatePath = path.join(homeDir, 'avantio', 'framework', 'core', 'include', 'bin', 'aliases.template.sh');
        const pluginsTemplatePath = path.join(homeDir, 'avantio', 'framework', 'core', 'include', 'bin', 'plugins.template.sh');

        await task('Verificando directorio TFG', async () => {
            if (!fs.exists(tfgPath)) {
                fail(
                    `El directorio ${tfgPath} no existe`,
                    'Asegúrate de que la ruta ~/Projects/TyrFramework existe'
                );
            }
            logger.success(`Directorio TFG encontrado: ${tfgPath}`);
        });

        await task('Verificando templates', async () => {
            if (!fs.exists(aliasesTemplatePath)) {
                fail(
                    `Template de aliases no encontrado: ${aliasesTemplatePath}`,
                    'Verifica que el framework de Avantio esté correctamente instalado'
                );
            }

            if (!fs.exists(pluginsTemplatePath)) {
                fail(
                    `Template de plugins no encontrado: ${pluginsTemplatePath}`,
                    'Verifica que el framework de Avantio esté correctamente instalado'
                );
            }

            logger.success('Templates encontrados');
        });

        await task('Creando carpeta local', async () => {
            await fs.createDir(addonsPath);
            logger.success(`Carpeta creada: ${addonsPath}`);
        });

        await task('Copiando aliases.template.sh', async () => {
            const aliasesContent = await fs.read(aliasesTemplatePath);
            if (!aliasesContent) {
                fail('No se pudo leer el contenido de aliases.template.sh');
            }
            await fs.write(path.join(addonsPath, 'aliases.sh'), aliasesContent!);
            logger.success(`Archivo creado: ${path.join(addonsPath, 'aliases.sh')}`);
        });

        await task('Copiando plugins.template.sh', async () => {
            const pluginsContent = await fs.read(pluginsTemplatePath);
            if (!pluginsContent) {
                fail('No se pudo leer el contenido de plugins.template.sh');
            }
            await fs.write(path.join(addonsPath, 'plugins.sh'), pluginsContent!);
            logger.success(`Archivo creado: ${path.join(addonsPath, 'plugins.sh')}`);
        });

        if (isWindows) {
            await task('Configurando perfil de PowerShell', async () => {
                const psProfile = await getPowerShellProfile(shell);
                if (psProfile) {
                    const sourceLine = `. "${path.join(addonsPath, 'aliases.sh')}"`;
                    await fs.ensureLine(psProfile, sourceLine);
                    logger.success(`Aliases añadidos al perfil de PowerShell: ${psProfile}`);
                    logger.info('Reinicia PowerShell para aplicar los cambios');
                } else {
                    logger.warn('No se pudo detectar el perfil de PowerShell.');
                    logger.info(`Añade manualmente a tu perfil: . "${path.join(addonsPath, 'aliases.sh')}"`);
                }
            });
        } else {
            await task('Configurando shell', async () => {
                const rcFile = detectShellRcFile(homeDir);
                if (!rcFile) {
                    logger.warn('No se pudo detectar el archivo de configuración de shell. Configura manualmente.');
                    return;
                }

                const sourceLine = `source "${path.join(addonsPath, 'aliases.sh')}"`;
                await fs.ensureLine(rcFile, sourceLine);
                logger.success(`Aliases añadidos a: ${rcFile}`);
                logger.info(`Ejecuta: source ${rcFile}  (o abre una nueva terminal)`);
            });
        }

        logger.success('\nEstructura de addons configurada exitosamente');
        logger.info(`\nArchivos creados en: ${addonsPath}`);
        logger.info('  - aliases.sh');
        logger.info('  - plugins.sh');
    };
};

// export const Test = {
//     args: []
// }
