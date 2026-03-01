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

export default function doc({ logger, frameworkRoot, run }: TyrContext) {
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
                <a href="#ai-generator" style="margin-top: 20px; background: #4db8ff; color: #000; font-weight: bold;">🤖 Generador IA</a>
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
                
                <div id="ai-generator" class="prompt-box">
                    <h2>🤖 Generador de Comandos con IA</h2>
                    <p style="color: #bbb; margin-bottom: 20px;">
                        Describe qué debe hacer tu comando y la IA lo generará automáticamente usando la documentación del framework.
                    </p>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #4db8ff; margin-bottom: 5px; font-weight: bold;">Nombre del comando</label>
                        <input type="text" id="cmd-name" placeholder="mi-comando"
                            style="width: 100%; padding: 10px; background: #2d2d2d; border: 1px solid #444; color: #eee; border-radius: 5px; font-size: 1em; box-sizing: border-box;" />
                    </div>
                    <div style="margin-bottom: 15px;">
                        <label style="display: block; color: #4db8ff; margin-bottom: 5px; font-weight: bold;">Describe qué debe hacer el comando</label>
                        <textarea id="cmd-prompt" rows="6" placeholder="Ej: Crea un comando que liste todos los contenedores Docker activos y muestre su estado en una tabla formateada..."
                            style="width: 100%; padding: 10px; background: #2d2d2d; border: 1px solid #444; color: #eee; border-radius: 5px; font-size: 1em; resize: vertical; box-sizing: border-box;"></textarea>
                    </div>
                    <button id="generate-btn" onclick="generateCommand()"
                        style="background: #4db8ff; color: #000; border: none; padding: 12px 24px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 1em; transition: 0.2s; width: 100%;">
                        Generar Comando
                    </button>
                    <div id="gen-status" style="margin-top: 15px; display: none; padding: 15px; border-radius: 5px;"></div>
                </div>
            </main>
            <script>
                async function generateCommand() {
                    const name = document.getElementById('cmd-name').value.trim();
                    const prompt = document.getElementById('cmd-prompt').value.trim();
                    const btn = document.getElementById('generate-btn');
                    const status = document.getElementById('gen-status');

                    if (!name || !prompt) {
                        status.style.display = 'block';
                        status.style.background = '#4a2020';
                        status.style.border = '1px solid #ff4444';
                        status.textContent = 'Rellena ambos campos.';
                        return;
                    }

                    btn.disabled = true;
                    btn.textContent = 'Generando...';
                    btn.style.background = '#888';
                    status.style.display = 'block';
                    status.style.background = '#1a1a2e';
                    status.style.border = '1px solid #4db8ff';
                    status.textContent = 'Enviando prompt a la IA... Esto puede tardar unos segundos.';

                    try {
                        const res = await fetch('/generate', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ name, prompt })
                        });
                        const data = await res.json();

                        if (data.success) {
                            status.style.background = '#1a2e1a';
                            status.style.border = '1px solid #4ade80';
                            status.textContent = data.message;
                        } else {
                            status.style.background = '#4a2020';
                            status.style.border = '1px solid #ff4444';
                            status.textContent = data.message;
                        }
                    } catch (e) {
                        status.style.background = '#4a2020';
                        status.style.border = '1px solid #ff4444';
                        status.textContent = 'Error de conexión con el servidor.';
                    }

                    btn.disabled = false;
                    btn.textContent = 'Generar Comando';
                    btn.style.background = '#4db8ff';
                }
            </script>
        </body>
        </html>`;

        const PORT = 3000;
        const server = http.createServer(async (req, res) => {
            if (req.method === 'POST' && req.url === '/generate') {
                let body = '';
                req.on('data', (chunk: Buffer) => { body += chunk.toString(); });
                req.on('end', async () => {
                    try {
                        const { name, prompt } = JSON.parse(body);
                        if (!name || !prompt) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ success: false, message: 'Faltan campos obligatorios.' }));
                            return;
                        }

                        await run('ai', [name, prompt]);

                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: true, message: `Comando '${name}' generado correctamente en src/commands/${name}.tyr.ts` }));
                    } catch (e: any) {
                        res.writeHead(500, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ success: false, message: e.message || 'Error al generar el comando.' }));
                    }
                });
                return;
            }

            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(html);
        });

        server.listen(PORT, () => {
            logger.success(`Documentación TS lista en: http://localhost:${PORT}`);
            logger.info("Presiona Ctrl+C para detener.");
        });
    };
};