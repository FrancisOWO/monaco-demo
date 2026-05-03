# Ghost Text Inline Completion - 任务列表

## Phase 1: 核心骨架

### 1.1 扩展核心类型
- [x] 扩展 `CompletionSource` 枚举（Cache, TypingAsSuggested, Speculative, Async）
- [x] 扩展 `BlockMode` 枚举（Parsing, ParsingAndServer, MoreMultiline）
- [x] 新增 `BlockPositionType` 枚举
- [x] 新增 `FinishedCallback` 类型
- [x] 新增 `PromptAllocation` 接口
- [x] 新增 `MultilineDetermination` 接口
- [x] 新增 `NeighboringFileType` 枚举
- [x] 扩展 `CompletionStrategy` 接口（finishedCb, lookAhead, blockPosition）
- [x] 扩展 `PromptInfo` 接口（trailingWs, neighborSource）
- [x] 扩展 `TelemetryEvent` 接口（measurements）
- [x] 扩展 `ITelemetryEmitter` 接口（flush, startIdleDetection）
- [x] 扩展 `IAICompletionClient` 接口（requestCompletionStreaming）

### 1.2 实现 CascadingPromptFactory
- [x] 创建 `IPromptComponent` 接口
- [x] 实现 `DocumentPrefixComponent`
- [x] 实现 `DocumentSuffixComponent`
- [x] 实现 `DocumentMarkerComponent`
- [x] 实现 `TraitsComponent`
- [x] 实现 `DiagnosticsComponent`
- [x] 实现 `CodeSnippetsComponent`
- [x] 实现 `SimilarFilesComponent`
- [x] 实现 `RecentEditsComponent`
- [x] 实现 `trimLastLine` 工具函数
- [x] 实现级联预算分配逻辑
- [x] 实现 Suffix 编辑距离缓存匹配

### 1.3 实现 StrategyManager
- [x] 创建 `IStrategyManager` 接口
- [x] 实现文件长度限制（8000 行）
- [x] 实现 BlockMode 配置
- [x] 实现新行检测（TypeScript）
- [x] 实现 AST 空块检测
- [x] 实现 `DefaultMultilineModel` ML 评分
- [x] 实现接受后强制多行策略
- [x] 实现 `takeNLines` 函数

### 1.4 扩展 PostProcessor
- [x] 实现重复检测（isRepetitive）
- [x] 实现 `maybeSnipCompletion`
- [x] 实现 `forceSingleLine`
- [x] 集成 `BlockTrimmerRegistry`

## Phase 2: 缓存与速度优化

### 2.1 实现 CompletionsCache
- [x] 实现 `RadixTrie` 数据结构
- [x] 实现 `LRURadixTrieCache`
- [x] 实现前缀匹配查找
- [x] 实现 LRU 淘汰策略

### 2.2 实现 CurrentGhostText
- [x] 创建 `ICurrentGhostText` 接口
- [x] 实现 `setCurrent`
- [x] 实现 `getCompletionsForUserTyping`
- [x] 实现 `hasAcceptedCurrentCompletion`
- [x] 实现 `getCurrent`

### 2.3 实现 SpeculativeRequestCache
- [x] 创建 `ISpeculativeRequestCache` 接口
- [x] 实现 `set` 方法（预计算）
- [x] 实现 `request` 方法（执行投机请求）
- [x] 实现后台缓存

### 2.4 实现 Debounce & AsyncManager
- [x] 实现 `debounce` 函数
- [x] 实现 `debounceCancellable` 函数
- [x] 创建 `IAsyncCompletionsManager` 接口
- [x] 实现请求复用逻辑
- [x] 实现超时处理

### 2.5 升级 StandardAICompletionClient
- [x] 实现 `requestCompletionStreaming`
- [x] 实现首个 token 快速返回
- [x] 实现后台缓存后续结果
- [x] 支持 SSE 流式解析

## Phase 3: 上下文与多行支持

### 3.1 实现上下文提供者
- [x] 创建 `IContextProvider` 接口
- [x] 实现 `ContextProviderRegistry`
- [x] 实现 `TraitsProvider`
- [x] 实现 `CodeSnippetsProvider`
- [x] 实现 `DiagnosticsProvider`
- [x] 实现 `SimilarFilesProvider`
- [x] 实现 `RecentEditsProvider`
- [x] 实现超时处理

### 3.2 实现 BlockTrimmerRegistry
- [x] 创建 `IBlockTrimmer` 接口
- [x] 实现 `HeuristicBlockTrimmer`
- [x] 实现块位置类型检测
- [x] 实现空块起始检测
- [x] 实现 `parsingBlockFinished` 回调
- [x] 实现 `verboseTrim`
- [x] 实现 `terseTrim`

### 3.3 实现 StreamedCompletionSplitter
- [x] 实现 MoreMultiline 流式分割
- [x] 实现首次分割作为单行返回
- [x] 实现后续分割缓存
- [x] 集成 `TerseBlockTrimmer`

### 3.4 实现 MultilineModel
- [x] 创建 `IMultilineModel` 接口
- [x] 实现 JavaScript/TypeScript 模式匹配
- [x] 实现 Python 模式匹配
- [x] 实现缩进变化检测
- [x] 实现未闭合括号检测

## Phase 4: 遥测与集成

### 4.1 升级 TelemetryEmitter
- [x] 实现 `FullTelemetryEmitter`
- [x] 实现批量发送
- [x] 实现 idle 检测
- [x] 实现队列大小限制
- [x] 实现 `CountingTelemetryEmitter`（测试用）

### 4.2 集成所有组件
- [x] 实现 `FullGhostTextController`
- [x] 整合所有 Phase 1-3 组件
- [x] 实现完整的编排流程
- [x] 实现遥测事件发射
- [x] 更新模块导出文件

## 测试任务

- [x] 编写 Phase 1 组件测试
- [x] 编写 Phase 2 缓存测试
- [x] 编写 Phase 3 上下文测试
- [x] 编写 Phase 4 遥测测试
- [x] 运行所有测试并通过

## 文档任务

- [ ] 编写实现流程文档
- [ ] 编写架构说明文档
- [ ] 编写踩坑记录 S01-S05
- [x] 更新计划文件

## 已完成统计

- 核心类型扩展: 11/11 ✅
- Phase 1 组件: 4/4 ✅
- Phase 2 组件: 5/5 ✅
- Phase 3 组件: 4/4 ✅
- Phase 4 组件: 2/2 ✅
- 测试: 36/36 通过 ✅
