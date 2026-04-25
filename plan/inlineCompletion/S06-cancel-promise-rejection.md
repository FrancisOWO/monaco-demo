# S06-Cancel-Promise-Rejection 问题踩坑记录

## 问题现象

在补全过程中，控制台报错：

```
async.js:300 Uncaught (in promise) Canceled: Canceled
    at UniqueContainer.value (async.js:300:20)
    at Emitter._deliver (event.js:866:22)
    at Emitter.fire (event.js:893:18)
    at MutableToken.cancel (cancellation.js:45:31)
    at CancellationTokenSource.cancel (cancellation.js:92:25)
    at Object.dispose (cancellation.js:24:23)
    at DisposableStore.clear (lifecycle.js:114:13)
    at runOnChange.js:45:15
```

## 问题触发流程

1. 用户在编辑器中输入内容
2. `setup.ts` 中 `editor.onDidChangeModelContent` 触发，调用 `controller.cancelCurrentRequest()`
3. Monaco 内部触发 `CancellationToken.cancel`
4. 报错发生在 `runOnChange.js` 附近

## 根因分析

在 `monacoInlineCompletionsProvider.ts` 中，原代码使用了 `Promise.race` 来监听取消信号：

```typescript
const cancellationTokenPromise = new Promise<never>((_, reject) => {
    const disposable = token.onCancellationRequested(() => {
        disposable.dispose();
        reject(new Error('Canceled'));
    });
});

const completions = await Promise.race([
    this.controller.getCompletions(requestContext),
    cancellationTokenPromise,
]);
```

**问题在于**：
1. `cancellationTokenPromise` 在监听 `onCancellationRequested` 事件时创建了一个会 rejection 的 Promise
2. 当 Monaco 触发取消时，这个 rejection 发生在 Monaco 内部 `async.js` 的上下文中
3. Monaco 的异步基础设施不会捕获这个 rejection，导致 "Uncaught (in promise)" 错误
4. 这是一个未处理的 Promise rejection，而不是一个正常业务流程

## 解决方案

移除 `Promise.race` 和取消监听逻辑，改为：

1. 在函数入口检查 `token.isCancellationRequested`，提前返回
2. 取消操作通过 `controller.cancelCurrentRequest()` 处理，该方法会取消防抖函数内部的待处理操作

```typescript
async provideInlineCompletions(...) {
    // 检查是否已取消
    if (token.isCancellationRequested) {
        return { items: [] };
    }
    // ... 后续逻辑
}
```

## 经验总结

1. **不要在 Monaco 内部上下文中创建未处理的 rejected Promise** - Monaco 的异步调度机制不会帮你捕获
2. **取消操作应该是幂等的** - 取消防抖、忽略结果，而不是抛出异常
3. **优先检查状态而非监听事件** - 在函数入口检查 `token.isCancellationRequested` 比监听取消事件更安全
