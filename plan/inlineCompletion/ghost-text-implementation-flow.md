# Ghost Text Inline Completion - 实现流程

## 概述

本文档记录 Ghost Text Inline Completion 完整版的实现流程，包括从简易版到完整版的升级路径、各组件的依赖关系、以及关键实现细节。

## 实现阶段

### Phase 1: 核心骨架 (1-2 天)

#### Step 1: 扩展核心类型定义

**目标**: 在保持与简易版兼容的前提下，扩展类型定义以支持完整版功能。

**关键决策**:
- 使用枚举扩展而非替换，确保向后兼容
- 所有新增属性设为可选（`?`），避免破坏现有代码
- 新增接口独立定义，不修改现有接口方法签名

**实现细节**:
```typescript
// CompletionSource 扩展
export enum CompletionSource {
    Network = 'network',
    Cache = 'cache',                     // 新增
    TypingAsSuggested = 'typingAsSuggested', // 新增
    Speculative = 'speculative',          // 新增
    Async = 'async',                      // 新增
}

// CompletionStrategy 扩展
export interface CompletionStrategy {
    requestMultiline: boolean;
    blockMode: BlockMode;
    stopTokens: string[];
    maxTokens: number;
    finishedCb?: FinishedCallback;        // 新增
    lookAhead?: number;                   // 新增
    blockPosition?: BlockPositionType;    // 新增
}
```

#### Step 2: 实现 CascadingPromptFactory

**目标**: 替换 SimplePromptBuilder，支持级联预算分配和 FIM。

**实现步骤**:
1. 定义 `IPromptComponent` 接口
2. 实现各个 Prompt 组件
3. 实现级联预算分配逻辑
4. 实现 `trimLastLine` 工具

**级联预算分配逻辑**:
```
总预算 = maxPromptLength (默认 2048 tokens)
分配比例:
- prefix: 35% = 716 tokens
- suffix: 15% = 307 tokens
- stableContext: 35% = 716 tokens
- volatileContext: 15% = 307 tokens

级联顺序:
如果 suffix 预算 > 0.8 * estimatedSuffixCost:
    顺序: stableContext → volatileContext → suffix → prefix
否则:
    顺序: stableContext → volatileContext → prefix → suffix

溢出处理: 剩余预算传递到下一组件
```

#### Step 3: 实现 StrategyManager

**目标**: 实现多行补全策略判定。

**决策链**:
1. 文件长度检查（>= 8000 行 → 强制单行）
2. MoreMultiline 特殊处理（仅接受后触发）
3. TypeScript 新行检测
4. AST 空块检测
5. ML 评分模型
6. 接受后强制多行

#### Step 4: 扩展 PostProcessor

**目标**: 添加完整版后处理逻辑。

**新增功能**:
- 重复检测（isRepetitive）
- MaybeSnip（移除重复闭合行）
- forceSingleLine（强制单行裁剪）

### Phase 2: 缓存与速度优化 (2-3 天)

#### Step 1: 实现 RadixTrie

**目标**: 实现高效的前缀匹配数据结构。

**实现要点**:
- 压缩前缀存储（Radix Tree）
- 支持通配符查找
- 支持值存储

#### Step 2: 实现 LRURadixTrieCache

**目标**: 基于 RadixTrie 的 LRU 缓存。

**关键实现**:
```typescript
class LRURadixTrieCache implements ICompletionsCache {
    private cache = new RadixTrie<CacheEntry[]>();
    private maxSize = 100;

    findAll(prefix: string, suffix: string): CompletionResult[] {
        // 在 Trie 中查找所有匹配 prefix 的节点
        // 过滤匹配 suffix 的条目
        // 更新访问时间
    }

    append(prefix: string, suffix: string, result: CompletionResult): void {
        // 检查缓存是否已满，执行 LRU 淘汰
        // 添加到 Trie
    }
}
```

#### Step 3: 实现 CurrentGhostText

**目标**: Typing-as-Suggested 功能。

**核心逻辑**:
- 用户输入与补全开头匹配时，本地返回调整后的补全
- 避免重复请求网络

**实现要点**:
```typescript
getCompletionsForUserTyping(prefix: string, suffix: string): CompletionResult[] | undefined {
    // 检查 prefix 是否以当前 prefix 开头
    // 计算用户新增的输入
    // 检查新增输入是否与补全开头匹配
    // 返回调整后的补全
}
```

#### Step 4: 实现 SpeculativeRequestCache

**目标**: 补全显示时预计算后续补全。

**流程**:
1. 补全显示时，缓存投机请求函数
2. 立即开始预计算
3. 用户接受时，直接返回预计算结果

#### Step 5: 实现 AsyncCompletionsManager

**目标**: 复用进行中的请求。

