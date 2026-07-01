import axios from 'axios';

import { Logger } from '../core/Logger.js';
import { TyrError } from '../core/TyrError.js';

import {getEnvString, getEnvInt, getEnvDouble} from '../core/util/getenv.js';

export type AIVendor = 'anthropic' | 'openai' | 'gemini';
export type AIRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
    role: AIRole;
    content: string;
}

export interface AICompletionOptions {
    vendor?: AIVendor;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    maxRetries?: number;
}

export interface AICompletionResult {
    content: string;
    vendor: AIVendor;
    model: string;
    promptTokens?: number;
    completionTokens?: number;
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
        const system = messages.filter(m => m.role === 'system').map(m => m.content).join('\n\n');
        const turns = messages.filter(m => m.role !== 'system');
        return { system, turns };
    }

    private buildRequest(config: VendorConfig, messages: AIMessage[], stream: boolean): VendorRequest {
        const { system, turns } = this.splitSystem(messages);

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
                        messages: turns.map(m => ({ role: m.role, content: m.content })),
                        temperature: config.temperature,
                        max_tokens: config.maxTokens,
                        stream,
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
                            ...turns.map(m => ({ role: m.role, content: m.content })),
                        ],
                        temperature: config.temperature,
                        max_tokens: config.maxTokens,
                        stream,
                        ...(stream ? { stream_options: { include_usage: true } } : {}),
                    },
                };

            case 'gemini': {
                const action = stream ? 'streamGenerateContent?alt=sse&' : 'generateContent?';
                return {
                    url: `https://generativelanguage.googleapis.com/v1beta/models/${config.model}:${action}key=${config.apiKey}`,
                    headers: { 'content-type': 'application/json' },
                    body: {
                        ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
                        contents: turns.map(m => ({
                            role: m.role === 'assistant' ? 'model' : 'user',
                            parts: [{ text: m.content }],
                        })),
                        generationConfig: {
                            temperature: config.temperature,
                            maxOutputTokens: config.maxTokens,
                        },
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
            case 'anthropic':
                return {
                    content: (data.content ?? []).map((b: any) => b.text ?? '').join(''),
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usage?.input_tokens,
                    completionTokens: data.usage?.output_tokens,
                };
            case 'openai':
                return {
                    content: data.choices?.[0]?.message?.content ?? '',
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usage?.prompt_tokens,
                    completionTokens: data.usage?.completion_tokens,
                };
            case 'gemini':
                return {
                    content: (data.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join(''),
                    vendor: config.vendor,
                    model: config.model,
                    promptTokens: data.usageMetadata?.promptTokenCount,
                    completionTokens: data.usageMetadata?.candidatesTokenCount,
                };
        }
    }

    /**
     * @method complete
     * @description Sends a chat-completion request and returns the full response once ready.
     * Retries automatically on rate limiting (429) or server errors (5xx).
     * @param {AIMessage[]} messages - Conversation messages ('system', 'user', 'assistant').
     * @param {AICompletionOptions} options - Optional overrides (vendor, model, temperature, maxTokens).
     * @returns {Promise<AICompletionResult>} The generated content plus vendor/model/usage metadata.
     * @example
     * const result = await ai.complete([{ role: 'user', content: 'Explain this bug...' }]);
     * console.log(result.content);
     */
    public async complete(messages: AIMessage[], options?: AICompletionOptions): Promise<AICompletionResult> {
        const config = this.resolveConfig(options);
        const { url, headers, body } = this.buildRequest(config, messages, false);

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

        return { content, vendor: config.vendor, model: config.model, promptTokens, completionTokens };
    }
}

export const AIVendorManagerTests = {};
