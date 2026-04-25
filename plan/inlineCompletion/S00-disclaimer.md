# 踩坑记录说明

## 真实遇到的问题

以下是本项目开发过程中**真实遇到**的问题：

### 1. 文件名大小写问题（S05）
**文件**: `setup.ts` 引用 `monacoInlineCompletionProvider.js`（实际文件是 `monacoInlineCompletionsProvider.js`，带 s）

**错误信息**:
```
[UNRESOLVED_IMPORT] Error: Could not resolve './monacoInlineCompletionProvider.js' in src/inlineCompletion/setup.ts
```

**解决**: 修改导入路径为带 s 的版本。

---

### 2. 类型导入问题（S01）
**文件**: 测试文件中使用 `import type { CompletionSource }` 然后作为值使用

**错误信息**:
```
'CompletionSource' cannot be used as a value because it was imported using 'import type'.
```

**解决**: 改为值导入 `import { CompletionSource } from '../types.js'`。

---

### 3. Monaco API 类型不匹配（S05）
**文件**: `monacoInlineCompletionsProvider.ts`

**错误信息**:
```
Class 'MonacoInlineCompletionProvider' incorrectly implements interface 'InlineCompletionsProvider'
  Property 'disposeInlineCompletions' is missing
```

**解决**: 
1. 类名改为 `MonacoInlineCompletionsProvider`（带 s）
2. 实现 `disposeInlineCompletions` 方法
3. 返回类型改为 `monaco.languages.InlineCompletions`（不带 dispose）

---

### 4. CompletionLifecycleKind 定义语法错误（types.ts）
**文件**: `types.ts`

**错误信息**:
```
error TS2304: Cannot find name 'Shown'.
error TS1109: Expression expected.
```

**原因**: 编辑时误删了 `export enum CompletionLifecycleKind {` 这一行

**解决**: 恢复正确的枚举定义。

---

### 5. 导入 monaco-editor 在 Node.js 环境报错（测试）
**文件**: `monacoInlineCompletionsProvider.test.ts`

**错误信息**:
```
ReferenceError: define is not defined
```

**解决**: 使用 `jest.mock('monaco-editor', ...)` 在测试前 mock Monaco。

---

## 推测可能遇到的问题

以下是基于代码架构和常见模式**推测可能遇到**的问题（在本项目开发中没有真实遇到，因为测试环境没有真实的 LLM 服务和长时间运行场景）：

### S01 - Prompt 构建
- 级联预算分配顺序不当
- trailingWs 未正确处理
- Token 估算不准确
- Context Provider 超时未处理
- Suffix 缓存匹配命中率低

### S02 - 缓存策略
- RadixTrie 插入导致树结构损坏
- LRU 淘汰策略实现不当导致内存泄漏
- Typing-as-Suggested 边界情况处理不当
- SpeculativeRequest 竞态条件
- Debounce 导致请求丢失

### S03 - 多行检测
- 文件长度检查不准确
- AST 空块检测误判率高
- ML 评分模型过于简单
- BlockMode 切换导致策略不一致
- finishedCb 回调时机不当

### S04 - 流式实现
- SSE 解析错误导致数据丢失
- 首 token 延迟过高
- 后台缓存与主流程竞态
- 取消请求导致后台缓存异常
- 不同 LLM 提供商的 SSE 格式差异
- 大段文本导致内存溢出

### S05 - Monaco 集成
- 行尾检测不准确
- 编辑器事件监听导致内存泄漏
- 多 Provider 冲突
- 编辑器切换模型后补全不工作
- handleLifecycle 方法未正确实现

## 文档使用建议

- **真实问题**: 优先参考，这些是实际发生并解决的
- **推测问题**: 作为预防性参考，在实际部署时可能遇到

## 改进计划

如需验证推测问题，需要：
1. 接入真实的 LLM 服务进行端到端测试
2. 长时间运行测试（内存泄漏检测）
3. 大文件测试（>10000 行）
4. 多语言测试（JavaScript, Python, TypeScript）
5. 用户行为测试（快速输入、接受/拒绝等）
