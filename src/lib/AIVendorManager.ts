import axios from 'axios';

import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

import {getEnvString, getEnvInt, getEnvDouble} from '../core/util/getenv.js';

export type AIVendor = 'anthropic' | 'openai' | 'gemini';
export type AIRole = 'system' | 'user' | 'assistant';

/**
 * Representación normalizada (independiente del vendor) del contenido de un mensaje.
 *
 *  - 'text': texto plano.
 *  - 'tool_use': el modelo pide ejecutar una herramienta. `id` es opaco para el llamador: hay
 *    que devolverlo tal cual en el `tool_result` correspondiente, sin asumir nada sobre su
 *    formato (en Gemini, por ejemplo, es un id sintético generado por este manager, ya que la
 *    API de Gemini no da ids reales para las function calls).
 *  - 'tool_result': resultado de haber ejecutado una herramienta, para devolvérselo al modelo.
 */
export type AIContentBlock =
    | { type: 'text'; text: string }
    | { type: 'tool_use'; id: string; name: string; input: any }
    | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface AIMessage {
    role: AIRole;
    /** Texto plano, o una lista de bloques cuando el mensaje incluye tool_use / tool_result. */
    content: string | AIContentBlock[];
}

/** Definición de herramienta en formato JSON-schema al estilo Anthropic; se traduce internamente
 *  al formato de cada vendor (function-calling de OpenAI, functionDeclarations de Gemini). */
export interface AITool {
    name: string;
    description: string;
    input_schema: any;
}

export interface AICompletionOptions {
    vendor?: AIVendor;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
    /** Herramientas disponibles para que el modelo las invoque. Solo soportado en complete(),
     *  no en stream() — ver el guard al inicio de stream(). */
    tools?: AITool[];
}

export interface AICompletionResult {
    /** Texto plano concatenado de todos los bloques de tipo 'text' (conveniencia; equivalente al
     *  comportamiento anterior de esta clase, antes de soportar tools). */
    content: string;
    /** Contenido completo y normalizado, incluyendo bloques tool_use si el modelo pidió alguno.
     *  Necesario para reconstruir el mensaje de assistant en el siguiente turno de un bucle
     *  agente. */
    blocks: AIContentBlock[];
    vendor: AIVendor;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
    /** Motivo de parada normalizado tal como lo reporta cada vendor (stop_reason / finish_reason
     *  / finishReason), sin normalizar entre vendors — úsalo solo informativamente. */
    stopReason?: string;
}

interface VendorConfig {
    vendor: AIVendor;
    apiKey: string;
    model: string;
    temperature: number;
    maxTokens: number;
    maxRetries: number;
}

interface VendorRequest {
    url: string;
    headers: Record<string, string>;
    body: any;
}

const DEFAULT_MODELS: Record<AIVendor, string> = {
    anthropic: 'claude-sonnet-5',
    openai: 'gpt-4o-mini',
    gemini: 'gemini-2.5-flash',
};

const API_KEY_ENV: Record<AIVendor, string> = {
    anthropic: 'ANTHROPIC_API_KEY',
    openai: 'OPENAI_API_KEY',
    gemini: 'GEMINI_API_KEY',
};

const DEFAULT_TEMPERATURE = 0.3;
const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 500;

/**
 * @class AIVendorManager
 * @description Unified client for AI chat-completion APIs (Anthropic, OpenAI, Gemini).
 * Resolves the API key and technical defaults (model, temperature, max tokens) from
 * environment variables / Tyr configuration, retries transient failures with exponential
 * backoff, and supports both blocking and streaming responses.
 *
 * Tool use (function calling) is supported in `complete()` for all three vendors, behind a
 * vendor-agnostic representation (`AITool` / `AIContentBlock`). Each vendor's wire format is
 * different — this class does the translation both ways (request and response) so callers never
 * need to know which vendor is active. `stream()` does not support tools yet (see the guard at
 * the top of that method).
 *
 * Environment variables:
 *   AI_VENDOR          – 'anthropic' | 'openai' | 'gemini' (default: 'anthropic')
 *   ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY – API key for the selected vendor
 *   AI_MODEL           – overrides the vendor's default model
 *   AI_TEMPERATURE     – overrides the default temperature (0.3)
 *   AI_MAX_TOKENS      – overrides the default max output tokens (4096)
 *   AI_MAX_RETRIES     – overrides the default retry count (3)
 */
