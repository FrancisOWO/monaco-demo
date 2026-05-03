# Ghost Text Inline Completion - 架构说明

## 系统架构

```
┌─────────────────────────────────────────────────────────────────┐
│                        Monaco Editor                             │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │            MonacoInlineCompletionsProvider                │    │
│  │  (provideInlineCompletions → 行尾触发 → 返回补全列表)      │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│  ┌──────────────────────────▼──────────────────────────────┐    │
│  │              FullGhostTextController                     │    │
│  │  ┌──────────────────────────────────────────────────┐   │    │
│  │  │ getCompletions():                                 │   │    │
│  │  │   ① TypingAsSuggested → 本地返回(0ms)            │   │    │
│  │  │   ② Cache (LRU Radix Trie) → 本地返回(0ms)       │   │    │
│  │  │   ③ AsyncManager → 复用进行中请求(≤200ms)        │   │    │
│  │  │   ④ Debounce → 等待防抖(75ms)                   │   │    │
│  │  │   ⑤ Network → 流式返回首个token                 │   │    │
│  │  └──────────────────────────────────────────────────┘   │    │
│  └──────────────────────────┬──────────────────────────────┘    │
│                             │                                     │
│    ┌────────────┬───────────┼───────────┬──────────────────┐    │
│    │            │           │           │                  │    │
│  ┌─▼──────┐ ┌──▼───────┐ ┌─▼────────┐ ┌▼──────────────┐ ┌─▼───────────┐
│  │Prompt  │ │  LLM     │ │ Post     │ │ Strategy      │ │ Telemetry   │
│  │Factory │ │  Client  │ │ Process  │ │ (multiline    │ │ (full       │
│  │(FIM+   │ │(stream+  │ │(dedup+   │ │  decision)    │ │  lifecycle) │
│  │ context│ │  cache)  │ │  trim)   │ │               │ │             │
│  └────────┘ └──────────┘ └──────────┘ └───────────────┘ └─────────────┘
│                                                                 │
│    ┌────────────┬───────────┐                                   │
│    │            │           │                                   │
│  ┌─▼──────┐ ┌──▼───────┐                                      │
│  │Cache   │ │ Current  │                                      │
│  │(LRU    │ │ GhostText│                                      │
│  │ Radix) │ │(typing)  │                                      │
│  └────────┘ └──────────┘                                      │
└─────────────────────────────────────────────────────────────────┘
```

## 核心组件

### 1. MonacoInlineCompletionsProvider
**职责**: Monaco API 适配层
- 实现 `monaco.languages.InlineCompletionsProvider` 接口
- 行尾位置检测
- 生命周期事件转发（shown/accepted/rejected）
- 转换为 Monaco 格式

**关键方法**:
- `provideInlineCompletions`: 主入口，返回补全列表
- `handleDidShowCompletionItem`: 补全显示时触发
- `freeInlineCompletions`: 补全销毁时触发

### 2. FullGhostTextController
**职责**: 补全流程编排
- 整合所有子组件
- 实现 5 层速度保障（Typing → Cache → Async → Debounce → Network）
- 管理补全生命周期
- 触发投机请求

**流程**:
```
1. CascadingPromptFactory.buildPrompt()
2. StrategyManager.determineStrategy()
3. CurrentGhostText.getCompletionsForUserTyping() → 0ms?
4. LRURadixTrieCache.findAll() → 0ms?
5. AsyncCompletionsManager.getFirstMatchingRequestWithTimeout() → ≤200ms?
6. Debounce 75ms
7. StreamedAICompletionClient.requestCompletionStreaming() → 首个 token
8. BackgroundCache → 更新 LRURadixTrieCache
9. TriggerSpeculativeRequest
```

### 3. CascadingPromptFactory
**职责**: 级联预算 Prompt 构建
- 按预算分配渲染各组件
- 溢出预算传递到下一组件
- 支持 FIM (Fill-In-the-Middle)

**组件**:
- DocumentPrefixComponent: 光标前内容
- DocumentSuffixComponent: 光标后内容（带缓存匹配）
- DocumentMarkerComponent: 文件路径/语言标记
- TraitsComponent: 元数据特征
- DiagnosticsComponent: 诊断信息
- CodeSnippetsComponent: 代码片段
- SimilarFilesComponent: 邻近文件片段
- RecentEditsComponent: 最近编辑历史

**预算分配**:
- prefix: 35%
- suffix: 15%
- stableContext: 35%
- volatileContext: 15%

### 4. StrategyManager
**职责**: 多行补全策略判定

**决策链**:
1. 文件长度限制（>= 8000 行 → 强制单行）
2. MoreMultiline 特殊规则（仅接受后触发）
3. TypeScript 新行检测
4. AST 空块检测
5. ML 评分模型（MultilineModel）
6. 接受后强制多行

**BlockMode**:
- Server: 服务端决定何时停止
- Parsing: 客户端 AST 解析决定
- ParsingAndServer: 两者结合
- MoreMultiline: 流式分割多行

### 5. 缓存系统

#### LRURadixTrieCache
**职责**: 前缀匹配缓存
- Radix Trie 数据结构
- LRU 淘汰策略
- 支持 suffix 匹配过滤

#### CurrentGhostText
**职责**: Typing-as-Suggested
- 跟踪当前显示的补全
- 用户输入匹配时本地返回
- 避免 90% 的重复网络请求

#### SpeculativeRequestCache
**职责**: 投机请求
- 补全显示时预计算后续补全
- 用户接受时直接返回结果

