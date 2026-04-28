# 菜单栏功能优先级与实现计划

本文档盘点当前 Monaco Editor 项目菜单栏功能状态，并记录本轮已实现的基础常用功能。

## 优先级表

| 优先级 | 菜单功能 | 当前状态 | 计划 |
|---|---|---|---|
| P0 | 新建文件、打开文件、保存、关闭编辑器 | 已实现 | 保持菜单和快捷键共用同一套 `handleAction`，避免行为分叉。 |
| P0 | `Ctrl+N`、`Ctrl+O`、`Ctrl+S`、`Ctrl+W` | 已实现 | 拦截浏览器默认行为，转为编辑器操作。 |
| P0 | 查找、替换、全选 | 已实现 | 通过 Monaco 内置 action 执行：`actions.find`、`editor.action.startFindReplaceAction`、`editor.action.selectAll`。 |
| P1 | 撤销、恢复、剪切、复制、粘贴 | 已实现 | 通过 Monaco 内置 action 执行，保留浏览器剪贴板权限模型。 |
| P1 | 选择扩展/收缩、复制行、移动行 | 已实现 | 通过 Monaco 内置 selection/line action 执行。 |
| P1 | 另存为、全部保存 | 已实现 | `saveActiveFileAs` 会替换当前 descriptor；`saveAllFiles` 会保存 dirty 文件并恢复原 active file。 |
| P1 | 资源管理器显示/隐藏、缩放、主题、语言模式 | 已实现 | 增加快捷键入口和状态栏语言选择入口。 |
| P2 | 打开文件夹 | 已实现 | 受浏览器 File System Access API 限制，仅 Chrome/Edge 等支持。 |
| P2 | 打开最近 | 未实现 | 需要最近文件持久化、权限 handle 恢复和 UI 列表。 |
| P2 | 命令面板 | 未实现 | 需要命令注册表、搜索面板和键盘导航。 |
| P3 | 新建窗口、关闭窗口 | 暂缓 | 浏览器单页应用无法等价实现桌面窗口管理。 |
| P3 | 关闭所有编辑器、关闭其他编辑器 | 未实现 | 需要更完整的 dirty file 批量确认流程。 |

## 本轮实现范围

本轮优先实现基础、高频、低耦合功能：

- 文件：`open-file`、`save-as`、`save-all`。
- 编辑：`undo`、`redo`、`cut`、`copy`、`paste`、`find`、`replace`。
- 选择：`select-all`、`expand-selection`、`shrink-selection`、`copy-line-up/down`、`move-line-up/down`。
- 视图：`explorer`、`zoom-in`、`zoom-out`、`language-select`。
- 快捷键：文件、编辑、选择、视图高频命令统一拦截并路由到 `handleAction`。

## 快捷键

| 快捷键 | 功能 |
|---|---|
| `Ctrl+N` | 新建文件 |
| `Ctrl+O` | 打开文件 |
| `Ctrl+S` | 保存 |
| `Ctrl+Shift+S` | 另存为 |
| `Ctrl+W` | 关闭编辑器 |
| `Ctrl+Z` | 撤销 |
| `Ctrl+Y` / `Ctrl+Shift+Z` | 恢复 |
| `Ctrl+X` | 剪切 |
| `Ctrl+C` | 复制 |
| `Ctrl+V` | 粘贴 |
| `Ctrl+F` | 查找 |
| `Ctrl+H` | 替换 |
| `Ctrl+A` | 全选 |
| `Ctrl+Shift+Right` | 展开选择 |
| `Ctrl+Shift+Left` | 收缩选择 |
| `Alt+Up` / `Alt+Down` | 向上/向下复制行 |
| `Shift+Alt+Up` / `Shift+Alt+Down` | 向上/向下移动行 |
| `Ctrl+B` | 显示/隐藏资源管理器 |
| `Ctrl+=` / `Ctrl+-` | 放大/缩小编辑器字号 |
| `Ctrl+Shift+L` | 语言模式 |

## 后续计划

1. 实现 command registry，为命令面板、快捷键和菜单提供统一元数据。
2. 实现命令面板 UI，支持搜索、键盘选择和执行命令。
3. 实现最近文件列表，处理 File System Access API 权限恢复失败的降级提示。
4. 实现批量关闭/保存流程，包括 dirty file 的批量确认对话框。
5. 增加 Playwright 级别的浏览器交互测试，覆盖真实键盘事件和 Monaco action 行为。
