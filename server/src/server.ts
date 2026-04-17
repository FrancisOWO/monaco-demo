/**
 * WebSocket 服务器
 * 处理 Monaco Editor 与 Pyright 语言服务器之间的通信
 */

import express from 'express';
import expressWs from 'express-ws';
import { WebSocket } from 'ws';
import { launchPyright } from './pyright-launcher';
import { config } from './config';
import aiCompletionRouter from './ai-completion';

const app: express.Express = express();
expressWs(app);

// CORS 支持
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
});

// JSON body 解析
app.use(express.json());

// 健康检查
app.get('/health', (req, res) => {
  res.json({ status: 'ok', message: 'Python LSP Server is running' });
});

// AI 补全端点
app.use('/ai', aiCompletionRouter);

// WebSocket 端点 - Pyright 语言服务器
app.ws(config.pyrightPath, (ws: WebSocket, req: any) => {
  console.log('[WebSocket] Client connected');

  // 启动 Pyright 进程
  const pyright = launchPyright();
  let closed = false;

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
    if (closed) return;
    const message = data.toString();
    console.log('[WebSocket -> Pyright]', message.substring(0, 200));

    try {
      // 转发给 Pyright
      pyright.stdin!.write(message);
    } catch (e) {
      console.error('[WebSocket] Error writing to Pyright stdin:', e);
    }
  });

  // 处理来自 Pyright 的消息，转发给 Monaco
  pyright.stdout.on('data', (data: Buffer) => {
    if (closed) return;
    const chunk = data.toString();
    buffer += chunk;
    console.log('[Pyright stdout] Received chunk, buffer length:', buffer.length);

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
          console.log('[Pyright stdout] Parsed header, contentLength:', contentLength, 'remaining buffer:', buffer.length);
        } else {
          // 没有找到 Content-Length，跳过这个头
          console.log('[Pyright stdout] No Content-Length found, skipping');
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
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(response);
        }
      } else {
        console.log('[Pyright stdout] Buffer has', buffer.length, 'bytes, need', contentLength, '- waiting for more');
        break;
      }
    }
  });

  // 处理 WebSocket 关闭
  ws.on('close', () => {
    console.log('[WebSocket] Client disconnected');
    closed = true;
    pyright.stdout?.removeAllListeners();
    pyright.stdin?.removeAllListeners();
    pyright.stderr?.removeAllListeners();
    pyright.kill();
  });

  // 处理 WebSocket 错误
  ws.on('error', (error) => {
    console.error('[WebSocket] Error:', error);
    closed = true;
    pyright.kill();
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
  process.exit(0);
});

export { app };