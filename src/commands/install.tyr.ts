import { TyrContext } from '../core/Kernel';

export default ({ task, fail, logger, fs, shell }: TyrContext) => {
    return async (args: string[]) => {
        const homeDir = process.env.HOME || process.env.USERPROFILE;
        if (!homeDir) {
            fail('No se pudo determinar el directorio HOME del usuario');
        }

        const tfgPath = `${homeDir}/Documents/Archivo/tfg`;
        const addonsPath = `${tfgPath}/local`;
        const aliasesTemplatePath = `${homeDir}/avantio/framework/core/include/bin/aliases.template.sh`;
        const pluginsTemplatePath = `${homeDir}/avantio/framework/core/include/bin/plugins.template.sh`;
        const zshrcPath = `${homeDir}/.zshrc`;

        await task('Verificando directorio TFG', async () => {
            if (!fs.exists(tfgPath)) {
                fail(
                    `El directorio ${tfgPath} no existe`,
                    'Asegúrate de que la ruta ~/Documents/Archivo/tfg existe'
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
            await fs.write(`${addonsPath}/aliases.sh`, aliasesContent);
            logger.success(`Archivo creado: ${addonsPath}/aliases.sh`);
        });

        await task('Copiando plugins.template.sh', async () => {
            const pluginsContent = await fs.read(pluginsTemplatePath);
            if (!pluginsContent) {
                fail('No se pudo leer el contenido de plugins.template.sh');
            }
            await fs.write(`${addonsPath}/plugins.sh`, pluginsContent);
            logger.success(`Archivo creado: ${addonsPath}/plugins.sh`);
        });

        await task('Configurando alias tyre en .zshrc', async () => {
            if (!fs.exists(zshrcPath)) {
                logger.warn(`Archivo .zshrc no encontrado, se creará uno nuevo`);
                await fs.write(zshrcPath, '# Configuración de Zsh\n\n');
            }

            const tyreAliasDefinition = `
# Alias para Tyr Framework (TFG)
tyre() {
    cd ~/Documents/Archivo/tfg && nvm use 23 > /dev/null && npm link > /dev/null && tyr "$@"
}
`;

            const zshrcContent = await fs.read(zshrcPath);
            if (zshrcContent && zshrcContent.includes('tyre()')) {
                logger.warn('⚠ El alias tyre ya existe en .zshrc, se omitirá');
            } else {
                await fs.write(zshrcPath, (zshrcContent || '') + tyreAliasDefinition);
                logger.success('Alias tyre añadido a .zshrc');
            }
        });

        logger.success('\n🎉 Estructura de addons configurada exitosamente');
        logger.info(`\nArchivos creados en: ${addonsPath}`);
        logger.info('  - aliases.sh');
        logger.info('  - plugins.sh');
        logger.info(`\nAlias configurado en: ${zshrcPath}`);
        logger.info('  - tyre → ejecuta Tyr desde el directorio TFG');
        logger.warn('\n⚠ Recuerda ejecutar: source ~/.zshrc  para activar el alias');
        logger.info('O simplemente abre una nueva terminal\n');
    };
};