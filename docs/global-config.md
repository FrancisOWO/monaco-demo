# 全局配置目录

## 功能概述

Monaco Editor Demo 支持将配置、API 设置、对话历史等数据存储在用户目录中，而不是项目目录。这确保了：

1. **数据持久性** - 项目更新或重新安装不会丢失用户配置
2. **多项目共享** - 同一用户的多份项目实例可以共享配置
3. **权限安全** - 无需在项目目录中写入文件

## 配置目录位置

### 默认位置

配置默认存储在用户主目录下的 `.monaco-demo` 文件夹中：

- **Windows**: `%USERPROFILE%\.monaco-demo\` (如 `C:\Users\Username\.monaco-demo\`)
- **macOS/Linux**: `~/.monaco-demo/`

### 自定义位置

可以通过设置环境变量 `MY_MONACO_PATH` 来自定义配置目录位置：

```bash
# Windows
set MY_MONACO_PATH=D:\MyConfig\monaco-demo

# macOS/Linux
export MY_MONACO_PATH=/path/to/my/config
```

## 配置文件

配置目录中包含以下文件：

| 文件 | 说明 | 格式 |
|------|------|------|
| `api-configs.json` | API 配置列表（多组 LLM API 配置） | JSON |
| `conversation-history.json` | 对话历史记录 | JSON |
| `settings.json` | 其他通用设置 | JSON |

### api-configs.json 示例

```json
{
  "configs": [
    {
      "id": "config_1234567890_abc123",
      "name": "OpenAI",
      "baseUrl": "https://api.openai.com/v1",
      "apiKey": "sk-xxxxxxxxxxxxxxxx"
    },
    {
      "id": "config_1234567890_def456",
      "name": "本地模型",
      "baseUrl": "http://localhost:8000/v1",
      "apiKey": ""
    }
  ],
  "currentConfigId": "config_1234567890_abc123"
}
```

**注意**: 内置的 `Dummy` 配置不会保存到文件中，它始终由系统默认提供。

### conversation-history.json 示例

```json
{
  "history": [
    {
      "id": "msg_1234567890_ghi789",
      "timestamp": 1714501234567,
      "messages": [
        {
          "id": "msg_xxx",
          "role": "user",
          "parts": [{ "type": "output", "text": "你好" }],
          "timestamp": 1714501234000
        }
      ],
      "contextItems": []
    }
  ]
}
```

### settings.json 示例

```json
{
  "theme": "dark",
  "fontSize": 14,
  "otherSettings": "..."
}
```

## 技术实现

### 服务端实现

#### config-manager.ts

配置管理模块，处理文件读写：

```typescript
// 获取配置目录
const configDir = configManager.getConfigDir();

// 确保目录存在
configManager.ensureConfigDir();

// 读取 API 配置
const apiConfigs = configManager.apiConfigs.read();

// 保存 API 配置
configManager.apiConfigs.write({ configs, currentConfigId });

// 读取对话历史
const history = configManager.conversationHistory.read();

// 保存对话历史
configManager.conversationHistory.write({ history });
```

#### config-api.ts

HTTP API 端点，前端通过 REST API 访问配置：

| 端点 | 方法 | 说明 |
|------|------|------|
| `/config/info` | GET | 获取配置目录信息 |
| `/config/api-configs` | GET | 获取 API 配置 |
| `/config/api-configs` | POST | 保存 API 配置 |
| `/config/conversation-history` | GET | 获取对话历史 |
| `/config/conversation-history` | POST | 保存对话历史 |
| `/config/conversation-history` | DELETE | 清空对话历史 |
| `/config/settings` | GET | 获取通用设置 |
| `/config/settings` | POST | 保存通用设置 |

### 前端实现

#### config-service.js

前端服务，封装 API 调用：

```javascript
// 获取配置目录信息
const info = await configService.getConfigInfo();

// API 配置操作
const apiConfigs = await configService.apiConfigs.get();
await configService.apiConfigs.save({ configs, currentConfigId });

// 对话历史操作
const history = await configService.conversationHistory.get();
await configService.conversationHistory.save({ history });
await configService.conversationHistory.clear();

// 通用设置操作
const settings = await configService.settings.get();
await configService.settings.save(settings);
```

#### chat-store.js

状态管理模块，使用异步 API 替代 localStorage：

```javascript
// 异步加载设置
await chatStore.loadSettingsFromStorage();

// 异步保存设置
await chatStore.saveSettingsToStorage();

// 异步加载对话历史
await chatStore.loadConversationHistoryFromStorage();

// 异步保存对话历史
await chatStore.saveConversationHistoryToStorage();
```

## 迁移说明

### 从 localStorage 迁移

之前配置存储在浏览器 localStorage 中，现在已迁移到文件系统存储。旧数据不会自动迁移，需要重新配置。

### 升级步骤

1. 启动服务端 (`npm run server:start`)
2. 打开浏览器访问应用
3. 重新配置 API 设置
4. 对话历史会自动保存到新位置

## 环境变量

| 变量名 | 说明 | 默认值 |
|--------|------|--------|
| `MY_MONACO_PATH` | 配置目录路径 | `~/.monaco-demo` |
| `PORT` | 服务端口号 | `3000` |

## 常见问题

### Q: 配置目录不存在怎么办？

A: 系统会自动创建配置目录，无需手动操作。

### Q: 如何备份配置？

A: 直接复制配置目录即可：

```bash
# 备份
cp -r ~/.monaco-demo ~/.monaco-demo.backup

# 恢复
cp -r ~/.monaco-demo.backup ~/.monaco-demo
```

### Q: 配置目录权限问题？

A: 确保当前用户有权限写入用户主目录。如果遇到权限问题，可以设置 `MY_MONACO_PATH` 指向有权限的目录。

### Q: 多个项目实例如何共享配置？

A: 默认情况下，同一用户的所有项目实例都使用相同的配置目录（`~/.monaco-demo`），配置会自动共享。

### Q: 如何完全重置配置？

A: 删除配置目录即可：

```bash
rm -rf ~/.monaco-demo
```

下次启动时会自动创建新的默认配置。
