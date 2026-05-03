/**
 * LSP 代理模块
 * 提取 Content-Length 字节解析为共享函数，供所有语言服务器 WebSocket 端点复用
 */

import { WebSocket } from 'ws';
import { ChildProcess } from 'child_process';

/**
 * 创建 LSP 代理，双向转发 WebSocket 和语言服务器进程之间的消息
 * 处理 LSP Content-Length 帧格式解析
 */
export function createLspProxy(ws: WebSocket, langProcess: ChildProcess, displayName: string) {
    let closed = false;
    let byteBuffer = Buffer.alloc(0);
    let contentLength = -1;

    // 处理来自 Monaco 的消息，转发给语言服务器
    ws.on('message', (data: Buffer) => {
        if (closed) return;
        const message = data.toString();
        console.log(`[WebSocket -> ${displayName}]`, message.substring(0, 200));

        try {
            langProcess.stdin!.write(message);
        } catch (e) {
            console.error(`[WebSocket] Error writing to ${displayName} stdin:`, e);
        }
    });

    // 处理来自语言服务器的消息，转发给 Monaco
    if (langProcess.stdout) {
        langProcess.stdout.on('data', (data: Buffer) => {
            if (closed) return;
            byteBuffer = Buffer.concat([byteBuffer, data]);
            console.log(`[${displayName} stdout] Received chunk, buffer length:`, byteBuffer.length);

            // 解析 LSP 消息格式 (Content-Length 头)
            while (true) {
                if (contentLength === -1) {
                    const headerEndIndex = byteBuffer.indexOf('\r\n\r\n');
                    if (headerEndIndex === -1) break;

                    const header = byteBuffer.subarray(0, headerEndIndex).toString('utf-8');
                    const match = header.match(/Content-Length:\s*(\d+)/i);
                    if (match) {
                        contentLength = parseInt(match[1], 10);
                        byteBuffer = byteBuffer.subarray(headerEndIndex + 4);
                        console.log(`[${displayName} stdout] Parsed header, contentLength:`, contentLength, 'remaining buffer:', byteBuffer.length);
                    } else {
                        console.log(`[${displayName} stdout] No Content-Length found, skipping`);
                        byteBuffer = byteBuffer.subarray(headerEndIndex + 4);
                        continue;
                    }
                }

                if (byteBuffer.length >= contentLength) {
                    const contentBytes = byteBuffer.subarray(0, contentLength);
                    byteBuffer = byteBuffer.subarray(contentLength);
                    contentLength = -1;

                    const content = contentBytes.toString('utf-8');
                    const responseByteLength = Buffer.byteLength(content, 'utf-8');
                    const response = `Content-Length: ${responseByteLength}\r\n\r\n${content}`;
                    console.log(`[${displayName} -> WebSocket]`, content.substring(0, 200));
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(response);
                    }
                } else {
                    console.log(`[${displayName} stdout] Buffer has`, byteBuffer.length, 'bytes, need', contentLength, '- waiting for more');
                    break;
                }
            }
        });
    }

    // 处理 WebSocket 关闭
    ws.on('close', () => {
        console.log(`[WebSocket] Client disconnected from ${displayName}`);
        closed = true;
        langProcess.stdout?.removeAllListeners();
        langProcess.stdin?.removeAllListeners();
        langProcess.stderr?.removeAllListeners();
        langProcess.kill();
    });

    // 处理 WebSocket 错误
    ws.on('error', (error) => {
        console.error(`[WebSocket] Error on ${displayName}:`, error);
        closed = true;
        langProcess.kill();
    });

    return {
        close: () => {
            closed = true;
            langProcess.kill();
        },
    };
}