**核心逻辑**:
```typescript
async getFirstMatchingRequestWithTimeout(
    requestId: string,
    prefix: string,
    prompt: PromptInfo,
    timeout: number,
): Promise<CompletionResult[] | undefined> {
    // 查找匹配的进行中请求
    // 等待匹配请求完成或超时
    // 返回结果
}
```

#### Step 6: 升级 StreamedAICompletionClient

**目标**: 流式返回首个 token。

**实现要点**:
- 使用 ReadableStream API
- 解析 SSE 格式
- 首个 token 到达后立即返回
- 后台继续接收并缓存

### Phase 3: 上下文与多行支持 (2-3 天)

#### Step 1: 实现 ContextProviderRegistry

**目标**: 统一的上下文提供者框架。

**设计**:
- 支持多 provider 并行解析
- 每个 provider 有独立的时间预算
- 超时自动忽略

#### Step 2: 实现 BlockTrimmerRegistry

**目标**: AST 裁剪支持。

**实现**: `HeuristicBlockTrimmer`
- 基于启发式规则（不依赖 Tree-sitter）
- 检测块位置类型
- 检测空块起始
- 实现 verbose/terse 裁剪

#### Step 3: 实现 StreamedCompletionSplitter

**目标**: MoreMultiline 流式分割。

**核心逻辑**:
```typescript
getFinishedCallback(): FinishedCallback {
    return (text: string): number | undefined => {
        // 接收流式文本
        // 实时判定是否需要分割
        // 首次分割作为单行返回
        // 后续分割缓存
    };
}
```

#### Step 4: 实现 MultilineModel

**目标**: ML 多行评分模型。

**实现**: 基于启发式的 `DefaultMultilineModel`
- 代码模式匹配（函数定义、类定义等）
- 缩进变化检测
- 未闭合括号检测

### Phase 4: 遥测与集成 (1-2 天)

#### Step 1: 升级 TelemetryEmitter

**目标**: 批量发送 + idle 检测。

**实现**:
```typescript
class FullTelemetryEmitter implements ITelemetryEmitter {
    private queue: TelemetryEvent[] = [];

    emit(event: TelemetryEvent): void {
        this.queue.push(event);
        if (this.queue.length >= this.config.batchSize) {
            this.flush();
        }
    }

    startIdleDetection(config: { initialDelay: number; idleTimeout: number }): void {
        // 初始延迟后发送
        // 启动 idle 定时器
    }
}
```

#### Step 2: 集成 FullGhostTextController

**目标**: 整合所有组件。

**完整流程**:
```
1. 构建 Prompt (CascadingPromptFactory)
2. 判定策略 (StrategyManager)
3. Typing-as-Suggested? → 0ms 返回
4. Cache? → 0ms 返回
5. Async Manager? → ≤200ms 返回
6. Debounce → 等待 75ms
7. Network (流式) → 首个 token 立即返回
8. 后台缓存 → 更新 Cache
9. 触发投机请求
```

## 依赖关系图

```
FullGhostTextController
├── CascadingPromptFactory
│   ├── IPromptComponent (多个)
│   └── ContextProviderRegistry
│       └── IContextProvider (多个)
├── StrategyManager
│   ├── BlockTrimmerRegistry
│   │   └── IBlockTrimmer
│   └── MultilineModel
├── LRURadixTrieCache
│   └── RadixTrie
├── CurrentGhostText
├── SpeculativeRequestCache
├── AsyncCompletionsManager
├── StreamedAICompletionClient
├── FullPostProcessor
│   └── BlockTrimmerRegistry
└── FullTelemetryEmitter
```

## 测试策略

### 单元测试
- 每个组件独立测试
- Mock 依赖项
- 覆盖正常和异常路径

### 集成测试
- 测试组件间交互
- 验证完整流程

### 性能测试
- 缓存命中率
- 响应时间
- 内存使用

## 优化记录

### 性能优化
1. **RadixTrie**: 前缀匹配从 O(n) 优化到 O(m)，m 为前缀长度
2. **流式返回**: 首个 token 延迟从 500ms 降低到 50ms
3. **Typing-as-Suggested**: 避免 90% 的重复网络请求

### 内存优化
1. **LRU 淘汰**: 限制缓存大小为 100 条
2. **防抖**: 避免频繁触发请求
3. **AbortController**: 及时取消无用请求

## 已知限制

1. **HeuristicBlockTrimmer**: 基于启发式，不如 AST 解析准确
2. **MultilineModel**: 简化实现，非真正 ML 模型
3. **流式解析**: 依赖 SSE 格式，不同 LLM 可能不兼容

## 未来改进

1. 集成 Tree-sitter 实现真正的 AST 裁剪
2. 训练真正的 ML 多行评分模型
3. 支持更多 LLM 提供商的流式格式
4. 添加用户反馈收集（接受/拒绝率）
