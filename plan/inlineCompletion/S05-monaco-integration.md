# S05: Monaco 集成踩坑记录

## 问题 1: InlineCompletionsProvider 命名不一致

### 现象
Monaco API 中使用 `InlineCompletionsProvider`（带 s），但早期代码使用 `InlineCompletionProvider`（不带 s），导致类型错误。

### 分析
Monaco Editor 的 API 命名：
- `monaco.languages.InlineCompletionsProvider`（带 s）
- `monaco.languages.InlineCompletions`（带 s）
- `monaco.languages.InlineCompletion`（不带 s）

Provider 和 返回类型都带 s，单个 completion 不带 s。

### 解决方案
统一命名：

```typescript
// 类名使用带 s 的版本
export class MonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
    // ...
}

// 接口名保持一致
export interface ICompletionsCache {
    findAll(prefix: string, suffix: string): CompletionResult[];
}

// 枚举和类型根据实际情况
export interface CompletionResult {
    insertText: string;
    // ...
}
```

在项目中统一搜索替换：
- `InlineCompletionProvider` → `InlineCompletionsProvider`
- `InlineCompletionList` → `InlineCompletions`

### 经验
- 严格遵循 Monaco API 的命名
- Provider 和返回类型通常都带 s
- 单个 item 不带 s

---

## 问题 2: provideInlineCompletions 返回格式错误

### 现象
返回的补全列表在编辑器中不显示，或显示位置错误。

### 分析
Monaco 的 `InlineCompletions` 接口：

```typescript
interface InlineCompletions {
    items: InlineCompletion[];
    dispose(): void;
}

interface InlineCompletion {
    insertText: string;
    range?: IRange;
    command?: Command;
}
```

早期错误：
1. 返回 `{ items: [...], dispose: () => {} }`，但 dispose 不是函数
2. range 格式错误（使用了 monaco.Range 而不是普通对象）
3. 没有处理 dispose 方法

### 解决方案
正确返回格式：

```typescript
async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    _token: monaco.CancellationToken,
): Promise<monaco.languages.InlineCompletions> {
    // 获取补全
    const completions = await this.controller.getCompletions(requestContext);

    // 转换为 Monaco 格式
    const items: monaco.languages.InlineCompletion[] = completions.map(c => ({
        insertText: c.insertText,
        range: {
            startLineNumber: c.range.startLineNumber,
            startColumn: c.range.startColumn,
            endLineNumber: c.range.endLineNumber,
            endColumn: c.range.endColumn,
        }, // 使用普通对象，不是 monaco.Range
    }));

    return {
        items,
        dispose: () => {
            // 清理资源
            this.controller.cancelCurrentRequest();
        },
    };
}
```

### 经验
- range 使用普通对象格式 `{ startLineNumber, startColumn, endLineNumber, endColumn }`
- dispose 必须是函数，用于清理资源
- items 数组可以为空，表示没有补全

---

## 问题 3: 行尾检测不准确导致非行尾位置显示补全

### 现象
补全在非行尾位置（行中间）也显示，干扰用户输入。

### 分析
Ghost Text 应该只在行尾触发，需要检查光标后是否只有空白字符。

### 解决方案
添加行尾检测：

```typescript
async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    _token: monaco.CancellationToken,
): Promise<monaco.languages.InlineCompletions> {
    // 检查是否在行尾（Ghost Text 只在行尾触发）
    const line = model.getLineContent(position.lineNumber);
    const textAfterCursor = line.substring(position.column - 1);
    if (textAfterCursor.trim() !== '') {
        return { items: [] }; // 不在行尾，不显示补全
    }

    // ... 继续获取补全
}
```

### 经验
- Ghost Text 只在行尾触发
- 检查光标后是否有非空白字符
- 返回空 items 表示不显示补全

---

## 问题 4: 编辑器事件监听导致内存泄漏

### 现象
长时间使用后浏览器内存不断增长，刷新页面后才恢复。

### 分析
在 setup 中注册了编辑器事件监听，但没有在 dispose 时取消。

### 解决方案
正确管理订阅：

```typescript
export function setupInlineCompletion(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
    config: InlineCompletionConfig,
): { dispose: () => void } {
    // 创建组件
    // ...

    // 注册到 Monaco
    const disposable = monacoInstance.languages.registerInlineCompletionsProvider(
        { pattern: '**/*' },
        provider,
    );

    // 监听编辑器事件
    const contentChangeDisposable = editor.onDidChangeModelContent(() => {
        controller.cancelCurrentRequest();
    });

    // 返回 dispose 函数
    return {
        dispose: () => {
            disposable.dispose();
            contentChangeDisposable.dispose();
            controller.dispose();
        },
    };
}

// 在 main.js 中使用
const inlineCompletion = setupInlineCompletion(monaco, editor, config);

// 切换语言时清理
editor.onDidChangeModel(() => {
    inlineCompletion.dispose();
});
```

### 经验
- 所有事件监听都要保存 disposable
- 返回 dispose 函数供外部调用
- 在编辑器切换模型时清理资源

