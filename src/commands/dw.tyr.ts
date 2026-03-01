import { TyrContext } from '../core/Kernel';

export default ({ task, fail, logger, shell, db, git, fs }: TyrContext) => {
    /**
     * @method extractBranchName
     * @description Extrae el nombre de rama de una URL o devuelve el nombre tal cual
     */
    const extractBranchName = (input: string): string => {
        if (input.includes('/')) {
            const parts = input.split('/');
            return parts[parts.length - 1];
        }
        return input;
    };

    return async (args: string[]) => {

        // Validación de argumentos
        if (args.length === 0) {
            fail(
                'No se especificó la URL del cliente',
                'Uso: clone-client <url-cliente> [url-rama-opcional]'
            );
        }

        const clientUrl = args[0];
        const branchUrlOrName = args[1] || null;

        logger.info('Navegando al directorio de clientes...');
        shell.cd('~/dev/wolbenvironment/dev/websITS/clients');
        console.log("Lanzo con url:", clientUrl)
        const broker = await task('Buscando broker en la base de datos', async () => {
            const result = await db.searchBrokerOnDB(clientUrl);

            if (!result) {
                fail(
                    `No se encontró broker para la URL: ${clientUrl}`,
                    'Verifica que la URL sea correcta y esté registrada en la BD'
                );
            }

            logger.success(`Broker encontrado: ${result}`);
            return result;
        });

        const brokerPath = `~/dev/wolbenvironment/dev/websITS/clients/${broker}`;
        const dirExists = fs.exists(brokerPath);

        if (dirExists) {
            logger.warn(`El directorio '${broker}' ya existe`);

            const choice = await shell.input(
                '¿Qué deseas hacer? (s)obrescribir / (m)antener / (r)enombrar: '
            );

            if (choice.toLowerCase() === 'm' || choice.toLowerCase() === 'mantener') {
                logger.info('Manteniendo directorio existente. Finalizando...');
                return;
            } else if (choice.toLowerCase() === 'r' || choice.toLowerCase() === 'renombrar') {
                await task('Renombrando directorio existente', async () => {
                    await shell.exec(`mv ${broker} ${broker}.bak`);
                    logger.success(`Directorio renombrado a: ${broker}.bak`);
                });
            } else if (choice.toLowerCase() === 's' || choice.toLowerCase() === 'sobrescribir') {
                await task('Eliminando directorio existente', async () => {
                    await shell.exec(`rm -rf ${broker}`);
                    logger.success('Directorio eliminado');
                });
            } else {
                fail('Opción no válida', 'Usa: s (sobrescribir), m (mantener) o r (renombrar)');
            }
        }

        const repoUrl = `git@github.com:Avantio/${broker}`;
        logger.info(`Repositorio: ${repoUrl}`);

        const loader = shell.showLoader('Clonando repositorio desde GitHub...');

        await task('Clonando repositorio', async () => {
            await git.clone(repoUrl);
            loader.stop();
            logger.success('Repositorio clonado exitosamente');
        }, false, () => loader.stop());

        shell.cd(broker);

        let branchName: string;

        if (branchUrlOrName) {
            branchName = extractBranchName(branchUrlOrName);
            logger.info(`Rama extraída: ${branchName}`);
        } else {
            const answer = await shell.input('🌿 ¿Qué rama quieres usar? (nombre o URL): ');
            branchName = extractBranchName(answer);
        }

        await task(`Cambiando a la rama: ${branchName}`, async () => {
            if (branchName.length > 0) {
                await shell.exec(`git checkout -b ${branchName}`);
                logger.success(`Ahora estás en la rama: ${branchName}`);
            } else {
                logger.info('No se va a generar ninguna rama nueva')
            }
        });
        logger.success(`Repositorio ${broker} clonado y configurado exitosamente`);

    };
};

// export const Test = {
//     args: ['https://www.feelporto.com/'],
//     mockInputs: {
//         'sobrescribir': 'm',  
//         'rama': '' 
//     }
// }