#### AsyncCompletionsManager
**职责**: 复用进行中请求
- 检测 prefix 匹配的 pending 请求
- 等待匹配请求完成或超时（200ms）

### 6. 流式 LLM 客户端

#### StreamedAICompletionClient
**职责**: 流式请求处理
- SSE (Server-Sent Events) 解析
- 首个 token 快速返回（~50ms）
- 后台缓存后续结果

**流程**:
1. 发送流式请求（stream: true）
2. 接收 SSE 数据
3. 首个 token 到达后立即返回
4. 后台继续接收并缓存

### 7. 后处理器

#### FullPostProcessor
**职责**: 补全结果质量过滤
- trimEnd 空白裁剪
- 重复检测（isRepetitive）
- 下一行匹配检测
- MaybeSnip（移除重复闭合行）
- forceSingleLine（强制单行）
- BlockTrimmer 裁剪

### 8. 遥测系统

#### FullTelemetryEmitter
**职责**: 事件收集与发送
- 批量发送（batch size: 10）
- idle 检测延迟发送（30s）
- 队列大小限制（100）

**事件类型**:
- completion.issued: 请求发出
- completion.received: 收到响应
- completion.shown: 补全显示
- completion.accepted: 用户接受
- completion.rejected: 用户拒绝

## 数据流

```
用户输入
  │
  ▼
MonacoInlineCompletionsProvider.provideInlineCompletions()
  │
  ▼
FullGhostTextController.getCompletions()
  │
  ├─► CascadingPromptFactory.buildPrompt() ──► PromptInfo
  │
  ├─► StrategyManager.determineStrategy() ──► CompletionStrategy
  │
  ├─► CurrentGhostText.getCompletionsForUserTyping() ──► [结果] 或 undefined
  │
  ├─► LRURadixTrieCache.findAll() ──► [结果] 或 []
  │
  ├─► AsyncCompletionsManager.getFirstMatchingRequestWithTimeout() ──► [结果] 或 undefined
  │
  ├─► Debounce 75ms
  │
  └─► StreamedAICompletionClient.requestCompletionStreaming()
        │
        ├─► 首个 token ──► 立即返回
        │
        └─► 后台缓存 ──► LRURadixTrieCache.append()
  │
  ▼
FullPostProcessor.process() ──► CompletionResult[]
  │
  ▼
FullTelemetryEmitter.emit()
  │
  ▼
转换为 Monaco 格式 ──► InlineCompletions
```

## 关键设计决策

### 1. 向后兼容
- 所有类型扩展都是可选属性
- 新增枚举值，不修改现有值
- 新增接口方法用 `?` 标记

### 2. 性能优先
- 0ms 路径：Typing → Cache → Async
- 流式返回：首个 token 立即显示
- Debounce 75ms：减少无效请求

### 3. 容错设计
- Context Provider 超时（150ms）
- Async Manager 超时（200ms）
- 流式首 token 超时（500ms）
- 出错时优雅降级

### 4. 内存管理
- LRU 缓存限制（100 条）
- 缓冲区大小限制（10MB）
- AbortController 取消无用请求

### 5. 可扩展性
- 组件化设计（IPromptComponent, IContextProvider）
- 策略模式（IStrategyManager, IBlockTrimmer）
- 可配置（budgets, timeouts, thresholds）

## 文件结构

```
src/inlineCompletion/
├── types.ts                          # 核心类型定义
│
├── prompt/
│   ├── components.ts                 # Prompt 组件
│   ├── trimLastLine.ts               # 尾部空白处理
│   └── cascadingPromptFactory.ts     # 级联预算工厂
│
├── strategy/
│   └── strategyManager.ts            # 多行策略管理器
│
├── cache/
│   ├── radixTrie.ts                  # Radix Trie 数据结构
│   ├── completionsCache.ts           # LRU 缓存
│   ├── currentGhostText.ts           # Typing-as-Suggested
│   ├── speculativeRequestCache.ts    # 投机请求缓存
│   ├── debounce.ts                   # 防抖工具
│   └── asyncCompletionsManager.ts    # 异步请求管理
│
├── llm/
│   └── StreamedAICompletionClient.ts          # 流式 LLM 客户端
│
├── postProcess/
│   └── fullPostProcessor.ts          # 完整后处理器
│
├── context/
│   └── contextProviderRegistry.ts    # 上下文提供者
│
├── trim/
│   ├── blockTrimmerRegistry.ts       # AST 裁剪
│   ├── streamedCompletionSplitter.ts # 流式分割
│   └── multilineModel.ts             # ML 评分模型
│
├── telemetry/
│   └── fullTelemetryEmitter.ts       # 完整遥测
│
├── fullGhostTextController.ts        # 完整版控制器
├── monacoInlineCompletionsProvider.ts # Monaco API 适配
└── setup.ts                          # 初始化入口
```

## 升级路径

### 从简易版到完整版

| 简易版 | 完整版 |
|--------|--------|
| SimplePromptBuilder | CascadingPromptFactory |
| suffix: '' | suffix: FIM 内容 |
| context: [] | 多维度上下文 |
| 固定策略 | StrategyManager |
| SimpleAICompletionClient | StreamedAICompletionClient |
| 无缓存 | LRURadixTrieCache |
| 无 Typing-as-Suggested | CurrentGhostText |
| 无投机请求 | SpeculativeRequestCache |
| SimplePostProcessor | FullPostProcessor |
| Console 遥测 | FullTelemetryEmitter |

所有升级都是新增接口/方法，不修改现有签名。
