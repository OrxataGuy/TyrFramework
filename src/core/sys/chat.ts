import path from 'path';
import { readFile } from 'fs/promises';
import { TyrContext } from '../Kernel';
import type { AIContentBlock, AIMessage } from '../../lib/AIVendorManager';
import type { ChatMessageContext } from '../../lib/ChatManager';

function parseFlag(args: string[], name: string): string | undefined {
    const index = args.indexOf(name);
    return index !== -1 ? args[index + 1] : undefined;
}

export default function chat({ logger, chat: chatManager, aiVendor, fail }: TyrContext) {
    return async (args: string[]) => {
        const positional = args.filter((a) => !a.startsWith('--'));
        const dir = path.resolve(positional[0] ?? process.cwd());

        const portArg = parseFlag(args, '--port');
        const splitArg = parseFlag(args, '--split');
        const port = portArg ? parseInt(portArg, 10) : undefined;
        const splitRatio = splitArg ? parseFloat(splitArg) : undefined;

        // Default responder: forwards the conversation (plus any attached images) to the
        // configured AI vendor. Replace with your own chatManager.onMessage(...) in a custom
        // command if you want different behaviour.
        chatManager.onMessage(async ({ message, history, dir: chatDir }: ChatMessageContext) => {
            const priorTurns: AIMessage[] = history.slice(0, -1).map((m) => ({
                role: m.role === 'user' ? 'user' : 'assistant',
                content: m.text,
            }));

            const contentBlocks: AIContentBlock[] = [];
            if (message.text) contentBlocks.push({ type: 'text', text: message.text });

            for (const attachment of message.attachments) {
                try {
                    const fileBuffer = await readFile(attachment.path);
                    contentBlocks.push({ type: 'image', mediaType: attachment.mimeType, data: fileBuffer.toString('base64') });
                } catch (e) {
                    logger.warn(`Could not read attachment '${attachment.filename}': ${(e as Error).message}`);
                }
            }

            const messages: AIMessage[] = [
                {
                    role: 'system',
                    content: `You are an assistant embedded in a chat UI browsing the directory: ${chatDir}. Answer helpfully and concisely, referencing its files when relevant.`,
                },
                ...priorTurns,
                { role: 'user', content: contentBlocks.length > 0 ? contentBlocks : message.text },
            ];

            const result = await aiVendor.complete(messages);
            return result.content;
        });

        // Example hooks — side effects around the conversation, independent from onMessage.
        chatManager.on('message:send', ({ message }: { message: { text: string } }) => {
            logger.info(`[chat] user: ${message.text}`);
        });
        chatManager.on('message:error', ({ error }: { error: Error }) => {
            logger.warn(`[chat] handler failed: ${error.message}`);
        });

        try {
            const session = await chatManager.open(dir, { port, splitRatio });
            logger.success(`Chat ready at: ${session.url}`);
            logger.info(`Browsing: ${session.dir}`);
            logger.info('Press Ctrl+C to stop.');
        } catch (e: any) {
            fail(`Could not start chat: ${e.message}`, 'Check that the directory exists and the port is free.');
        }
    };
}