export class AIVendorManager {
    private logger: Logger;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    private resolveConfig(options?: AICompletionOptions): VendorConfig {
        const vendor = (options?.vendor ?? (getEnvString('AI_VENDOR') as AIVendor | undefined) ?? 'anthropic')
            .toString()
            .toLowerCase() as AIVendor;

        if (!DEFAULT_MODELS[vendor]) {
            throw new TyrError(
                `Unsupported AI vendor: '${vendor}'`,
                null,
                `Set AI_VENDOR to one of: ${Object.keys(DEFAULT_MODELS).join(', ')}`
            );
        }

        const apiKey = getEnvString(API_KEY_ENV[vendor]);
        if (!apiKey) {
            throw new TyrError(
                `Missing API key for vendor '${vendor}'`,
                null,
                `Set ${API_KEY_ENV[vendor]} in ~/.tyr/.env`
            );
        }

        return {
            vendor,
            apiKey,
            model: options?.model ?? getEnvString('AI_MODEL') ?? DEFAULT_MODELS[vendor],
            temperature: options?.temperature ?? getEnvDouble('AI_TEMPERATURE', DEFAULT_TEMPERATURE),
            maxTokens: options?.maxTokens ?? getEnvInt('AI_MAX_TOKENS', DEFAULT_MAX_TOKENS),
            maxRetries: options?.maxRetries ?? getEnvInt('AI_MAX_RETRIES', DEFAULT_MAX_RETRIES),
        };
    }

    private splitSystem(messages: AIMessage[]): { system: string; turns: AIMessage[] } {
        const system = messages
            .filter(m => m.role === 'system')
            .map(m => (typeof m.content === 'string' ? m.content : m.content.map(b => (b.type === 'text' ? b.text : '')).join('')))
            .join('\n\n');
        const turns = messages.filter(m => m.role !== 'system');
        return { system, turns };
    }

    // --- Traducción de herramientas por vendor -------------------------------------------------

    private buildVendorTools(config: VendorConfig, tools?: AITool[]): any {
        if (!tools || tools.length === 0) return undefined;

        switch (config.vendor) {
            case 'anthropic':
                return tools.map(t => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
            case 'openai':
                return tools.map(t => ({
                    type: 'function',
                    function: { name: t.name, description: t.description, parameters: t.input_schema },
                }));
            case 'gemini':
                return [{ functionDeclarations: tools.map(t => ({ name: t.name, description: t.description, parameters: t.input_schema })) }];
        }
    }

    // --- Traducción de mensajes por vendor ------------------------------------------------------

    private toAnthropicContent(content: string | AIContentBlock[]): any {
        if (typeof content === 'string') return content;
        return content.map(block => {
            if (block.type === 'text') return { type: 'text', text: block.text };
            if (block.type === 'tool_use') return { type: 'tool_use', id: block.id, name: block.name, input: block.input };
            return { type: 'tool_result', tool_use_id: block.tool_use_id, content: block.content, ...(block.is_error ? { is_error: true } : {}) };
        });
    }

    private buildAnthropicMessages(turns: AIMessage[]): any[] {
        return turns.map(m => ({ role: m.role, content: this.toAnthropicContent(m.content) }));
    }

    /**
     * OpenAI no tiene un bloque "tool_result" dentro de un mensaje de usuario: cada resultado de
     * herramienta tiene que ir en su propio mensaje con role: 'tool'. Por eso, a diferencia de
     * Anthropic, un único AIMessage de entrada puede expandirse a varios mensajes de salida.
     */
    private buildOpenAIMessages(turns: AIMessage[]): any[] {
        const result: any[] = [];

        for (const m of turns) {
            if (typeof m.content === 'string') {
                result.push({ role: m.role, content: m.content });
                continue;
            }

            if (m.role === 'assistant') {
                const text = m.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');
                const toolUses = m.content.filter(b => b.type === 'tool_use') as Array<Extract<AIContentBlock, { type: 'tool_use' }>>;

                const msg: any = { role: 'assistant', content: text || null };
                if (toolUses.length > 0) {
                    msg.tool_calls = toolUses.map(t => ({
                        id: t.id,
                        type: 'function',
                        function: { name: t.name, arguments: JSON.stringify(t.input ?? {}) },
                    }));
                }
                result.push(msg);
                continue;
            }

            const toolResults = m.content.filter(b => b.type === 'tool_result') as Array<Extract<AIContentBlock, { type: 'tool_result' }>>;
            const text = m.content.filter(b => b.type === 'text').map(b => (b as any).text).join('');

            for (const tr of toolResults) {
                result.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content });
            }
            if (text) {
                result.push({ role: m.role, content: text });
            }
        }

