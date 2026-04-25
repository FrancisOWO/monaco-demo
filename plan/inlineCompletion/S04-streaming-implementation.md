# S04: 流式实现踩坑记录

## 问题 1: SSE 解析错误导致数据丢失

### 现象
流式接收时，某些 chunk 没有被正确解析，导致补全内容缺失。

### 分析
SSE (Server-Sent Events) 格式：
```
data: {"choices":[{"text":"hello"}]}

data: {"choices":[{"text":" world"}]}

data: [DONE]
```

早期实现按行分割后直接解析，没有处理：
1. 一个 chunk 包含多行数据
2. 数据被分割在多个 chunk 中
3. `[DONE]` 标记的处理

### 解决方案
实现健壮的 SSE 解析器：

```typescript
export class StreamedLLMClient implements ILLMClient {
    private buffer = ''; // 用于存储跨 chunk 的不完整数据

    async requestCompletionStreaming(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }> {
        // ... 发送请求 ...

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let fullText = '';
        let firstTokenReceived = false;

        const backgroundCache = new Promise<CompletionResult[]>((resolve) => {
            const readChunk = async () => {
                try {
                    while (true) {
                        const { done, value } = await reader.read();

                        if (done) {
                            // 处理剩余缓冲区
                            this.processBuffer(this.buffer, (text) => {
                                fullText += text;
                            });
                            resolve(this.createResults(fullText, context));
                            return;
                        }

                        // 解码新数据并添加到缓冲区
                        const chunk = decoder.decode(value, { stream: true });
                        this.buffer += chunk;

                        // 处理完整的 SSE 消息
                        const lines = this.buffer.split('\n');
                        this.buffer = lines.pop() ?? ''; // 保留不完整的最后一行

                        for (const line of lines) {
                            this.processLine(line, (text) => {
                                fullText += text;
                                if (!firstTokenReceived && text) {
                                    firstTokenReceived = true;
                                }
                            });
                        }
                    }
                } catch (error) {
                    resolve([]);
                }
            };

            readChunk();
        });

        // 等待第一个 token
        while (!firstTokenReceived) {
            await new Promise(resolve => setTimeout(resolve, 10));
        }

        return {
            firstResult: this.createResult(fullText, context),
            backgroundCache,
        };
    }

    private processLine(line: string, callback: (text: string) => void): void {
        if (!line.startsWith('data: ')) {
            return;
        }

        const dataStr = line.slice(6);
        if (dataStr === '[DONE]') {
            return;
        }

        try {
            const data = JSON.parse(dataStr);
            const text = data.choices?.[0]?.delta?.content ?? 
                        data.choices?.[0]?.text ?? '';
            if (text) {
                callback(text);
            }
        } catch {
            // JSON 解析失败，可能是跨行的不完整数据
        }
    }

    private processBuffer(buffer: string, callback: (text: string) => void): void {
        // 处理缓冲区中剩余的数据
        const lines = buffer.split('\n');
        for (const line of lines) {
            this.processLine(line, callback);
        }
    }
}
```

### 经验
- 使用缓冲区处理跨 chunk 的不完整数据
- 保留不完整的最后一行到下一次处理
- 使用 `{ stream: true }` 选项正确解码
- 处理 `[DONE]` 标记

---

## 问题 2: 首 token 延迟过高

### 现象
首 token 返回时间较长（>500ms），用户感知延迟明显。

### 分析
早期实现等待整个补全完成才返回，没有利用流式特性。

### 解决方案
优化首 token 检测：

```typescript
async requestCompletionStreaming(
    prompt: PromptInfo,
    strategy: CompletionStrategy,
    context: CompletionRequestContext,
): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }> {
    // ...

    const firstTokenPromise = new Promise<void>((resolve) => {
        const checkFirstToken = () => {
            if (firstTokenReceived) {
                resolve();
            } else {
                setTimeout(checkFirstToken, 5); // 更频繁的检查
            }
        };
        checkFirstToken();
    });

    // 设置超时
    const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error('First token timeout')), 500);
    });

    // 等待首 token 或超时
    try {
        await Promise.race([firstTokenPromise, timeoutPromise]);
    } catch {
        // 超时，返回空结果
        return {
            firstResult: this.createEmptyResult(context),
            backgroundCache: Promise.resolve([]),
        };
    }

    return {
        firstResult: this.createResult(fullText, context),
        backgroundCache,
    };
}
```

### 经验
- 使用轮询检查首 token，间隔要小（5-10ms）
- 设置首 token 超时，避免无限等待
- 首 token 到达后立即返回，不等待更多内容

---

## 问题 3: 后台缓存与主流程竞态

### 现象
用户快速接受补全后，后台缓存还在写入，导致后续请求使用过期数据。

### 分析
后台缓存 Promise 在用户接受后才 resolve，但此时缓存数据可能还未完全写入。

### 解决方案
确保缓存同步写入：

