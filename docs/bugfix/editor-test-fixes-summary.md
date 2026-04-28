# 编辑器测试相关 bug 修复说明

本文档整理前一轮工作中实际修复的问题、原因、修改方式和验证结果。该轮工作主要修复的是测试体系与测试断言问题，没有修改编辑器业务运行时代码。

## 关联提交

- `c94a24c test: cover editor features`
- `91aefad docs: 更新编辑器测试指南`

## 修复 1：`pnpm test` 只运行 server 测试

### 问题现象

`package.json` 中的 `test` 脚本指向 `server/jest.config.js`，导致根目录已有的前端 `src/inlineCompletion/__tests__` 测试没有通过默认命令统一运行。

这会带来两个问题：

- 编辑器前端相关测试容易被遗漏。
- 后续新增 `file-store`、LSP client、AI completion 等测试时，默认测试入口无法覆盖它们。

### 原因

项目同时存在根目录 `jest.config.js` 和 `server/jest.config.js`，但 npm 脚本使用的是 server 配置：

```json
"test": "jest --config server/jest.config.js"
```

### 修复方式

将 `package.json` 的测试脚本切换到根目录统一配置：

```json
"test": "jest --config jest.config.js",
"test:watch": "jest --config jest.config.js --watch"
```

同时更新根目录 `jest.config.js`，统一匹配：

- `server/test/**/*.test.js`
- `src/**/__tests__/**/*.test.ts`

### 影响范围

现在 `pnpm test` 会同时运行 server 集成测试、inline completion 测试，以及新增的编辑器核心模块测试。

## 修复 2：Jest 无法稳定执行前端 ESM/TypeScript 测试

### 问题现象

新增前端测试后，Jest 在 Node 环境下执行 ESM 风格源码和 TypeScript 测试时容易出现模块加载问题，例如：

- ESM `import/export` 无法按 CommonJS 测试环境执行。
- 动态 `import()` 在当前 Jest VM 配置下报错。
- 直接加载 `monaco-editor` 可能触发 AMD 运行时错误，例如 `define is not defined`。

### 原因

原有根目录 Jest 配置使用 `ts-jest` 的 ESM preset，仅覆盖 `src/inlineCompletion/__tests__/**/*.test.ts`。这对部分 TypeScript 测试可用，但不适合同时处理：

- 前端原生 ESM `.js` 源码。
- TypeScript 测试文件。
- Node/Jest 下需要 mock 的 Monaco 依赖。

### 修复方式

新增 `test/jest-esbuild-transformer.cjs`，使用项目已有的 `esbuild` 将 `.js`、`.ts`、`.tsx` 统一转换为 CommonJS：

```js
const result = esbuild.transformSync(sourceText, {
    loader,
    format: 'cjs',
    target: 'node20',
    sourcemap: 'inline',
});
```

并在 `jest.config.js` 中统一配置：

```js
transform: {
    '^.+\\.[tj]sx?$': '<rootDir>/test/jest-esbuild-transformer.cjs',
}
```

测试中的动态 `import()` 也改为 `require()`，确保在 CommonJS 转换后稳定执行。

### 影响范围

前端测试可以在 Node/Jest 环境中稳定运行，不需要启动 Vite、浏览器或真实 Monaco 实例。

## 修复 3：`monacoInlineCompletionsProvider` 测试 mock 失效

### 问题现象

切换 transformer 后，`src/inlineCompletion/__tests__/monacoInlineCompletionsProvider.test.ts` 可能直接加载真实 `monaco-editor`，导致 Node 环境中出现：

```text
ReferenceError: define is not defined
```

### 原因

该测试依赖 `jest.mock('monaco-editor', ...)` 在导入被测模块之前生效。转换器变化后，静态 `import` 的执行顺序不再满足这个测试假设，mock 没有先于被测模块加载。

### 修复方式

将被测模块和相关 runtime enum 的静态导入改为 `require()`：

```ts
const { MonacoInlineCompletionsProvider } = require('../monacoInlineCompletionsProvider.js');
const {
    InlineCompletionTriggerKind,
    CompletionSource,
} = require('../types.js');
```

保留 `import type`，只用于 TypeScript 类型检查，不参与运行时加载。

### 影响范围

