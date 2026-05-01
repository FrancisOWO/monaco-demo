# API 设置功能说明

## 功能概述

AI 对话面板支持多组 API 配置管理，允许用户添加、编辑、删除和切换不同的 LLM API 配置。内置 `Dummy` 配置用于本地测试。

## 使用说明

### 打开设置面板

1. 点击 AI 对话面板右上角的 **⚙ (设置)** 按钮
2. 设置面板将以模态框形式居中显示

### 配置管理

#### 选择配置

- 从下拉框中选择要使用的配置
- 切换配置后会立即生效，用于后续的 AI 对话

#### 添加新配置

1. 点击 **+ (添加)** 按钮
2. 输入配置名称（如 "OpenAI"、"Claude" 等）
3. 填写 Base URL 和 API Key
4. 点击 **保存** 按钮

#### 编辑配置

1. 从下拉框选择要编辑的配置
2. 修改名称、Base URL 或 API Key
3. 点击 **保存** 按钮

#### 删除配置

1. 从下拉框选择要删除的配置
2. 点击 **删除** 按钮
3. 确认删除后，该配置将被移除
4. 删除当前使用的配置会自动切换到 `Dummy` 配置

### Dummy 配置

`Dummy` 是内置的默认配置，用于本地测试：
- 使用模拟响应，无需填写 API 信息
- 不可编辑、不可删除
- 选择 Dummy 配置时，配置表单会自动禁用

### 配置字段说明

| 字段 | 说明 | 示例 |
|------|------|------|
| 配置名称 | 配置的显示名称 | OpenAI、Claude、本地模型 |
| Base URL | LLM API 的基础 URL | https://api.openai.com/v1 |
| API Key | API 密钥 | sk-xxx... |

## 数据持久化

所有配置自动保存到浏览器的 `localStorage`：
- 键名: `ai_chat_settings`
- 格式: JSON
- 包含: 自定义配置列表、当前选中的配置 ID

## 技术实现

### 状态管理

```javascript
// chat-store.js
const chatState = {
    apiConfigs: [],        // API 配置列表
    currentConfigId: '',   // 当前选中的配置 ID
};
```

### 配置对象结构

```javascript
{
    id: 'config_xxx',           // 唯一标识
    name: '配置名称',           // 显示名称
    baseUrl: 'https://...',     // API 基础 URL
    apiKey: 'sk-xxx',          // API 密钥
    isBuiltIn: false,          // 是否为内置配置
}
```

### 核心 API

#### `getApiConfigs()`
返回所有配置列表（包括 Dummy）。

#### `getApiConfigById(id)`
根据 ID 获取指定配置。

#### `getCurrentApiConfig()`
获取当前使用的配置。

#### `getCurrentConfigId()`
获取当前配置的 ID。

#### `addApiConfig({ name, baseUrl, apiKey })`
添加新配置，返回新配置的 ID。

#### `updateApiConfig(id, updates)`
更新指定配置的字段。

#### `deleteApiConfig(id)`
删除配置（内置配置不可删除）。

#### `setCurrentConfigId(id)`
切换到指定配置。

#### `validateApiConfig(config)`
验证配置数据：
- `name` 不能为空
- `baseUrl` 必须是有效的 URL 格式

#### `saveSettingsToStorage()` / `loadSettingsFromStorage()`
持久化配置到 localStorage。

### 事件

- `onSettingsChanged` - 配置列表变更时触发
- `onCurrentConfigChanged` - 当前配置切换时触发
- `onSettingsPanelVisibilityChanged` - 面板显示/隐藏时触发

## 界面组件

### 设置面板 (`#chat-settings-modal`)

- **配置选择器** (`#chat-config-select`): 下拉选择当前配置
- **添加按钮** (`#chat-config-add`): 添加新配置
- **删除按钮** (`#chat-config-delete`): 删除当前配置（内置配置禁用）
- **配置名称输入** (`#chat-config-name`): 配置显示名称
- **Base URL 输入** (`#chat-config-baseurl`): API 地址
- **API Key 输入** (`#chat-config-apikey`): 密钥（密码输入框）
- **Dummy 信息** (`#chat-dummy-info`): Dummy 配置说明

### 样式类

- `.chat-config-selector` - 配置选择区域
- `.chat-config-btn` - 配置操作按钮
- `.chat-config-btn-danger` - 删除按钮样式
- `.chat-settings-section` - 设置分区块
- `.chat-settings-info` - 信息提示框
- `.disabled` - 禁用状态

## 注意事项

1. **API Key 安全** - API Key 存储在浏览器本地，请注意安全
2. **配置数量限制** - 无硬性限制，但建议控制在合理范围内
3. **Base URL 验证** - 支持 http/https 协议的标准 URL 格式
4. **空配置处理** - Base URL 和 API Key 可为空，方便测试环境使用
