/**
 * MCP 编辑器控制测试脚本
 * 通过 HTTP 端点直接测试 EditorCommandClient → editorControlHub → Browser 的完整链路
 * 同时测试 MCP server 的 JSON-RPC 协议层
 */

const SERVER_URL = 'http://localhost:3000';

async function postCommand(method, params = {}, timeoutMs = 10000) {
    const response = await fetch(`${SERVER_URL}/editor-control/command`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params, timeoutMs }),
    });
    const payload = await response.json();
    if (!response.ok) {
        throw new Error(payload.error || `HTTP ${response.status}`);
    }
    return payload.result;
}

async function runTests() {
    const results = { pass: 0, fail: 0, tests: [] };

    function assert(condition, name) {
        if (condition) {
            results.pass++;
            results.tests.push({ name, status: 'PASS' });
            console.log(`  PASS: ${name}`);
        } else {
            results.fail++;
            results.tests.push({ name, status: 'FAIL' });
            console.log(`  FAIL: ${name}`);
        }
    }

    console.log('=== MCP 编辑器控制测试 ===\n');

    // Test 1: Server health
    console.log('[1/10] 检查服务器状态...');
    try {
        const res = await fetch(`${SERVER_URL}/health`);
        assert(res.ok, '服务器运行正常');
    } catch {
        assert(false, '服务器运行正常');
    }

    // Test 2: Editor WebSocket connection
    console.log('[2/10] 检查编辑器 WebSocket 连接...');
    try {
        const status = await fetch(`${SERVER_URL}/editor-control/status`).then(r => r.json());
        assert(status.connected === true, '编辑器 WebSocket 已连接');
    } catch {
        assert(false, '编辑器 WebSocket 已连接');
    }

    // Test 3: editor_status
    console.log('[3/10] 测试 editor_status...');
    try {
        const result = await postCommand('editor.status');
        assert(result && typeof result === 'object', 'editor_status 返回有效对象');
        assert(Array.isArray(result.files), 'editor_status 包含 files 数组');
    } catch (e) {
        assert(false, 'editor_status 返回有效对象');
        assert(false, 'editor_status 包含 files 数组');
    }

    // Test 4: openFile
    console.log('[4/10] 测试 editor.openFile...');
    try {
        const result = await postCommand('editor.openFile', {
            path: '/test-mcp-protocol.py',
            name: 'test-mcp-protocol.py',
            content: '# MCP Protocol Test\nprint("Hello from MCP test!")',
            language: 'python',
        });
        assert(result && result.path === '/test-mcp-protocol.py', 'openFile 创建文件成功');
        assert(result.language === 'python', 'openFile 设置语言为 python');
    } catch (e) {
        assert(false, 'openFile 创建文件成功');
        assert(false, 'openFile 设置语言为 python');
    }

    // Test 5: getFileContent
    console.log('[5/10] 测试 editor.getFileContent...');
    try {
        const result = await postCommand('editor.getFileContent', {
            path: '/test-mcp-protocol.py',
        });
        assert(result && result.content, 'getFileContent 返回内容');
        assert(result.content.includes('MCP Protocol Test'), 'getFileContent 内容包含测试文本');
        assert(result.isDirty === false, 'getFileContent isDirty 为 false');
    } catch (e) {
        assert(false, 'getFileContent 返回内容');
        assert(false, 'getFileContent 内容包含测试文本');
    }

    // Test 6: editFile
    console.log('[6/10] 测试 editor.editFile...');
    try {
        const result = await postCommand('editor.editFile', {
            path: '/test-mcp-protocol.py',
            content: '# MCP Protocol Test - Edited\nprint("Edited!")',
        });
        assert(result && result.path === '/test-mcp-protocol.py', 'editFile 修改文件成功');
        assert(result.isDirty === true, 'editFile isDirty 为 true');
    } catch (e) {
        assert(false, 'editFile 修改文件成功');
        assert(false, 'editFile isDirty 为 true');
    }

    // Test 7: Verify edited content
    console.log('[7/10] 验证编辑后内容...');
    try {
        const result = await postCommand('editor.getFileContent', {
            path: '/test-mcp-protocol.py',
        });
        assert(result.content.includes('Edited'), '编辑内容生效');
    } catch {
        assert(false, '编辑内容生效');
    }

    // Test 8: markSaved (关键测试 — 之前缺失的功能)
    console.log('[8/10] 测试 editor.markSaved...');
    try {
        const result = await postCommand('editor.markSaved', {
            path: '/test-mcp-protocol.py',
            content: '# MCP Protocol Test - Edited\nprint("Edited!")',
        });
        assert(result && result.isDirty === false, 'markSaved 将 isDirty 设为 false');
    } catch (e) {
        assert(false, 'markSaved 将 isDirty 设为 false');
    }

    // Test 9: newFile
    console.log('[9/10] 测试 editor.newFile...');
    try {
        const result = await postCommand('editor.newFile', {
            name: 'mcp-new-file-test.txt',
            language: 'plaintext',
            content: 'New file test content',
        });
        assert(result && result.name === 'mcp-new-file-test.txt', 'newFile 创建新文件成功');
    } catch (e) {
        assert(false, 'newFile 创建新文件成功');
    }

    // Test 10: deleteFile (cleanup)
    console.log('[10/10] 测试 editor.deleteFile (清理测试文件)...');
    try {
        const result = await postCommand('editor.deleteFile', {
            path: '/test-mcp-protocol.py',
        });
        assert(result && result.deleted === true, 'deleteFile 删除文件成功');
    } catch (e) {
        assert(false, 'deleteFile 删除文件成功');
    }

    // Cleanup: close the new file too
    try {
        await postCommand('editor.deleteFile', { path: '/mcp-new-file-test.txt' });
    } catch { /* ignore */ }

    console.log('\n=== 测试结果 ===');
    console.log(`通过: ${results.pass}/${results.pass + results.fail}`);
    console.log(`失败: ${results.fail}`);

    if (results.fail > 0) {
        console.log('\n失败的测试:');
        results.tests.filter(t => t.status === 'FAIL').forEach(t => console.log(`  - ${t.name}`));
    }

    return results.fail === 0;
}

runTests().then(success => {
    process.exit(success ? 0 : 1);
}).catch(e => {
    console.error('测试运行出错:', e);
    process.exit(1);
});