import path from 'path';
import yaml from 'js-yaml';
import type { TyrContext } from '../Kernel';

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

export default function rem({ logger, fs, userRoot }: TyrContext) {
    return async (args: string[]) => {
        const commandName = args[0];

        if (!commandName) {
            logger.error('Falta el nombre del comando a eliminar.');
            return;
        }

        logger.info(`Iniciando eliminación del comando: '${commandName}'`);

        const mapPath = path.join(userRoot, 'map.yml');

        try {
            const currentConfigRaw = await fs.read(mapPath);
            if (!currentConfigRaw) {
                logger.error(`No se encontró ${mapPath}. Ejecuta 'tyr --config' primero.`);
                return;
            }

            const config = yaml.load(currentConfigRaw) as TyrConfig;

            if (!config.commands?.[commandName]) {
                logger.error(`El comando '${commandName}' no existe en ~/.tyr/map.yml.`);
                return;
            }

            const relativeScriptPath = config.commands[commandName];
            const absoluteScriptPath = path.resolve(userRoot, relativeScriptPath);

            await fs.delete(absoluteScriptPath);
            delete config.commands[commandName];

            if (config.aliases) {
                for (const [alias, target] of Object.entries(config.aliases)) {
                    if (target === commandName) {
                        delete config.aliases[alias];
                        logger.info(`Alias '${alias}' eliminado.`);
                    }
                }
            }

            const newYaml = yaml.dump(config, { indent: 2, lineWidth: -1 });
            await fs.write(mapPath, newYaml);

            logger.success(`Comando '${commandName}' eliminado.`);
        } catch (e) {
            logger.error('Error crítico durante la eliminación.');
            console.error(e);
        }
    };
}
