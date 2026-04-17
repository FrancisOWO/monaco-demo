/**
 * AI 智能补全功能
 * 支持单行补全、多行补全、自动触发和快捷键触发
 */

// AI 补全状态
const aiCompletionState = {
  enabled: true,              // 是否启用
  autoTrigger: true,         // 是否自动触发
  currentSuggestion: null,    // 当前建议
  loading: false,            // 是否正在加载
};

// 服务器地址
const AI_SERVER_URL = 'http://localhost:3000/ai';

/**
 * 获取编辑器内容上下文
 */
function getEditorContext(editor) {
  const model = editor.getModel();
  const position = editor.getPosition();

  // 获取当前光标位置之前的文本
  const range = new monaco.Range(1, 1, position.lineNumber, position.column);
  const context = model.getValueInRange(range);

  return {
    context: context,
    language: model.getLanguageId(),
    cursorLine: position.lineNumber,
    cursorColumn: position.column,
  };
}

/**
 * 请求单行补全
 */
async function requestSingleLineCompletion(editor) {
  if (aiCompletionState.loading || !aiCompletionState.enabled) {
    return null;
  }

  const { context, language } = getEditorContext(editor);

  try {
    aiCompletionState.loading = true;
    console.log('[AI] Requesting single-line completion...');

    const response = await fetch(`${AI_SERVER_URL}/completion`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        context,
        language,
        cursorLine: editor.getPosition().lineNumber,
        cursorColumn: editor.getPosition().column,
      }),
    });

    const data = await response.json();

    if (data.suggestions && data.suggestions.length > 0) {
      // 取置信度最高的建议
      const best = data.suggestions.reduce((a, b) => a.confidence > b.confidence ? a : b);
      aiCompletionState.currentSuggestion = best;
      aiCompletionState.loading = false;
      console.log('[AI] Got suggestion:', best.text);
      return best;
    }

    aiCompletionState.loading = false;
    return null;

  } catch (error) {
    console.error('[AI] Completion request failed:', error);
    aiCompletionState.loading = false;
    return null;
  }
}

/**
 * 显示单行补全（通过 Quick Pick）
 */
async function showSingleLineCompletion(editor) {
  const suggestion = await requestSingleLineCompletion(editor);

  if (suggestion && suggestion.text) {
    // 在光标位置插入补全文本
    const position = editor.getPosition();
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    editor.executeEdits('ai-completion', [{
      range: range,
      text: suggestion.text,
      forceMoveMarkers: true,
    }]);

    // 移动光标到合适的位置
    if (suggestion.text.includes('\n')) {
      // 多行插入后，光标会在最后，我们需要在合适的位置
    } else {
      // 单行插入，光标自动跟随
    }
  }
}

/**
 * 显示多行补全（内联显示）
 */
async function showMultiLineCompletion(editor) {
  if (aiCompletionState.loading || !aiCompletionState.enabled) {
    return;
  }

  const { context, language } = getEditorContext(editor);

  try {
    aiCompletionState.loading = true;
    console.log('[AI] Requesting multi-line completion...');

    // 使用 EventSource 进行流式请求
    const response = await fetch(
      `${AI_SERVER_URL}/inline-completion?context=${encodeURIComponent(context)}&language=${encodeURIComponent(language)}`
    );

    if (!response.ok) {
      throw new Error('Request failed');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let fullText = '';

    // 显示占位符
    const position = editor.getPosition();
    const range = new monaco.Range(
      position.lineNumber,
      position.column,
      position.lineNumber,
      position.column
    );

    editor.executeEdits('ai-completion', [{
      range: range,
      text: '正在生成...',
      forceMoveMarkers: true,
    }]);

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');

      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.substring(6));
            if (data.text) {
              fullText += data.text;
            }
            if (data.done) {
              aiCompletionState.loading = false;
              console.log('[AI] Multi-line completion done:', fullText);
              return;
            }
          } catch (e) {
            // 忽略解析错误
          }
        }
      }
    }

    aiCompletionState.loading = false;

  } catch (error) {
    console.error('[AI] Multi-line completion failed:', error);
    aiCompletionState.loading = false;

    // 移除占位符
    const model = editor.getModel();
    const content = model.getValue();
    if (content.endsWith('正在生成...')) {
      editor.executeEdits('ai-completion', [{
        range: new monaco.Range(
          1, 1,
          model.getLineCount(),
          model.getLineMaxColumn(model.getLineCount())
        ),
        text: content.replace('正在生成...', ''),
      }]);
    }
  }
}

/**
 * 注册 AI 补全提供者
 */
function registerAICompletionProvider(monaco, editor) {
  console.log('[AI] Registering AI completion provider');

  // 注册快捷键 Ctrl+Space 触发补全
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Space, () => {
    console.log('[AI] Hotkey triggered');
    showSingleLineCompletion(editor);
  });

  // 注册 Alt+Enter 多行补全
  editor.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
    console.log('[AI] Multi-line hotkey triggered');
    showMultiLineCompletion(editor);
  });

  // 自动触发补全（可选，通过配置控制）
  if (aiCompletionState.autoTrigger) {
    let debounceTimer = null;

    editor.onDidChangeModelContent(() => {
      if (!aiCompletionState.autoTrigger || aiCompletionState.loading) {
        return;
      }

      // 防抖：停止输入 500ms 后自动触发
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const context = getEditorContext(editor);
        const lastChar = context.context.slice(-1);

        // 在特定字符后触发（如点号、冒号等）
        if (['.', ':', '('].includes(lastChar)) {
          showSingleLineCompletion(editor);
        }
      }, 500);
    });
  }

  console.log('[AI] AI completion provider registered');
  console.log('[AI] - Ctrl+Space: Single-line completion');
  console.log('[AI] - Alt+Enter: Multi-line completion');
  console.log('[AI] - Auto-trigger: Enabled (on . or : or ()');
}

// 导出函数
window.registerAICompletionProvider = registerAICompletionProvider;
window.showSingleLineCompletion = showSingleLineCompletion;
window.showMultiLineCompletion = showMultiLineCompletion;
