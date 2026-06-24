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
            logger.error('Missing command name to remove.');
            return;
        }

        logger.info(`Starting removal of command: '${commandName}'`);

        const mapPath = path.join(userRoot, 'map.yml');

        try {
            const currentConfigRaw = await fs.read(mapPath);
            if (!currentConfigRaw) {
                logger.error(`${mapPath} not found. Run 'tyr --config' first.`);
                return;
            }

            const config = yaml.load(currentConfigRaw) as TyrConfig;

            if (!config.commands?.[commandName]) {
                logger.error(`Command '${commandName}' does not exist in ~/.tyr/map.yml.`);
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
                        logger.info(`Alias '${alias}' removed.`);
                    }
                }
            }

            const newYaml = yaml.dump(config, { indent: 2, lineWidth: -1 });
            await fs.write(mapPath, newYaml);

            logger.success(`Command '${commandName}' removed.`);
        } catch (e) {
            logger.error('Critical error during removal.');
            console.error(e);
        }
    };
}
