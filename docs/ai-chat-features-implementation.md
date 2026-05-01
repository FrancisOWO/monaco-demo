# AI 对话面板新功能实现文档

## 功能概览

本次实现了 AI 对话面板的三个核心功能：

1. **设置功能** - 多组 API 配置管理
2. **新建对话功能** - 快速开始新对话并自动保存历史
3. **历史对话功能** - 对话历史浏览、加载和管理

## 架构设计

### 状态管理

采用发布-订阅模式，通过 `chat-store.js` 集中管理状态。

```
chatState
├── mode (ask/plan/agent)
├── messages[]
├── contextItems[]
├── foldState
├── settings ← 账户设置（已移除，改为 apiConfigs）
├── apiConfigs[] ← 新增：多组 API 配置
├── currentConfigId ← 新增：当前配置 ID
├── conversationHistory[] ← 新增：对话历史
└── ...其他状态
```

### 事件系统

```javascript
// 新增事件
onSettingsChanged              // 设置变更
onSettingsPanelVisibilityChanged // 面板显示/隐藏
onCurrentConfigChanged         // 当前配置切换
onHistoryChanged               // 历史列表变更
onHistoryPanelVisibilityChanged // 历史面板显示/隐藏
```

## 功能 1：多组 API 配置管理

### 实现要点

#### 1.1 状态结构

```javascript
// 配置对象
{
    id: 'config_xxx',      // 唯一标识
    name: '显示名称',       // 如 "OpenAI"
    baseUrl: 'https://...', // API 地址
    apiKey: 'sk-xxx',      // API 密钥
    isBuiltIn: false,      // 是否为内置配置
}

// 内置 Dummy 配置
{
    id: 'dummy',
    name: 'Dummy (本地测试)',
    baseUrl: '',
    apiKey: '',
    isBuiltIn: true,
}
```

#### 1.2 核心函数

```javascript
// 配置管理
getApiConfigs()              // 获取所有配置
getApiConfigById(id)         // 根据 ID 获取配置
getCurrentApiConfig()        // 获取当前配置
addApiConfig(config)         // 添加配置
updateApiConfig(id, updates) // 更新配置
deleteApiConfig(id)          // 删除配置
setCurrentConfigId(id)       // 切换配置

// 验证与持久化
validateApiConfig(config)    // 验证配置
saveSettingsToStorage()      // 保存到 localStorage
loadSettingsFromStorage()    // 从 localStorage 加载
```

#### 1.3 持久化格式

```json
{
    "configs": [
        { "id": "xxx", "name": "...", "baseUrl": "...", "apiKey": "..." }
    ],
    "currentConfigId": "xxx"
}
```

**注意**: 只保存自定义配置，不保存内置的 Dummy 配置。

#### 1.4 UI 交互流程

```
打开设置面板
    ↓
渲染配置列表下拉框
    ↓
根据当前配置显示详情
    ↓
用户操作：
    ├── 切换配置 → setCurrentConfigId()
    ├── 添加配置 → addApiConfig() + 切换到新配置
    ├── 删除配置 → deleteApiConfig() → 自动切换到 Dummy
    └── 保存配置 → validateApiConfig() → updateApiConfig() → saveSettingsToStorage()
```

#### 1.5 特殊处理

- **Dummy 配置**: 内置、不可编辑、不可删除、选择时禁用表单
- **删除当前配置**: 自动切换到 Dummy 配置
- **验证**: name 不能为空，baseUrl 必须是有效 URL
- **空值处理**: baseUrl 和 apiKey 可为空字符串

### 文件变更

| 文件 | 变更内容 |
|------|----------|
| `chat-store.js` | 添加 apiConfigs、currentConfigId 状态；实现配置管理函数 |
| `chat-panel.js` | 重写 setupSettingsPanel() 支持多配置 |
| `index.html` | 添加配置选择器、表单、Dummy 说明区域 |
| `chat-panel.css` | 添加多配置样式 |

### 测试覆盖

```javascript
// chat-settings.test.ts
- 初始状态（包含 Dummy）
- addApiConfig（添加、自动生成 ID）
- updateApiConfig（更新、忽略不存在）
- deleteApiConfig（删除、不能删内置、切换当前配置）
- getApiConfigById
- setCurrentConfigId（切换、触发事件）
- getCurrentApiConfig
- localStorage 持久化
- 验证（name、baseUrl）
```