---

## 问题 5: 多 Provider 冲突导致补全重复

### 现象
同时使用 Ghost Text 和 LSP 补全时，出现重复的补全建议。

### 分析
Monaco 支持多个 InlineCompletionsProvider，会合并所有结果。需要设置优先级或过滤。

### 解决方案
设置 Provider 优先级：

```typescript
// Ghost Text Provider 设置较高优先级
monacoInstance.languages.registerInlineCompletionsProvider(
    { pattern: '**/*' },
    provider,
    // 某些 Monaco 版本支持优先级参数
);

// 或者在 provideInlineCompletions 中过滤
async provideInlineCompletions(
    model: monaco.editor.ITextModel,
    position: monaco.Position,
    context: monaco.languages.InlineCompletionContext,
    token: monaco.CancellationToken,
): Promise<monaco.languages.InlineCompletions> {
    // 如果其他 Provider 已经提供了补全，可以选择不显示
    if (context.selectedCompletionInfo) {
        return { items: [] };
    }

    // ...
}
```

### 经验
- 了解 Monaco 的 Provider 合并机制
- 可以通过返回值控制是否显示
- 考虑提供配置让用户选择是否启用

---

## 问题 6: 编辑器切换模型后补全不工作

### 现象
用户切换文件（语言）后，补全功能停止工作。

### 分析
Provider 注册在特定模型上，切换模型后需要重新注册或确保 Provider 是全局的。

### 解决方案
使用全局模式注册：

```typescript
// 使用全局模式
monacoInstance.languages.registerInlineCompletionsProvider(
    { pattern: '**/*' }, // 匹配所有文件
    provider,
);

// 或者在 setup 中监听模型切换
export function setupInlineCompletion(
    monacoInstance: typeof monaco,
    editor: monaco.editor.ICodeEditor,
    config: InlineCompletionConfig,
): void {
    let currentController: FullGhostTextController | null = null;

    // 初始化当前模型
    setupForModel(editor.getModel());

    // 监听模型切换
    editor.onDidChangeModel((e) => {
        // 清理旧的
        if (currentController) {
            currentController.dispose();
            currentController = null;
        }
        // 设置新的
        setupForModel(e.newModel);
    });

    function setupForModel(model: monaco.editor.ITextModel | null) {
        if (!model) return;
        
        // 创建新的 controller
        currentController = new FullGhostTextController(
            // ...
        );
    }
}
```

### 经验
- Provider 可以注册为全局（pattern: '**/*'）
- 模型切换时要重新初始化
- 清理旧模型的资源

---

## 问题 7: handleLifecycle 方法未正确实现

### 现象
补全显示、接受、拒绝等生命周期事件没有被正确追踪。

### 分析
Monaco Provider 可以可选实现以下方法：
- `handleDidShowCompletionItem`
- `handleDidPartiallyAcceptCompletionItem`
- `freeInlineCompletions`

早期没有正确实现这些方法。

### 解决方案
正确实现生命周期方法：

```typescript
export class MonacoInlineCompletionsProvider implements monaco.languages.InlineCompletionsProvider {
    /**
     * 处理补全被显示的事件
     */
    handleDidShowCompletionItem(
        completionItem: monaco.languages.InlineCompletion,
    ): void {
        // 触发投机请求
        const completionId = (completionItem as any).completionId;
        if (completionId) {
            this.controller.handleLifecycle(completionId, 'shown' as CompletionLifecycleKind);
        }
    }

    /**
     * 处理补全被部分接受的事件
     */
    handleDidPartiallyAcceptCompletionItem(
        completionItem: monaco.languages.InlineCompletion,
    ): void {
        // 记录部分接受长度
        const completionId = (completionItem as any).completionId;
        if (completionId) {
            // 可以记录接受的字符数
        }
    }

    /**
     * 释放补全资源
     */
    freeInlineCompletions(
        completions: monaco.languages.InlineCompletions,
    ): void {
        // 发送遥测
        completions.items.forEach(item => {
            const completionId = (item as any).completionId;
            if (completionId) {
                this.controller.handleLifecycle(completionId, CompletionLifecycleKind.Ignored);
            }
        });
    }
}
```

### 经验
- 生命周期方法是可选的，但实现后可以更好地追踪用户行为
- shown 事件可以触发投机请求
- freeInlineCompletions 用于发送未接受/忽略的遥测

---

## 最佳实践总结

1. **命名一致性**: 严格遵循 Monaco API 的命名规范，Provider 和返回类型带 s
2. **返回格式**: range 使用普通对象，dispose 必须是函数
3. **行尾检测**: Ghost Text 只在行尾触发，检查光标后是否有非空白字符
4. **内存管理**: 保存所有 disposable，提供 dispose 函数
5. **多 Provider**: 了解 Provider 合并机制，可以通过返回值控制是否显示
6. **模型切换**: 监听 onDidChangeModel，重新初始化资源
7. **生命周期**: 实现 handleDidShow/handleDidPartiallyAccept/freeInlineCompletions 追踪用户行为
