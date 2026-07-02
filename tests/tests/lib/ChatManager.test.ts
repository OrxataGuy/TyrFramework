import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import axios from 'axios';

import { ChatManager, ChatSession } from '../../../src/lib/ChatManager.js';
import { FileSystemManager } from '../../../src/lib/FileSystemManager.js';
import { Logger } from '../../../src/core/Logger.js';

const mockLogger: Logger = {
    line: () => {},
    log: () => {},
    info: () => {},
    success: () => {},
    error: () => {},
    warn: () => {},
};

const api = axios.create({ validateStatus: () => true });

describe('ChatManager', () => {
    let workDir: string;
    let chat: ChatManager;
    let session: ChatSession;

    beforeEach(async () => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tyr-chat-test-'));
        fs.writeFileSync(path.join(workDir, 'hello.txt'), 'Hello Tyr!');
        fs.mkdirSync(path.join(workDir, 'sub'));
        fs.writeFileSync(path.join(workDir, 'sub', 'nested.txt'), 'Nested file');

        chat = new ChatManager(new FileSystemManager(mockLogger), mockLogger);
        session = await chat.open(workDir, { port: 0, splitRatio: 0.4 });
    });

    afterEach(async () => {
        await session.stop();
        fs.rmSync(workDir, { recursive: true, force: true });
    });

    it('serves the chat page at the session URL', async () => {
        const res = await api.get(session.url);
        expect(res.status).toBe(200);
        expect(res.headers['content-type']).toContain('text/html');
        expect(res.data).toContain('id="messages"');
        expect(res.data).toContain('id="tree"');
    });

    it('creates a temp directory for attachments and removes it on stop()', async () => {
        expect(fs.existsSync(session.tempDir)).toBe(true);
        await session.stop();
        expect(fs.existsSync(session.tempDir)).toBe(false);
        // re-open for the afterEach hook, which also calls stop()
        session = await chat.open(workDir, { port: 0 });
    });

    it('lists directory entries via /api/tree', async () => {
        const res = await api.get(`${session.url}/api/tree`, { params: { path: '' } });
        expect(res.status).toBe(200);
        const names = res.data.entries.map((e: any) => e.name);
        expect(names).toEqual(expect.arrayContaining(['hello.txt', 'sub']));
    });

    it('reads a file via /api/file', async () => {
        const res = await api.get(`${session.url}/api/file`, { params: { path: 'hello.txt' } });
        expect(res.status).toBe(200);
        expect(res.data.binary).toBe(false);
        expect(res.data.content).toBe('Hello Tyr!');
    });

    it('rejects path traversal attempts', async () => {
        const res = await api.get(`${session.url}/api/file`, { params: { path: '../outside.txt' } });
        expect(res.status).toBe(400);
        expect(res.data.error).toMatch(/escapes/i);
    });

    it('uploads an image attachment and serves it back', async () => {
        const dataBase64 = Buffer.from('fake-png-bytes').toString('base64');
        const uploadRes = await api.post(`${session.url}/api/upload`, {
            filename: 'shot.png',
            mimeType: 'image/png',
            dataBase64,
        });
        expect(uploadRes.status).toBe(200);
        const attachment = uploadRes.data.attachment;
        expect(attachment.filename).toBe('shot.png');
        expect(fs.existsSync(attachment.path)).toBe(true);

        const fetched = await api.get(`${session.url}/api/attachment`, {
            params: { id: attachment.id },
            responseType: 'arraybuffer',
        });
        expect(fetched.status).toBe(200);
        expect(Buffer.from(fetched.data).toString()).toBe('fake-png-bytes');
    });

    it('fails a message with no handler registered', async () => {
        const res = await api.post(`${session.url}/api/message`, { text: 'hi' });
        expect(res.status).toBe(400);
        expect(res.data.error).toMatch(/no message handler/i);
    });

    it('runs the onMessage handler and fires send/response hooks in order', async () => {
        const events: string[] = [];
        chat.onMessage(async ({ message }) => {
            events.push('handler');
            return `echo: ${message.text}`;
        });
        chat.on('message:send', () => events.push('send'));
        chat.on('message:response', () => events.push('response'));

        const res = await api.post(`${session.url}/api/message`, { text: 'ping' });

        expect(res.status).toBe(200);
        expect(res.data.message.role).toBe('assistant');
        expect(res.data.message.text).toBe('echo: ping');
        expect(events).toEqual(['send', 'handler', 'response']);
    });

    it('fires message:error and surfaces the failure when the handler throws', async () => {
        let captured: any = null;
        chat.onMessage(async () => {
            throw new Error('boom');
        });
        chat.on('message:error', (payload: any) => { captured = payload; });

        const res = await api.post(`${session.url}/api/message`, { text: 'trigger' });

        expect(res.status).toBe(400);
        expect(captured).not.toBeNull();
        expect(captured.error.message).toBe('boom');
    });
});