## 功能 2：新建对话

### 实现要点

#### 2.1 核心函数

```javascript
hasActiveConversation()    // 检查是否有活跃对话
startNewChat()          // 开始新对话
```

#### 2.2 新对话流程

```
点击新建对话按钮
    ↓
hasActiveConversation() ?
    ├── 是 → confirm("确定要开始新对话吗？")
    │           ↓
    │           用户确认 → startNewChat()
    │           用户取消 → 无操作
    │
    └── 否 → startNewChat()
                ↓
                1. 保存当前对话到历史
                2. 清空消息列表
                3. 清空上下文
                4. 重置折叠状态
```

#### 2.3 自动保存机制

```javascript
function startNewChat() {
    // 如果有消息，保存到历史
    if (chatState.messages.length > 0) {
        saveCurrentConversationToHistory();
    }
    // ...清空操作
}

function saveCurrentConversationToHistory() {
    const historyItem = {
        id: generateId(),
        timestamp: Date.now(),
        messages: JSON.parse(JSON.stringify(chatState.messages)),
        contextItems: JSON.parse(JSON.stringify(chatState.contextItems)),
    };
    chatState.conversationHistory.unshift(historyItem);
}
```

### 文件变更

| 文件 | 变更内容 |
|------|----------|
| `chat-store.js` | 添加 hasActiveConversation, startNewChat |
| `chat-panel.js` | 绑定新建对话按钮事件，处理确认对话框 |

### 测试覆盖

```javascript
// chat-new-conversation.test.ts
- startNewChat（清空消息、上下文、折叠状态）
- startNewChat（触发事件）
- hasActiveConversation（消息、上下文）
- 自动保存到历史
```

## 功能 3：历史对话管理

### 实现要点

#### 3.1 历史项结构

```javascript
{
    id: 'history_xxx',
    timestamp: 1234567890,
    messages: [...],      // 深拷贝的消息
    contextItems: [...],  // 深拷贝的上下文
}
```

#### 3.2 核心函数

```javascript
// 历史管理
getConversationHistory()           // 获取历史列表
addConversationToHistory()         // 添加当前对话到历史
loadConversationFromHistory(id)    // 加载历史到当前对话
deleteConversationFromHistory(id)  // 删除历史项
clearHistory()                     // 清空历史

// 面板控制
openHistoryPanel() / closeHistoryPanel() / toggleHistoryPanel()
isHistoryPanelVisible()
```

#### 3.3 历史面板交互流程

```
点击历史按钮
    ↓
openHistoryPanel()
    ↓
渲染历史列表
    ├── 有历史 → 显示列表项
    └── 无历史 → 显示空状态

历史项操作：
    ├── 点击 "📂 加载"
    │       ↓
    │       hasActiveConversation() ?
    │           ├── 是 → addConversationToHistory() 保存当前
    │           └── 否 → 直接加载
    │       loadConversationFromHistory(id) 恢复消息和上下文
    │       closeHistoryPanel()
    │
    └── 点击 "🗑 删除"
            ↓
            confirm("确定删除？")
            deleteConversationFromHistory(id)
```

#### 3.4 渲染函数

```javascript
function renderHistoryList() {
    history.forEach(item => {
        // 格式化时间
        const timeStr = new Date(item.timestamp).toLocaleString('zh-CN');
        // 生成预览（第一条消息前50字符）
        const preview = item.messages[0]?.parts[0]?.text.slice(0, 50);
        // 渲染 HTML
    });
}
```

### 文件变更

| 文件 | 变更内容 |
|------|----------|
| `chat-store.js` | 添加 conversationHistory、historyPanelVisible；实现历史管理函数 |
| `chat-panel.js` | 实现 setupHistoryPanel()，包含渲染和事件处理 |
| `index.html` | 添加历史面板 HTML 结构 |
| `chat-panel.css` | 添加历史面板样式 |

### 测试覆盖

```javascript
// chat-history.test.ts
- addConversationToHistory（添加、时间戳、上下文）
- loadConversationFromHistory（加载、恢复上下文、触发事件、不存在）
- deleteConversationFromHistory（删除、不影响其他、内置保护）
- clearHistory
- 面板可见性控制
```

