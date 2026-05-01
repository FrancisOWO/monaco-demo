# 历史对话管理功能说明

## 功能概述

AI 对话面板支持历史对话管理，自动保存对话记录，支持浏览、加载和删除历史对话。

## 使用说明

### 打开历史面板

1. 点击 AI 对话面板右上角的 **📜 (历史对话)** 按钮
2. 历史面板从右侧滑入显示
3. 点击遮罩层或 **✕** 按钮可关闭面板

### 历史列表

历史面板显示所有保存的对话记录，每项显示：
- **时间**: 对话保存的时间（如 "5月1日 14:30"）
- **内容预览**: 对话中第一条消息的前 50 个字符

### 加载历史对话

1. 在历史面板中找到要加载的记录
2. 点击该记录右侧的 **📂 (加载)** 按钮
3. 确认后，该对话将加载到当前会话中

**注意**:
- 加载历史前会保存当前活跃对话
- 加载后会清空当前消息列表，替换为历史对话内容

### 删除历史记录

1. 在历史面板中找到要删除的记录
2. 点击该记录右侧的 **🗑 (删除)** 按钮
3. 确认删除后，该记录将被永久移除

### 新建对话与自动保存

点击 **✚ (新建对话)** 按钮时：
- 如果当前有活跃对话，会自动保存到历史
- 如果当前对话为空，则直接开始新对话
- 会弹出确认对话框（如果有消息）

## 数据持久化

历史对话当前保存在内存中：
- 页面刷新后历史记录会丢失（仅保留在当前会话中）
- 新对话会自动保存当前活跃对话到历史列表

## 技术实现

### 状态管理

```javascript
// chat-store.js
const chatState = {
    conversationHistory: [],  // 历史对话列表
    historyPanelVisible: false, // 历史面板可见性
};
```

### 历史项结构

```javascript
{
    id: 'history_xxx',              // 唯一标识
    timestamp: 1234567890,          // 保存时间戳
    messages: [...],                // 消息列表（深拷贝）
    contextItems: [...],            // 上下文项（深拷贝）
}
```

### 核心 API

#### `getConversationHistory()`
返回所有历史对话列表（按时间倒序）。

#### `addConversationToHistory()`
将当前对话添加到历史列表头部。
- 自动添加时间戳
- 深拷贝消息和上下文
- 触发 `onHistoryChanged` 事件

#### `loadConversationFromHistory(historyId)`
加载指定历史对话到当前会话：
- 恢复消息列表
- 恢复上下文项
- 触发 `onMessagesChanged` 和 `onContextChanged` 事件

#### `deleteConversationFromHistory(historyId)`
删除指定的历史记录。

#### `clearHistory()`
清空所有历史记录。

#### `hasActiveConversation()`
检查当前是否有活跃对话（有消息或上下文）。

#### `startNewChat()`
开始新对话：
1. 保存当前对话到历史（如果有消息）
2. 清空消息列表
3. 清空上下文项
4. 重置折叠状态

### 面板控制

#### `openHistoryPanel()` / `closeHistoryPanel()` / `toggleHistoryPanel()`
控制历史面板的显示/隐藏。

#### `isHistoryPanelVisible()`
返回面板当前是否可见。

### 事件

- `onHistoryChanged` - 历史列表变更时触发
- `onHistoryPanelVisibilityChanged` - 面板显示/隐藏时触发
- `onMessagesChanged` - 消息列表变更时触发
- `onContextChanged` - 上下文变更时触发

## 界面组件

### 历史面板 (`#chat-history-panel`)

- **遮罩层** (`.chat-history-overlay`): 点击关闭面板
- **标题栏** (`.chat-history-header`): 显示标题和关闭按钮
- **列表容器** (`#chat-history-list`): 显示历史记录列表
- **空状态** (`#chat-history-empty`): 无历史记录时显示

### 历史项 (`.chat-history-item`)

```html
<div class="chat-history-item" data-id="xxx">
    <div class="chat-history-item-info">
        <div class="chat-history-item-time">5月1日 14:30</div>
        <div class="chat-history-item-preview">对话内容预览...</div>
    </div>
    <div class="chat-history-item-actions">
        <button data-action="load" title="加载">📂</button>
        <button data-action="delete" title="删除">🗑</button>
    </div>
</div>
```

### 样式类

- `#chat-history-panel` - 历史面板容器
- `.chat-history-content` - 面板内容区
- `.chat-history-list` - 历史列表容器
- `.chat-history-item` - 单个历史项
- `.chat-history-item-time` - 时间显示
- `.chat-history-item-preview` - 内容预览
- `.chat-history-empty` - 空状态提示

## 限制与注意事项

1. **会话级存储** - 历史记录仅保存在内存中，页面刷新后丢失
2. **数量限制** - 单个历史项保存时会限制消息预览长度
3. **上下文恢复** - 加载历史时会完全替换当前上下文
4. **消息深拷贝** - 保存时使用深拷贝防止引用问题

## 未来扩展建议

1. **持久化到 localStorage** - 页面刷新后保留历史记录
2. **搜索/过滤** - 支持按关键词搜索历史对话
3. **导出/导入** - 支持导出历史为文件或从文件导入
4. **对话标题** - 支持为对话添加自定义标题
5. **时间分组** - 按日期（今天、昨天、更早）分组显示