`monacoInlineCompletionsProvider` 测试现在只使用 mock 的 Monaco API，不会加载真实 `monaco-editor` AMD 包。

## 修复 4：`ConsoleTelemetryEmitter` 测试断言过期

### 问题现象

`src/inlineCompletion/__tests__/telemetryEmitter.test.ts` 原来断言 `console.log` 被直接调用，但当前实现已经通过统一 logger 输出：

```ts
const logger = getLogger('Telemetry');

export class ConsoleTelemetryEmitter implements ITelemetryEmitter {
    emit(event: TelemetryEvent): void {
        logger.info(event.eventType, event);
    }
}
```

因此旧测试会失败，表现为 `console.log` 没有调用。

### 原因

测试没有跟随实现从直接 console 输出迁移到统一 logger。

### 修复方式

在测试中 mock `../../utils/logger.js`，断言 `logger.info` 的调用：

```ts
expect(logger.info).toHaveBeenCalledWith('completion.issued', event);
```

### 影响范围

遥测测试重新与当前实现对齐，后续如果 telemetry 输出协议改变，测试会在 logger 调用层面及时失败。

## 修复 5：测试文档与实际测试入口不一致

### 问题现象

原 `docs/testing-guide.md` 主要描述旧的 AI 补全手工测试流程，自动化测试部分只提到 server 测试，和当前项目测试体系不一致。

### 原因

测试范围扩展后，文档没有同步更新。

### 修复方式

重写 `docs/testing-guide.md`，明确说明：

- 当前统一测试入口是根目录 `jest.config.js`。
- `pnpm test` 会运行 server 和 `src/**/__tests__`。
- 前端测试使用 Node 环境和 mock 策略。
- 各模块测试文件对应的覆盖范围。
- 新增测试维护规则。

### 影响范围

后续维护者可以直接根据文档判断测试应该放在哪里、如何运行、哪些外部能力应使用 mock。

## 新增测试固化的回归风险

这部分不是直接修复业务代码 bug，但新增测试把编辑器功能的关键行为固定下来，后续相关 bug 会更早暴露。

### 文件与标签状态

新增 `src/file-system/__tests__/file-store.test.ts`、`fs-access.test.ts`、`language-utils.test.ts`，覆盖：

- 打开文件、切换 active file、保存/恢复 view state。
- 内容变更后 dirty 状态更新。
- 保存 existing file 和 untitled file 的不同路径。
- 关闭文件后切换到相邻 tab，最后一个文件关闭后清空 editor model。
- 删除持久化文件后触发 file tree 变化。
- File System Access API 的取消、读写、创建、删除行为。

### LSP 客户端与文档同步

新增 `src/lsp/__tests__/python-client.test.ts` 和 `document-sync.test.ts`，覆盖：

- WebSocket 连接和 LSP `initialize`/`initialized` 流程。
- LSP request/notification 的 `Content-Length` 封包。
- request timeout。
- diagnostics 按 URI 定位 model，失败时 fallback 到当前 editor model。
- completion provider 的文档符号补全和 LSP 缓存补全。
- hover provider 的内容格式归一化。
- Python 文档 didOpen、didChange debounce、version 递增、didClose 清理。

### AI completion 与基础补全

新增 `src/__tests__/ai-completion.test.ts` 和 `src/completions/__tests__`，覆盖：

- AI completion 快捷键注册。
- 单行补全请求体、最佳 suggestion 选择和插入。
- 请求失败时不插入文本。
- SSE 多行补全累积插入。
- 用户输入取消多行补全。
- completion range、默认 Monaco 补全合并、基础语言 provider 注册。

## 验证结果

已运行：

```bash
pnpm test -- --runInBand
```

结果：

```text
Test Suites: 16 passed, 16 total
Tests:       83 passed, 83 total
Snapshots:   0 total
```

## 后续约定

- 修复每一组 bug 后及时运行相关测试。
- 测试通过后及时提交 git commit。
- commit message 使用 `type: 中文描述` 格式，例如 `fix: 修复 LSP 文档同步`、`docs: 更新测试说明`。
- 提到代码中的特定命名时保留英文，例如 `file-store`、`MonacoInlineCompletionsProvider`、`ConsoleTelemetryEmitter`。
