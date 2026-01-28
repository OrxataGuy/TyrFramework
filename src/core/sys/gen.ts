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
`;

export default function gen({ logger, fs, frameworkRoot }: TyrContext) {
    return async (args: string[]) => {
        const commandName = args[0];
        const fileName = args[1];

        if (!commandName || !fileName) {
            logger.error("Uso incorrecto.");
            logger.info("Sintaxis: tyr gen [nombre-comando] [nombre-archivo]");
            return;
        }

        logger.info(`🔨 Creando nuevo comando: '${commandName}' -> '${fileName}.tyr.ts'`);

        const filePath = path.resolve(frameworkRoot, 'src/commands', `${fileName}.tyr.ts`);

        const templateFilled = template.replaceAll('%s', commandName);

        if (await fs.exists(filePath)) {
            logger.error(`El archivo ${fileName}.tyr.ts ya existe. Abortando.`);
            return;
        }

        await fs.write(filePath, templateFilled.trim());

        const configPath = path.resolve(frameworkRoot, 'config/map.yml');

        try {
            const currentConfigRaw = await fs.read(configPath);
            const config = yaml.load(currentConfigRaw) as unknown as TyrConfig;

            if (config.commands[commandName]) {
                logger.warn(`El comando '${commandName}' ya existía. Actualizando ruta...`);
            }

            config.commands[commandName] = `./src/commands/${fileName}.tyr.ts`;

            const newYaml = yaml.dump(config, { indent: 2, lineWidth: -1 });
            await fs.write(configPath, newYaml);

            logger.success(`✅ Comando '${commandName}' registrado en el núcleo (.tyr.ts).`);
        } catch (e) {
            logger.error("Error al actualizar la configuración.");
            console.error(e);
        }
    };
};