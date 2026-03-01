import fs from 'fs';
import path from 'path';
import axios from 'axios';
import dotenv from 'dotenv';
import type { TyrContext } from '../Kernel';

type AIProvider = 'claude' | 'openai' | 'gemini';

interface AIConfig {
    provider: AIProvider;
    apiKey: string;
}

const PROVIDERS: { env: string; provider: AIProvider }[] = [
    { env: 'CLAUDE_API_KEY', provider: 'claude' },
    { env: 'OPENAI_API_KEY', provider: 'openai' },
    { env: 'GEMINI_API_KEY', provider: 'gemini' },
];

function detectProvider(): AIConfig | null {
    for (const { env, provider } of PROVIDERS) {
        const key = process.env[env];
        if (key) return { provider, apiKey: key };
    }
    return null;
}

async function callAI(config: AIConfig, sys: string, user: string): Promise<string> {
    switch (config.provider) {
        case 'claude': {
            const res = await axios.post('https://api.anthropic.com/v1/messages', {
                model: 'claude-sonnet-4-20250514',
                max_tokens: 4096,
                system: sys,
                messages: [{ role: 'user', content: user }],
            }, {
                headers: {
                    'x-api-key': config.apiKey,
                    'anthropic-version': '2023-06-01',
                    'content-type': 'application/json',
                },
            });
            return res.data.content[0].text;
        }
        case 'openai': {
            const res = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: sys },
                    { role: 'user', content: user },
                ],
                max_tokens: 4096,
            }, {
                headers: {
                    'Authorization': `Bearer ${config.apiKey}`,
                    'content-type': 'application/json',
                },
            });
            return res.data.choices[0].message.content;
        }
        case 'gemini': {
            const res = await axios.post(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${config.apiKey}`,
                {
                    system_instruction: { parts: [{ text: sys }] },
                    contents: [{ parts: [{ text: user }] }],
                },
                { headers: { 'content-type': 'application/json' } }
            );
            return res.data.candidates[0].content.parts[0].text;
        }
    }
}

function extractCodeBlock(response: string): string {
    const match = response.match(/```(?:typescript|ts)?\s*\n([\s\S]*?)```/);
    return match ? match[1].trim() : response.trim();
}

function buildSystemPrompt(frameworkRoot: string): string {
    const libPath = path.resolve(frameworkRoot, 'src/lib');
    let mods = '';

    if (fs.existsSync(libPath)) {
        for (const file of fs.readdirSync(libPath).filter(f => f.endsWith('.ts'))) {
            const content = fs.readFileSync(path.join(libPath, file), 'utf8');
            const methods: string[] = [];
            const re = /\/\*\*([\s\S]*?)\*\/\s*(public\s+(?:async\s+)?(\w+))?/g;
            let m;
            while ((m = re.exec(content)) !== null) {
                if (m[3]) {
                    const desc = m[1].replace(/\*/g, '').replace(/@\w+\s*/g, '').trim().split('\n')[0].trim();
                    methods.push(`${m[3]}:${desc}`);
                }
            }
            if (methods.length) mods += `\n${file.replace('.ts', '')}:${methods.join(';')}\n`;
        }
    }

    return `Genera comando Tyr (TS CLI).

FORMATO:
import{TyrContext}from'../core/Kernel';
export default({run,task,fail,logger,...mgrs}:TyrContext)=>{
return async(args:string[])=>{/*impl*/};};
export const Test={args:['ej1','ej2']};

KERNEL:run(cmd,args),task(desc,fn),fail(msg,hint?),logger:{info,success,warn,error}
MANAGERS(destructurar):shell(exec,cd,input,showLoader),fs(read,write,exists,delete),git(clone),docker,pkg,db,web,sys${mods}

REGLAS:export default;async(args:string[]);task() p/errores;fail() p/validar;Test con args realistas.
Responde SOLO código TS sin explicaciones ni backticks.`;
}

export default function ai({ logger, fs: tyrFs, frameworkRoot, run, fail }: TyrContext) {
    return async (args: string[]) => {
        const commandName = args[0];
        const prompt = args.slice(1).join(' ');

        if (!commandName || !prompt) {
            return fail(
                "Uso incorrecto de ai.",
                "Sintaxis: tyr ai [nombre-comando] [prompt]"
            );
        }

        dotenv.config({ path: path.resolve(frameworkRoot, '.env'), override: true });
        const aiConfig = detectProvider();
        if (!aiConfig) {
            return fail(
                "No se encontró API key de IA.",
                "Configura CLAUDE_API_KEY, OPENAI_API_KEY o GEMINI_API_KEY en .env"
            );
        }

        logger.success(`API: ${aiConfig.provider}`);

        logger.info(`Scaffold '${commandName}'...`);
        await run('gen', [commandName, commandName]);

        const systemPrompt = buildSystemPrompt(frameworkRoot);

        logger.info(`Enviando a ${aiConfig.provider}...`);

        let code: string;
        try {
            const response = await callAI(aiConfig, systemPrompt, prompt);
            code = extractCodeBlock(response);
            logger.success(`OK (${code.length} chars)`);
        } catch (e: any) {
            const msg = e.response?.data?.error?.message || e.message;
            return fail(
                `Error ${aiConfig.provider}: ${msg}`,
                `'${commandName}' creado con template base. Revisa tu API key.`
            );
        }

        const filePath = path.resolve(frameworkRoot, 'src/commands', `${commandName}.tyr.ts`);
        await tyrFs.write(filePath, code);
        logger.success(`'${commandName}' -> src/commands/${commandName}.tyr.ts`);
    };
}
