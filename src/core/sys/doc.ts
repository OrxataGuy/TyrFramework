import fs from 'fs';
import path from 'path';
import http from 'http';
import { TyrContext } from '../Kernel';

interface DocMethod {
    name: string;
    description: string;
    example: string | null;
}

interface DocStructure {
    name: string;
    description: string;
    methods: DocMethod[];
}

export default function doc({ logger, frameworkRoot }: TyrContext) {
    return async (args: string[]) => {
        logger.info("📚 Generando documentación del sistema (TS Mode)...");

        const libPath = path.resolve(frameworkRoot, 'src/lib');

        const parseJSDoc = (filename: string, content: string): DocStructure => {
            const fileDoc: DocStructure = {
                name: filename,
                description: "Sin descripción.",
                methods: []
            };

            const cleanJSDoc = (raw: string) => {
                return raw
                    .split('\n')
                    .map(line => {
                        return line.trim().replace(/^\*+\s?/, '');
                    })
                    .filter(line => line !== '')
                    .join('\n');
            };

            const commentRegex = /\/\*\*([\s\S]*?)\*\//g;
            let match;

            while ((match = commentRegex.exec(content)) !== null) {
                const rawComment = match[1];
                const cleanComment = cleanJSDoc(rawComment);

                const nextCodeIndex = commentRegex.lastIndex;
                const codeSnippet = content.substring(nextCodeIndex, nextCodeIndex + 200);

                const isClass = /@class/.test(cleanComment) || /^\s*export\s+class/.test(codeSnippet);

                if (isClass) {
                    const descMatch = cleanComment.match(/@description\s+([\s\S]*?)(?=@|$)/i);
                    if (descMatch) {
                        fileDoc.description = descMatch[1].trim();
                    } else {
                        fileDoc.description = cleanComment.split('\n')[0];
                    }
                    const classNameMatch = codeSnippet.match(/class\s+(\w+)/);
                    if (classNameMatch) fileDoc.name = classNameMatch[1];
                    continue;
                }

                let methodName = null;

                const methodTagMatch = cleanComment.match(/@method\s+(\w+)/i);
                if (methodTagMatch) {
                    methodName = methodTagMatch[1];
                } else if (!codeSnippet.match(/^\s*constructor/)) {
                    const codeMatch = codeSnippet.match(/(?:public|private|protected)\s+(?:async\s+)?(\w+)/);
                    if (codeMatch) {
                        methodName = codeMatch[1];
                    }
                }

                if (methodName) {
                    let description = "";
                    const descMatch = cleanComment.match(/@description\s+([\s\S]*?)(?=@|$)/i);
                    if (descMatch) {
                        description = descMatch[1].trim();
                    } else {
                        const textLines = cleanComment.split('\n').filter(l => !l.startsWith('@'));
                        description = textLines.join(' ').trim() || "Sin descripción";
                    }

                    let example = null;
                    const exampleMatch = cleanComment.match(/@example([\s\S]*?)(?=@|$)/i);
                    if (exampleMatch) {
                        example = exampleMatch[1]
                            .replace(/```ts|```/g, '')
                            .trim();
                    }

                    fileDoc.methods.push({
                        name: methodName,
                        description: description,
                        example: example
                    });
                }
            }

            return fileDoc;
        };

        if (!fs.existsSync(libPath)) {
            logger.error(`No se encuentra la carpeta de librerías: ${libPath}`);
            return;
        }

        const files = fs.readdirSync(libPath).filter(f => f.endsWith('.ts'));

        if (files.length === 0) {
            logger.warn("No se encontraron archivos .ts en /src/lib para documentar.");
        }

        const fileDocs = files.map(file => {
            return parseJSDoc(file, fs.readFileSync(path.join(libPath, file), 'utf8'));
        });

        const systemDocs: DocStructure = {
            name: 'TyrContext (Kernel)',
            description: 'Utilidades globales inyectadas en cada comando. Accesibles destructurando el contexto.',
            methods: [
                {
                    name: 'run',
                    description: 'Ejecuta otro comando del sistema programáticamente (Composición de comandos). Útil para que un comando invoque a otros.',
                    example: `
// Llama al comando 'test' pasándole argumentos adicionales
const secret = "123";
args.push(secret);
await run('test', args);`.trim()
                },
                {
                    name: 'task',
                    description: 'Helper que envuelve una operación crítica. Si falla, el framework captura el error, añade contexto y lo muestra limpio en consola. Elimina la necesidad de try/catch manuales.',
                    example: `
// Ejemplo: Tarea asíncrona que retorna un valor
const buildId = await task('Compilando proyecto', async () => {
    return await shell.exec('npm run build');
});

// Si falla, el log dirá: "Falló la tarea: Compilando proyecto"`.trim()
                },
                {
                    name: 'fail',
                    description: 'Detiene la ejecución del comando inmediatamente lanzando un error controlado. Permite añadir una "sugerencia" para ayudar al usuario a solucionarlo.',
                    example: `
// Úsalo para validaciones lógicas
if (!fs.existsSync('./package.json')) {
    fail(
        'No se encuentra el archivo package de npm', 
        'Ejecuta "npm init -y" para generar uno.'
    );
}`.trim()
                },
                {
                    name: 'logger',
                    description: 'Sistema de logs estandarizado con colores y formatos.',
                    example: `logger.info('Iniciando...');\nlogger.success('Creado');\nlogger.warn('Cuidado');`
                }
            ]
        };

        const docs = [systemDocs, ...fileDocs];

        // Generar documentación detallada de todos los módulos para el prompt
        const generateModulesDocs = () => {
            return docs.map(module => {
                const methodsList = module.methods.map(method => {
                    let methodDoc = `   • ${method.name}()\n     ${method.description}`;
                    if (method.example) {
                        methodDoc += `\n     Ejemplo:\n     ${method.example.split('\n').map(l => '     ' + l).join('\n')}`;
                    }
                    return methodDoc;
                }).join('\n\n');

                return `📦 ${module.name}\n${module.description}\n\n${methodsList}`;
            }).join('\n\n' + '='.repeat(80) + '\n\n');
        };

        const promptTemplate = `
Necesito que crees un comando para el framework Tyr siguiendo esta estructura OBLIGATORIA:

\`\`\`typescript
import { TyrContext } from '../core/Kernel';

export default ({ run, task, fail, logger, docker, fs, git, pkg, db, shell, sys, web }: TyrContext) => {
    return async (args: string[]) => {
        
        // Tu implementación aquí...
        
    };
};
\`\`\`

===============================================================================
CONTEXTO DEL SISTEMA - TyrContext
===============================================================================

Las siguientes utilidades están disponibles destructurando TyrContext:

🔧 UTILIDADES DEL KERNEL (siempre disponibles):

- run(comando: string, args: string[]): Promise<void>
  Ejecuta otro comando del sistema programáticamente
  Ejemplo: await run('test', ['--verbose']);

- task(descripción: string, fn: () => Promise<T>): Promise<T>
  Envuelve operaciones críticas con manejo automático de errores
  Ejemplo: await task('Compilando', async () => { ... });

- fail(mensaje: string, sugerencia?: string): never
  Detiene ejecución con error controlado y sugerencia opcional
  Ejemplo: fail('Archivo no encontrado', 'Ejecuta npm init');

- logger: objeto con métodos de logging
  - logger.info(msg): Información general
  - logger.success(msg): Operación exitosa  
  - logger.warn(msg): Advertencia
  - logger.error(msg): Error

===============================================================================
MÓDULOS Y FUNCIONES DISPONIBLES
===============================================================================

${generateModulesDocs()}

===============================================================================
REGLAS OBLIGATORIAS
===============================================================================

- Export DEBE ser default
- Destructurar del TyrContext SOLO lo que necesites
- Retornar función async que recibe args: string[]
- Usar task() para operaciones que puedan fallar
- Usar fail() para validaciones y errores controlados

===============================================================================
EJEMPLO DE COMANDO COMPLETO DOCUMENTADO
===============================================================================

\`\`\`typescript
/**
 * @class
 * @description Gestiona operaciones con archivos de configuración JSON
 */

import { TyrContext } from '../core/Kernel';

export default ({ task, fail, logger, fs }: TyrContext) => {
    return async (args: string[]) => {
        if (args.length === 0) {
            fail('No se especificó ningún archivo', 'Usa: config validate <archivo.json>');
        }
        
        const [action, filepath] = args;
        
        if (action === 'validate') {
            await task('Validando configuración', async () => {
                if (!await fs.exists(filepath)) {
                    fail(\`Archivo no encontrado: \${filepath}\`);
                }
                
                const content = await fs.read(filepath);
                try {
                    JSON.parse(content);
                    logger.success('✓ Configuración válida');
                } catch (e) {
                    fail('JSON inválido', 'Revisa la sintaxis del archivo');
                }
            });
        }
    };
};
\`\`\`

===============================================================================
AHORA DESCRIBE QUÉ DEBE HACER TU COMANDO
===============================================================================

[Escribe aquí tu descripción del comando que necesitas crear]
`.trim();

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8"> 
            <title>Tyr Docs</title>
            <style>
                body { font-family: 'Segoe UI', sans-serif; background: #222; color: #eee; padding: 20px; display: flex; margin: 0; }
                nav { width: 220px; border-right: 1px solid #444; margin-right: 20px; padding-right: 20px; height: 100vh; overflow-y: auto; position: sticky; top: 0; }
                a { color: #4db8ff; text-decoration: none; display: block; margin: 8px 0; padding: 5px; border-radius: 4px; transition: 0.2s; }
                a:hover { background: #333; }
                main { flex: 1; overflow-y: auto; }
                .card { background: #2d2d2d; padding: 20px; margin-bottom: 30px; border-radius: 8px; border: 1px solid #333; }
                h2 { border-bottom: 1px solid #444; padding-bottom: 10px; margin-top: 0; color: #fff; }
                .method { margin-top: 25px; padding-left: 15px; border-left: 3px solid #4db8ff; }
                h3 { margin: 0 0 5px 0; color: #4db8ff; font-family: monospace; font-size: 1.2em; }
                .desc { color: #ccc; margin-bottom: 10px; }
                pre { background: #1a1a1a; padding: 15px; border-radius: 5px; overflow-x: auto; border: 1px solid #444; color: #ce9178; font-family: monospace; white-space: pre-wrap; }
                .tag-ts { background: #007acc; color: white; padding: 2px 6px; border-radius: 3px; font-size: 0.7em; margin-left: 10px; vertical-align: middle; }
                .prompt-box { background: #1a1a1a; border: 2px solid #4db8ff; padding: 25px; border-radius: 8px; margin-top: 40px; position: relative; }
                .prompt-box h2 { color: #4db8ff; margin-top: 0; border: none; }
                .copy-btn { position: absolute; top: 20px; right: 20px; background: #4db8ff; color: #000; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: bold; transition: 0.2s; }
                .copy-btn:hover { background: #6dc9ff; }
                .copy-btn:active { background: #2da3e0; }
            </style>
        </head>
        <body>
            <nav>
                <h3 style="color: #888; text-transform: uppercase; font-size: 0.8rem;">Módulos TS</h3>
                ${docs.map(d => `<a href="#${d.name}">📦 ${d.name.replace('.ts', '')}</a>`).join('')}
                <a href="#prompt-template" style="margin-top: 20px; background: #4db8ff; color: #000; font-weight: bold;">🤖 Prompt Generator</a>
            </nav>
            <main>
                ${docs.map(d => `
                    <div id="${d.name}" class="card">
                        <h2>${d.name} <span class="tag-ts">TS</span></h2>
                        <p style="font-size: 1.1em; color: #bbb;">${d.description}</p>
                        ${d.methods.map(m => `
                            <div class="method">
                                <h3>${m.name}()</h3>
                                <p class="desc">${m.description}</p>
                                ${m.example ? `<pre>${m.example}</pre>` : ''}
                            </div>
                        `).join('')}
                    </div>
                `).join('')}
                
                <div id="prompt-template" class="prompt-box">
                    <button class="copy-btn" onclick="copyPrompt()">📋 Copiar Prompt</button>
                    <h2>🤖 Generador de Comandos - Prompt Template</h2>
                    <p style="color: #bbb; margin-bottom: 20px;">
                        Copia este prompt completo, pégalo en tu conversación con Claude y describe tu comando al final.
                        <br><strong>Incluye toda la documentación de módulos disponibles.</strong>
                    </p>
                    <pre id="prompt-content">${promptTemplate.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</pre>
                </div>
            </main>
            <script>
                function copyPrompt() {
                    const promptText = document.getElementById('prompt-content').textContent;
                    navigator.clipboard.writeText(promptText).then(() => {
                        const btn = document.querySelector('.copy-btn');
                        const originalText = btn.textContent;
                        btn.textContent = '✅ Copiado!';
                        btn.style.background = '#4ade80';
                        setTimeout(() => {
                            btn.textContent = originalText;
                            btn.style.background = '#4db8ff';
                        }, 2000);
                    }, () => {
                        alert('Error al copiar. Selecciona manualmente el texto.');
                    });
                }
            </script>
        </body>
        </html>`;

        const PORT = 3000;
        const server = http.createServer((req, res) => {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });

        server.listen(PORT, () => {
            logger.success(`Documentación TS lista en: http://localhost:${PORT}`);
            logger.info("Presiona Ctrl+C para detener.");
        });
    };
};