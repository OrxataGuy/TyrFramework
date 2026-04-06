import { TyrContext } from '../core/Kernel';
import path from 'path';
import { homedir } from 'os';

export default ({ task, fail, logger, fs }: TyrContext) => {
    return async (_args: string[]) => {
        const homeDir = homedir();
        const userRoot = path.join(homeDir, '.tyr');

        const aliasesTemplatePath = path.join(homeDir, 'avantio', 'framework', 'core', 'include', 'bin', 'aliases.template.sh');
        const pluginsTemplatePath = path.join(homeDir, 'avantio', 'framework', 'core', 'include', 'bin', 'plugins.template.sh');

        const aliasesTarget = path.join(userRoot, 'aliases');
        const pluginsTarget = path.join(userRoot, 'plugins');

        await task('Verificando configuración de Tyr', async () => {
            if (!fs.exists(userRoot)) {
                fail(
                    'El directorio ~/.tyr no existe.',
                    "Ejecuta 'tyr --config' antes de continuar."
                );
            }
            logger.success(`Directorio ~/.tyr encontrado: ${userRoot}`);
        });

        await task('Verificando templates de Avantio', async () => {
            if (!fs.exists(aliasesTemplatePath)) {
                fail(
                    `Template de aliases no encontrado: ${aliasesTemplatePath}`,
                    'Verifica que el framework de Avantio esté correctamente instalado.'
                );
            }
            if (!fs.exists(pluginsTemplatePath)) {
                fail(
                    `Template de plugins no encontrado: ${pluginsTemplatePath}`,
                    'Verifica que el framework de Avantio esté correctamente instalado.'
                );
            }
            logger.success('Templates de Avantio encontrados.');
        });

        await task('Copiando aliases de Avantio', async () => {
            const content = await fs.read(aliasesTemplatePath);
            if (!content) fail('No se pudo leer aliases.template.sh');
            await fs.write(aliasesTarget, content!);
            logger.success(`Aliases copiados a: ${aliasesTarget}`);
        });

        await task('Copiando plugins de Avantio', async () => {
            const content = await fs.read(pluginsTemplatePath);
            if (!content) fail('No se pudo leer plugins.template.sh');
            await fs.write(pluginsTarget, content!);
            logger.success(`Plugins copiados a: ${pluginsTarget}`);
        });

        logger.success('\nInstalación de Avantio completada.');
        logger.info(`  aliases → ${aliasesTarget}`);
        logger.info(`  plugins → ${pluginsTarget}`);
        logger.warn('\nRecuerda recargar tu shell para aplicar los cambios.');
    };
};