```typescript
const backgroundCache = new Promise<CompletionResult[]>((resolve) => {
    const results: CompletionResult[] = [];
    
    const readChunk = async () => {
        try {
            while (true) {
                const { done, value } = await reader.read();

                if (done) {
                    // 缓存所有结果
                    for (const result of results) {
                        this.cacheResult(result);
                    }
                    resolve(results);
                    return;
                }

                const chunk = decoder.decode(value);
                // 解析并添加到 results...
                const parsed = this.parseChunk(chunk);
                for (const text of parsed) {
                    results.push(this.createResult(text, context));
                }
            }
        } catch (error) {
            resolve(results); // 即使出错也返回已收集的结果
        }
    };

    readChunk();
});

// 在外部使用 backgroundCache 时
backgroundCache.then(results => {
    // 确保所有结果已缓存
    for (const result of results) {
        this.completionsCache.append(prefix, suffix, result);
    }
});
```

### 经验
- 后台缓存要确保数据完整写入
- 出错时也要 resolve，避免 Promise 一直 pending
- 在外部使用时再次确认缓存已写入

---

## 问题 4: 取消请求导致后台缓存异常

### 现象
用户快速取消请求后，后台缓存 Promise 抛出异常，影响后续请求。

### 分析
AbortController 取消后，reader.read() 会抛出 AbortError，但没有正确处理。

### 解决方案
正确处理取消异常：

```typescript
const backgroundCache = new Promise<CompletionResult[]>((resolve) => {
    const readChunk = async () => {
        try {
            while (true) {
                const { done, value } = await reader.read();
                // ...
            }
        } catch (error) {
            if (error instanceof DOMException && error.name === 'AbortError') {
                // 正常取消，返回已收集的结果
                resolve(results);
            } else {
                // 其他错误
                console.error('[StreamedLLMClient] Error:', error);
                resolve(results);
            }
        }
    };

    readChunk();
});

// 取消请求时
cancelRequest(_requestId: string): void {
    this.abortController?.abort();
    this.abortController = null;
}
```

### 经验
- AbortError 是正常取消，不要当作错误处理
- 即使取消也要 resolve Promise，避免内存泄漏
- 收集已接收的数据，部分结果也有价值

---

## 问题 5: 不同 LLM 提供商的 SSE 格式差异

### 现象
切换到不同 LLM 提供商后，流式接收失败或数据解析错误。

### 分析
不同提供商的 SSE 格式略有差异：
- OpenAI: `data: {...}`
- Anthropic: `data: {...}`
- 某些提供商: 没有 `data: ` 前缀
- delta 字段: `choices[0].delta.content` vs `choices[0].text`

### 解决方案
实现灵活的解析器：

```typescript
private processLine(line: string, callback: (text: string) => void): void {
    // 移除 data: 前缀（如果有）
    const dataPrefix = 'data: ';
    let dataStr = line;
    if (line.startsWith(dataPrefix)) {
        dataStr = line.slice(dataPrefix.length);
    }

    // 处理 [DONE] 标记
    if (dataStr === '[DONE]') {
        return;
    }

    // 尝试解析 JSON
    try {
        const data = JSON.parse(dataStr);
        
        // 支持多种字段路径
        const text = data.choices?.[0]?.delta?.content ??
                    data.choices?.[0]?.text ??
                    data.content ??
                    data.completion ??
                    '';
                    
        if (text) {
            callback(text);
        }
    } catch {
        // 如果不是 JSON，可能是纯文本
        if (dataStr && dataStr !== '') {
            callback(dataStr);
        }
    }
}
```

### 经验
- 支持多种字段路径，提高兼容性
- 处理非 JSON 格式的纯文本
- 提供配置项让用户自定义解析逻辑

---

## 问题 6: 大段文本导致内存溢出

### 现象
接收大段补全（多行，>100 行）时，浏览器内存占用过高。

### 分析
持续累积 fullText，没有限制大小，大文本时内存持续增长。

### 解决方案
添加内存限制：

```typescript
export class StreamedLLMClient implements ILLMClient {
    private maxBufferSize = 10 * 1024 * 1024; // 10MB 限制

    async requestCompletionStreaming(
        prompt: PromptInfo,
        strategy: CompletionStrategy,
        context: CompletionRequestContext,
    ): Promise<{ firstResult: CompletionResult; backgroundCache: Promise<CompletionResult[]> }> {
        // ...
        let fullText = '';
        
        const readChunk = async () => {
            try {
                while (true) {
                    const { done, value } = await reader.read();

                    if (done) {
                        resolve(results);
                        return;
                    }

                    const chunk = decoder.decode(value);
                    
                    // 检查缓冲区大小
                    if (fullText.length + chunk.length > this.maxBufferSize) {
                        console.warn('[StreamedLLMClient] Buffer size limit reached');
                        // 停止接收
                        this.cancelRequest(context.requestId);
                        resolve(results);
                        return;
                    }

                    fullText += chunk;
                    // 解析并处理...
                }
            } catch (error) {
                // ...
            }
        };
    }
}
```

### 经验
- 设置缓冲区大小限制
- 超出限制时优雅停止
- 记录警告日志便于排查

---

## 最佳实践总结

1. **SSE 解析**: 使用缓冲区处理跨 chunk 数据，保留不完整行
2. **首 token 优化**: 轮询检查，间隔 5-10ms，设置 500ms 超时
3. **后台缓存**: 确保数据完整写入，出错也要 resolve
4. **取消处理**: AbortError 是正常取消，resolve 已收集的数据
5. **格式兼容**: 支持多种字段路径，处理非 JSON 格式
6. **内存限制**: 设置缓冲区上限，超出时优雅停止
