/**
 * WebSocket 服务器
 * 处理 Monaco Editor 与 Pyright 语言服务器之间的通信
 */

import express from 'express';
import expressWs from 'express-ws';
import { WebSocket } from 'ws';
import { launchPyright, stopPyright } from './pyright-launcher';
import { config } from './config';

const app = express();
const wsInstance = expressWs(app);

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Python LSP Server is running' });
});

// WebSocket 端点 - Pyright 语言服务器
app.ws(config.pyrightPath, (ws: WebSocket, req) => {
  console.log('[WebSocket] Client connected');

  // 启动 Pyright 进程
  const pyright = launchPyright();

  if (!pyright.stdin || !pyright.stdout) {
    console.error('[WebSocket] Pyright stdin/stdout not available');
    ws.close();
    return;
  }

  // 用于存储不完整的消息
  let buffer = '';
  let contentLength = -1;

  // 处理来自 Monaco 的消息，转发给 Pyright
  ws.on('message', (data: Buffer) => {
    const message = data.toString();
    console.log('[WebSocket -> Pyright]', message.substring(0, 200));

    // 转发给 Pyright
    pyright.stdin!.write(message);
    if (!message.endsWith('\n')) {
      pyright.stdin!.write('\n');
    }
  });

  // 处理来自 Pyright 的消息，转发给 Monaco
  pyright.stdout.on('data', (data: Buffer) => {
    const chunk = data.toString();
    buffer += chunk;

    // 解析 LSP 消息格式 (Content-Length 头)
    while (true) {
      if (contentLength === -1) {
        // 查找 Content-Length 头
        const headerEnd = buffer.indexOf('\r\n\r\n');
        if (headerEnd === -1) break;

        const header = buffer.substring(0, headerEnd);
        const match = header.match(/Content-Length:\s*(\d+)/i);
        if (match) {
          contentLength = parseInt(match[1], 10);
          buffer = buffer.substring(headerEnd + 4);
        } else {
          // 没有找到 Content-Length，跳过这个头
          buffer = buffer.substring(headerEnd + 4);
          continue;
        }
      }

      if (buffer.length >= contentLength) {
        const content = buffer.substring(0, contentLength);
        buffer = buffer.substring(contentLength);
        contentLength = -1;

        // 构造完整的 LSP 响应
        const response = `Content-Length: ${content.length}\r\n\r\n${content}`;
        console.log('[Pyright -> WebSocket]', content.substring(0, 200));
        ws.send(response);
      } else {
        break;
      }
    }
  });

  // 处理 WebSocket 关闭
  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
  });

  // 处理 WebSocket 错误
  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
  });
});

// 启动服务器
export function startServer(): void {
  app.listen(config.port, () => {
    console.log(`[Server] Python LSP Server running at http://localhost:${config.port}`);
    console.log(`[Server] WebSocket endpoint: ws://localhost:${config.port}${config.pyrightPath}`);
  });
}

// 优雅关闭
process.on('SIGINT', () => {
  console.log('\n[Server] Shutting down...');
  stopPyright();
  process.exit(0);
});

export { app };