## UI 组件说明

### Header 按钮布局

```
#chat-header
├── #chat-title (AI 对话)
└── #chat-header-buttons
    ├── #chat-history-btn (📜 历史)
    ├── #chat-settings-btn (⚙ 设置)
    ├── #chat-new-btn (✚ 新建)
    └── #chat-close-btn (✕ 关闭)
```

### 设置面板结构

```
#chat-settings-modal
├── .chat-modal-overlay (遮罩)
└── .chat-modal-content
    ├── .chat-modal-header (标题 + 关闭按钮)
    ├── .chat-modal-body
    │   ├── 配置选择器 (#chat-config-select + 添加/删除按钮)
    │   ├── 配置详情表单 (name/baseUrl/apiKey)
    │   └── Dummy 说明 (选中 Dummy 时显示)
    └── .chat-modal-footer (取消/保存按钮)
```

### 历史面板结构

```
#chat-history-panel
├── .chat-history-overlay (遮罩，点击关闭)
└── .chat-history-content (右侧滑出)
    ├── .chat-history-header (标题 + 关闭按钮)
    ├── .chat-history-body
    │   ├── #chat-history-list (历史项列表)
    │   └── #chat-history-empty (空状态提示)
```

## 样式系统

### CSS 类命名规范

- 组件前缀: `chat-`
- 状态类: `.hidden`, `.disabled`, `.visible`
- 深色主题: `body[data-theme="dark"]` 前缀

### 关键样式

```css
/* 配置选择器 */
.chat-config-selector { display: flex; gap: 8px; }
.chat-config-btn { ... }
.chat-config-btn-danger { color: #d32f2f; }

/* 历史项 */
.chat-history-item { display: flex; padding: 12px; ... }
.chat-history-item:hover { background: #e8f4fd; }

/* 禁用状态 */
#chat-config-form-section.disabled { opacity: 0.5; pointer-events: none; }
```

## 事件绑定说明

### 设置面板事件

```javascript
// 面板可见性
onSettingsPanelVisibilityChanged → 渲染配置列表/加载表单

// 配置操作
configSelect.change → setCurrentConfigId() → loadConfigToForm()
addConfigBtn.click → addApiConfig() → renderConfigSelect()
deleteConfigBtn.click → confirm → deleteApiConfig() → renderConfigSelect()
saveBtn.click → validateApiConfig() → updateApiConfig() → saveSettingsToStorage()
```

### 历史面板事件

```javascript
// 面板可见性
onHistoryPanelVisibilityChanged → renderHistoryList()
onHistoryChanged → 若面板可见则重新渲染

// 历史操作
loadBtn.click → 确认 → addConversationToHistory() → loadConversationFromHistory()
deleteBtn.click → confirm → deleteConversationFromHistory()
```

## 数据流图

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   UI 事件   │────→│ chat-store  │────→│  持久化    │
│  (点击等)   │     │ (状态管理)   │     │(localStorage)│
└─────────────┘     └─────────────┘     └─────────────┘
        ↑                    ↓
        └──────────┐   ┌────┘
                   ↓   ↓
              ┌─────────────┐
              │   事件触发   │
              │ onXxxChanged│
              └─────────────┘
                   ↓
              ┌─────────────┐
              │  UI 更新    │
              │ renderXxx() │
              └─────────────┘
```

## 注意事项

1. **深拷贝**: 保存到历史时使用 `JSON.parse(JSON.stringify(...))` 深拷贝，防止引用问题
2. **内置保护**: Dummy 配置标记为 `isBuiltIn: true`，禁止编辑和删除
3. **配置验证**: 添加/保存配置时验证 name 和 baseUrl 格式
4. **当前配置切换**: 删除当前配置时自动切换到 Dummy
5. **面板互斥**: 设置面板和历史面板独立，可同时打开

## 测试汇总

| 测试文件 | 测试数 | 覆盖功能 |
|----------|--------|----------|
| chat-settings.test.ts | 32 | API 配置管理 |
| chat-new-conversation.test.ts | 11 | 新建对话 |
| chat-history.test.ts | 18 | 历史对话管理 |
| **总计** | **61** | 新功能全部覆盖 |

完整测试套件：238 个测试全部通过