        return result;
    }

    /** Busca hacia atrás en TODO el historial (no solo en el turno actual) el nombre de la
     *  función asociada a un tool_use_id, porque Gemini necesita el `name` en el functionResponse
     *  y nosotros solo tenemos el id opaco que generamos al parsear la respuesta anterior. */
    private findToolUseName(allMessages: AIMessage[], toolUseId: string): string | undefined {
        for (const m of allMessages) {
            if (!Array.isArray(m.content)) continue;
            const match = m.content.find(b => b.type === 'tool_use' && b.id === toolUseId) as
                | Extract<AIContentBlock, { type: 'tool_use' }>
                | undefined;
            if (match) return match.name;
        }
        return undefined;
    }

    /**
     * NOTA: la API pública de Gemini espera los resultados de función en un content con
     * role: 'function' (parts: [{ functionResponse: { name, response } }]). Esto puede variar
     * entre versiones de la API — si Google cambia el contrato, este es el único sitio a tocar.
     */
    private buildGeminiContents(turns: AIMessage[], allMessages: AIMessage[]): any[] {
        const result: any[] = [];

        for (const m of turns) {
            if (typeof m.content === 'string') {
                result.push({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] });
                continue;
            }

            if (m.role === 'assistant') {
                const parts: any[] = [];
                for (const b of m.content) {
                    if (b.type === 'text' && b.text) parts.push({ text: b.text });
                    if (b.type === 'tool_use') parts.push({ functionCall: { name: b.name, args: b.input ?? {} } });
                }
                result.push({ role: 'model', parts });
                continue;
            }

            const toolResults = m.content.filter(b => b.type === 'tool_result') as Array<Extract<AIContentBlock, { type: 'tool_result' }>>;
            const textBlocks = m.content.filter(b => b.type === 'text') as Array<Extract<AIContentBlock, { type: 'text' }>>;

            if (toolResults.length > 0) {
                result.push({
                    role: 'function',
                    parts: toolResults.map(tr => ({
                        functionResponse: {
                            name: this.findToolUseName(allMessages, tr.tool_use_id) ?? 'unknown_function',
                            response: { content: tr.content },
                        },
                    })),
                });
            }
            if (textBlocks.length > 0) {
                result.push({ role: 'user', parts: textBlocks.map(b => ({ text: b.text })) });
            }
        }

        return result;
    }

    private buildRequest(config: VendorConfig, messages: AIMessage[], stream: boolean, tools?: AITool[]): VendorRequest {
        const { system, turns } = this.splitSystem(messages);
        const vendorTools = this.buildVendorTools(config, tools);

        switch (config.vendor) {
            case 'anthropic':
                return {
                    url: 'https://api.anthropic.com/v1/messages',
                    headers: {
                        'x-api-key': config.apiKey,
                        'anthropic-version': '2023-06-01',
                        'content-type': 'application/json',
                    },
                    body: {
                        model: config.model,
                        system,
                        messages: this.buildAnthropicMessages(turns),
                        temperature: config.temperature,
                        max_tokens: config.maxTokens,
                        stream,
                        ...(vendorTools ? { tools: vendorTools } : {}),
                    },
                };

            case 'openai':
                return {
                    url: 'https://api.openai.com/v1/chat/completions',
                    headers: {
                        Authorization: `Bearer ${config.apiKey}`,
                        'content-type': 'application/json',
                    },
                    body: {
                        model: config.model,
                        messages: [
                            ...(system ? [{ role: 'system', content: system }] : []),
                            ...this.buildOpenAIMessages(turns),
                        ],
                        temperature: config.temperature,
                        max_tokens: config.maxTokens,
                        stream,
                        ...(stream ? { stream_options: { include_usage: true } } : {}),
                        ...(vendorTools ? { tools: vendorTools } : {}),
                    },
                };

            case 'gemini': {
                const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
                return {
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:${action}key=${config.apiKey}`,
                    headers: { 'content-type': 'application/json' },
                    body: {
                        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                        contents: this.buildGeminiContents(turns, messages),
                        generationConfig: {
                            temperature: config.temperature,
                            maxOutputTokens: config.maxTokens,
                        },
                        ...(vendorTools ? { tools: vendorTools } : {}),
                    },
                };
            }

            default:
                throw new TyrError(`Unsupported AI vendor: '${config.vendor}'`);
        }
    }

    private sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    private isRetryable(status: number | undefined): boolean {
        return status === 429 || (status !== undefined && status >= 500);
    }

    private async withRetries<T>(fn: () => Promise<T>, maxRetries: number): Promise<T> {
        let lastError: unknown;
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                return await fn();
            } catch (e: any) {
                lastError = e;
                const status = e?.response?.status;
                if (attempt === maxRetries || !this.isRetryable(status)) throw e;
                const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
                this.logger.warn(`AI request failed (status ${status ?? 'unknown'}). Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }
        throw lastError;
    }

    private parseCompletion(config: VendorConfig, data: any): AICompletionResult {
        switch (config.vendor) {
            case 'anthropic': {
                const blocks: AIContentBlock[] = (data.content ?? []).map((b: any) => {
                    if (b.type === 'tool_use') return { type: 'tool_use', id: b.id, name: b.name, input: b.input };
                    return { type: 'text', text: b.text ?? '' };
                });
                return {
                    content: blocks.filter(b => b.type === 'text').map((b: any) => b.text).join(''),
                    blocks,
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usage?.input_tokens,
                    completionTokens: data.usage?.output_tokens,
                    stopReason: data.stop_reason,
                };
            }

            case 'openai': {
                const message = data.choices?.[0]?.message ?? {};
                const blocks: AIContentBlock[] = [];

                if (message.content) blocks.push({ type: 'text', text: message.content });

                for (const call of message.tool_calls ?? []) {
                    let input: any = {};
                    try {
                        input = JSON.parse(call.function?.arguments || '{}');
                    } catch {
                        input = {};
                    }
                    blocks.push({ type: 'tool_use', id: call.id, name: call.function?.name, input });
                }

                return {
                    content: message.content ?? '',
                    blocks,
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usage?.prompt_tokens,
                    completionTokens: data.usage?.completion_tokens,
                    stopReason: data.choices?.[0]?.finish_reason,
                };
            }

            case 'gemini': {
                const parts = data.candidates?.[0]?.content?.parts ?? [];
                const blocks: AIContentBlock[] = [];
                let callIndex = 0;

                for (const p of parts) {
                    if (p.text) blocks.push({ type: 'text', text: p.text });
                    if (p.functionCall) {
                        // Gemini no da ids: generamos uno sintético que solo usamos internamente
                        // para poder emparejar el tool_result correspondiente más adelante.
                        blocks.push({
                            type: 'tool_use',
                            id: `gemini-call-${callIndex++}-${p.functionCall.name}`,
                            name: p.functionCall.name,
                            input: p.functionCall.args ?? {},
                        });
                    }
                }

                return {
                    content: blocks.filter(b => b.type === 'text').map((b: any) => b.text).join(''),
                    blocks,
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usageMetadata?.promptTokenCount,
                    completionTokens: data.usageMetadata?.candidatesTokenCount,
                    stopReason: data.candidates?.[0]?.finishReason,
                };
            }
        }
    }

    /**
     * @method complete
     * @description Sends a chat-completion request and returns the full response once ready.
     * Retries automatically on rate limiting (429) or server errors (5xx). When `options.tools`
     * is provided, the model may respond with one or more `tool_use` blocks in `result.blocks`
     * instead of (or in addition to) text — the caller is responsible for executing those tools
     * and feeding the results back as a follow-up message with 'tool_result' blocks.
     * @param {AIMessage[]} messages - Conversation messages ('system', 'user', 'assistant').
     * @param {AICompletionOptions} options - Optional overrides (vendor, model, temperature, maxTokens, tools).
     * @returns {Promise<AICompletionResult>} The generated content plus vendor/model/usage metadata.
     * @example
     * const result = await ai.complete([{ role: 'user', content: 'Explain this bug...' }]);
     * console.log(result.content);
     * @example
     * // Tool use loop
     * let result = await ai.complete(messages, { tools });
     * while (result.blocks.some(b => b.type === 'tool_use')) {
     *   messages.push({ role: 'assistant', content: result.blocks });
     *   const toolResults = result.blocks
     *     .filter(b => b.type === 'tool_use')
     *     .map(b => ({ type: 'tool_result' as const, tool_use_id: b.id, content: runTool(b) }));
     *   messages.push({ role: 'user', content: toolResults });
     *   result = await ai.complete(messages, { tools });
     * }
     */
    public async complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
        const config = this.resolveConfig(options);
        const { url, headers, body } = this.buildRequest(config, messages, false, options?.tools);

        try {
            const response = await this.withRetries(
                () => axios.post(url, body, { headers }),
                config.maxRetries
            );
            return this.parseCompletion(config, response.data);
        } catch (e: any) {
            if (e instanceof TyrError) throw e;
            const status = e?.response?.status;
            throw new TyrError(
                `AI request to '${config.vendor}' failed (${status ?? 'network error'})`,
                e,
                'Check your API key, network connection, and the vendor status page.'
            );
        }
    }

    /**
     * @method stream
     * @description Sends a chat-completion request and streams the response as it is generated.
     * Retries are only applied before any data has been received; once streaming has started,
     * failures are surfaced immediately to avoid emitting duplicated content.
     *
     * Tool use is NOT supported here: streaming tool calls arrive as incremental JSON fragments
     * (Anthropic's `input_json_delta`, OpenAI's indexed `tool_calls` deltas, Gemini's partial
     * function-call parts) and this method does not accumulate them. Passing `options.tools`
     * throws immediately rather than silently dropping tool calls the model might make mid-stream.
     * @param {AIMessage[]} messages - Conversation messages ('system', 'user', 'assistant').
     * @param {(chunk: string) => void} onChunk - Called with each incremental text fragment.
     * @param {AICompletionOptions} options - Optional overrides (vendor, model, temperature, maxTokens).
     * @returns {Promise<AICompletionResult>} The full accumulated content plus vendor/model/usage metadata.
     * @example
     * const result = await ai.stream(messages, (chunk) => process.stdout.write(chunk));
     */
    public async stream(
        messages: AIMessage[],
        onChunk: (chunk: string) => void,
        options?: AICompletionOptions
    ): Promise<AICompletionResult> {
        if (options?.tools && options.tools.length > 0) {
            throw new TyrError(
                'Tool use is not supported in streaming mode yet',
                null,
                'Use complete() instead of stream() when passing tools.'
            );
        }

        const config = this.resolveConfig(options);
        const { url, headers, body } = this.buildRequest(config, messages, true);

        let content = '';
        let promptTokens: number | undefined;
        let completionTokens: number | undefined;
        let hasStreamedAny = false;

        const attemptStream = async (): Promise<void> => {
            const response = await axios.post(url, body, { headers, responseType: 'stream' });
            let buffer = '';

            for await (const chunk of response.data) {
                hasStreamedAny = true;
                buffer += chunk.toString('utf-8');

                let boundary: number;
                while ((boundary = buffer.indexOf('\n\n')) !== -1) {
                    const rawEvent = buffer.slice(0, boundary);
                    buffer = buffer.slice(boundary + 2);

                    for (const line of rawEvent.split('\n')) {
                        const trimmed = line.trim();
                        if (!trimmed.startsWith('data:')) continue;

                        const payload = trimmed.slice(5).trim();
                        if (payload === '[DONE]') continue;

                        let event: any;
                        try {
                            event = JSON.parse(payload);
                        } catch {
                            continue;
                        }

                        if (config.vendor === 'anthropic') {
                            if (event.type === 'content_block_delta' && event.delta?.text) {
                                content += event.delta.text;
                                onChunk(event.delta.text);
                            } else if (event.type === 'message_start') {
                                promptTokens = event.message?.usage?.input_tokens;
                            } else if (event.type === 'message_delta') {
                                completionTokens = event.usage?.output_tokens;
                            }
                        } else if (config.vendor === 'openai') {
                            const delta = event.choices?.[0]?.delta?.content;
                            if (delta) {
                                content += delta;
                                onChunk(delta);
                            }
                            if (event.usage) {
                                promptTokens = event.usage.prompt_tokens;
                                completionTokens = event.usage.completion_tokens;
                            }
                        } else if (config.vendor === 'gemini') {
                            const text = event.candidates?.[0]?.content?.parts?.[0]?.text;
                            if (text) {
                                content += text;
                                onChunk(text);
                            }
                            if (event.usageMetadata) {
                                promptTokens = event.usageMetadata.promptTokenCount;
                                completionTokens = event.usageMetadata.candidatesTokenCount;
                            }
                        }
                    }
                }
            }
        };

        let attempt = 0;
        for (;;) {
            try {
                await attemptStream();
                break;
            } catch (e: any) {
                const status = e?.response?.status;
                if (hasStreamedAny || attempt >= config.maxRetries || !this.isRetryable(status)) {
                    throw new TyrError(
                        `AI streaming request to '${config.vendor}' failed (${status ?? 'network error'})`,
                        e,
                        'Check your API key, network connection, and the vendor status page.'
                    );
                }
                attempt++;
                const delay = RETRY_BASE_DELAY_MS * 2 ** attempt;
                this.logger.warn(`AI stream request failed (status ${status ?? 'unknown'}). Retrying in ${delay}ms...`);
                await this.sleep(delay);
            }
        }

        return { content, blocks: [{ type: 'text', text: content }], vendor: config.vendor, model: config.model, promptTokens, completionTokens };
    }
}

export const AIVendorManagerTests = {};