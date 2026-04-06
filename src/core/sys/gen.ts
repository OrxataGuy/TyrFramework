import path from 'path';
import yaml from 'js-yaml';
import type { TyrContext } from '../Kernel';

interface TyrConfig {
    commands: Record<string, string>;
    aliases?: Record<string, string>;
}

const template = `
import { TyrContext } from '../core/Kernel';

export default ({ run, task, fail, logger }: TyrContext) => {
    return async (args: string[]) => {
        logger.info("Ejecutando comando: %s");

        // Tu lógica aquí...
        // Ejecuta "tyr doc" para ver la documentación

        logger.success("¡Comando %s finalizado!");
    };
};

export const Test = { args: [ ] };
`;

export default function gen({ logger, fs, userRoot }: TyrContext) {
    return async (args: string[]) => {
        const commandName = args[0];
        const fileName = args[1];

        if (!commandName || !fileName) {
            logger.error('Uso incorrecto.');
            logger.info('Sintaxis: tyr gen [nombre-comando] [nombre-archivo]');
            return;
        }

        logger.info(`Creando nuevo comando: '${commandName}' -> '${fileName}.tyr.ts'`);

        const commandsDir = path.join(userRoot, 'commands');
        const filePath = path.join(commandsDir, `${fileName}.tyr.ts`);

        if (fs.exists(filePath)) {
            logger.error(`El archivo ${fileName}.tyr.ts ya existe. Abortando.`);
            return;
        }

        const templateFilled = template.replaceAll('%s', commandName);
        await fs.write(filePath, templateFilled.trim());

        // Register in ~/.tyr/map.yml
        const mapPath = path.join(userRoot, 'map.yml');
        try {
            const currentConfigRaw = await fs.read(mapPath);
            const config = (yaml.load(currentConfigRaw ?? 'commands: {}') ?? { commands: {} }) as TyrConfig;

            if (!config.commands) config.commands = {};

            if (config.commands[commandName]) {
                logger.warn(`El comando '${commandName}' ya existía. Actualizando ruta...`);
            }

            // Store path relative to userRoot so it remains portable
            config.commands[commandName] = `./commands/${fileName}.tyr.ts`;

            const newYaml = yaml.dump(config, { indent: 2, lineWidth: -1 });
            await fs.write(mapPath, newYaml);

            logger.success(`Comando '${commandName}' creado en ${filePath}`);
            logger.success(`Registrado en ${mapPath}`);
        } catch (e) {
            logger.error('Error al actualizar la configuración.');
            console.error(e);
        }
    };
}
