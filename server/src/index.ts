/**
 * Python LSP 服务器入口
 */

import { startServer } from './server';

console.log('='.repeat(50));
console.log('Monaco Editor - Python Language Server');
console.log('='.repeat(50));

startServer();
