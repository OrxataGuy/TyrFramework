import path from 'path';
import yaml from 'js-yaml';
import type { TyrContext } from '../Kernel';

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

const template = `import type { TyrContext } from '@orxataguy/tyr';

export default ({ run, task, fail, logger, shell, fs }: TyrContext) => {
    return async (args: string[]) => {
        logger.info("Running command: %s");

        // Your logic here...
        // Run "tyr doc" to see the documentation for available managers

        logger.success("Command %s finished!");
    };
};

export const Test = { args: [] };
`;

export default function gen({ logger, fs, userRoot }: TyrContext) {
    return async (args: string[]) => {
        const commandName = args[0];
        const fileName = args[1];

        if (!commandName || !fileName) {
            logger.error('Incorrect usage.');
            logger.info('Syntax: tyr gen [command-name] [file-name]');
            return;
        }

        logger.info(`Creating new command: '${commandName}' -> '${fileName}.tyr.ts'`);

        const commandsDir = path.join(userRoot, 'commands');
        const filePath = path.join(commandsDir, `${fileName}.tyr.ts`);

        if (fs.exists(filePath)) {
            logger.error(`File ${fileName}.tyr.ts already exists. Aborting.`);
            return;
        }

        const templateFilled = template.replaceAll('%s', commandName);
        await fs.write(filePath, templateFilled.trim());

        const mapPath = path.join(userRoot, 'map.yml');
        try {
            const currentConfigRaw = await fs.read(mapPath);
            const config = (yaml.load(currentConfigRaw ?? 'commands: {}') ?? { commands: {} }) as TyrConfig;

            if (!config.commands) config.commands = {};

            if (config.commands[commandName]) {
                logger.warn(`Command '${commandName}' already existed. Updating path...`);
            }

            config.commands[commandName] = `./commands/${fileName}.tyr.ts`;

            const newYaml = yaml.dump(config, { indent: 2, lineWidth: -1 });
            await fs.write(mapPath, newYaml);

            logger.success(`Command '${commandName}' created at ${filePath}`);
            logger.success(`Registered in ${mapPath}`);
        } catch (e) {
            logger.error('Error updating configuration.');
            console.error(e);
        }
    };
}
