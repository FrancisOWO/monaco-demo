/**
 * AI 代码补全服务
 * 支持单行和多行代码补全
 */

import express, { Router } from 'express';
import { config } from './config';

const router: Router = express.Router();

// AI 补全配置
interface AICompletionRequest {
  context: string;       // 当前代码上下文
  language: string;      // 编程语言
  cursorLine: number;    // 光标所在行
  cursorColumn: number;  // 光标所在列
}

interface AICompletionResponse {
  suggestions: Array<{
    text: string;        // 补全文本
    confidence: number;   // 置信度 0-1
    displayText?: string; // 显示文本（用于多行）
  }>;
  error?: string;
}

// 模拟 AI 补全（实际项目中应调用 OpenAI/Claude API）
function generateAICompletion(context: string, language: string): AICompletionResponse {
  const lines = context.split('\n');
  const lastLine = lines[lines.length - 1];

  // 简单的模式匹配来模拟 AI 补全
  const suggestions: AICompletionResponse['suggestions'] = [];

  if (language === 'python') {
    // Python 常用补全模式
    if (lastLine.trim().startsWith('def ')) {
      suggestions.push(
        { text: ':', confidence: 0.95 },
        { text: 'pass', confidence: 0.7 }
      );
    } else if (lastLine.trim().startsWith('class ')) {
      suggestions.push(
        { text: ':', confidence: 0.95 },
        { text: 'pass', confidence: 0.6 }
      );
    } else if (lastLine.endsWith('.')) {
      // 方法调用后补全
      const methodMatch = lastLine.match(/(\w+)\.\s*$/);
      if (methodMatch) {
        const obj = methodMatch[1];
        if (obj === 'os') {
          suggestions.push(
            { text: 'path', confidence: 0.9 },
            { text: 'getcwd()', confidence: 0.85 },
            { text: 'listdir()', confidence: 0.8 }
          );
        } else if (obj === 'str') {
          suggestions.push(
            { text: 'upper()', confidence: 0.9 },
            { text: 'lower()', confidence: 0.9 },
            { text: 'split()', confidence: 0.85 }
          );
        }
      }
    } else if (lastLine.trim().startsWith('import ')) {
      suggestions.push(
        { text: 'os', confidence: 0.8 },
        { text: 'sys', confidence: 0.8 },
        { text: 'json', confidence: 0.8 }
      );
    } else if (lastLine.trim() === 'if __name__ == \'__main__\':' ||
               lastLine.trim() === 'if __name__ == "__main__":') {
      suggestions.push(
        { text: '\n    main()', confidence: 0.95 },
        { text: '\n    pass', confidence: 0.5 }
      );
    } else if (lastLine.trim().startsWith('for ')) {
      suggestions.push(
        { text: ' in range():', confidence: 0.9 },
        { text: ' in :', confidence: 0.7 }
      );
    } else if (lastLine.trim().startsWith('while ')) {
      suggestions.push(
        { text: ' True:', confidence: 0.9 },
        { text: ' True:\n    pass', confidence: 0.7 }
      );
    } else if (lastLine.trim().startsWith('try:')) {
      suggestions.push(
        { text: '\n    pass\nexcept ', confidence: 0.9 }
      );
    } else if (lastLine.trim().startsWith('with ')) {
      suggestions.push(
        { text: ' open(\'\') as :', confidence: 0.9 }
      );
    } else if (lastLine.trim() === '') {
      // 空行，智能提示
      suggestions.push(
        { text: 'pass', confidence: 0.6 },
        { text: 'return', confidence: 0.6 }
      );
    }
  } else if (language === 'javascript' || language === 'typescript') {
    if (lastLine.trim().startsWith('function ')) {
      suggestions.push(
        { text: '() {\n    \n}', confidence: 0.9 }
      );
    } else if (lastLine.endsWith('.')) {
      suggestions.push(
        { text: 'then(', confidence: 0.8 },
        { text: 'catch(', confidence: 0.8 }
      );
    } else if (lastLine.trim().startsWith('const ') || lastLine.trim().startsWith('let ') || lastLine.trim().startsWith('var ')) {
      suggestions.push(
        { text: ' = ', confidence: 0.7 }
      );
    }
  } else if (language === 'cpp' || language === 'c') {
    if (lastLine.trim().startsWith('int main(')) {
      suggestions.push(
        { text: ') {\n    \n    return 0;\n}', confidence: 0.9 }
      );
    } else if (lastLine.endsWith('<<')) {
      suggestions.push(
        { text: 'std::endl', confidence: 0.9 }
      );
    } else if (lastLine.endsWith('>>')) {
      suggestions.push(
        { text: 'variable', confidence: 0.7 }
      );
    }
  } else if (language === 'go') {
    if (lastLine.trim().startsWith('func ')) {
      suggestions.push(
        { text: '() {\n    \n}', confidence: 0.9 }
      );
    } else if (lastLine.trim().startsWith('if err != nil')) {
      suggestions.push(
        { text: ' {\n    return err\n}', confidence: 0.95 }
      );
    }
  }

  // 如果没有匹配，添加通用建议
  if (suggestions.length === 0) {
    suggestions.push(
      { text: '\n    pass', confidence: 0.5 }
    );
  }

  return { suggestions };
}

// 单行补全端点
router.post('/completion', (req, res) => {
  try {
    const { context, language, cursorLine, cursorColumn }: AICompletionRequest = req.body;

    if (!context || !language) {
      res.status(400).json({ error: 'Missing context or language' });
      return;
    }

    console.log(`[AI] Completion request for ${language} at line ${cursorLine}, col ${cursorColumn}`);
    console.log(`[AI] Context: ${context.substring(0, 100)}...`);

    const result = generateAICompletion(context, language);
    res.json(result);

  } catch (error) {
    console.error('[AI] Completion error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 多行补全端点（返回流式响应）
router.get('/inline-completion', (req, res) => {
  const context = req.query.context as string;
  const language = req.query.language as string;

  if (!context || !language) {
    res.status(400).json({ error: 'Missing context or language' });
    return;
  }

  console.log(`[AI] Inline completion request for ${language}`);

  // 设置 SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // 生成多行补全
  const completion = generateMultilineCompletion(context, language);

  // 流式发送
  let index = 0;
  const interval = setInterval(() => {
    if (index < completion.length) {
      const chunk = completion.substring(0, index + 20);
      index += 20;
      res.write(`data: ${JSON.stringify({ text: completion.substring(index - 20, index), done: false })}\n\n`);
    } else {
      res.write(`data: ${JSON.stringify({ done: true, fullText: completion })}\n\n`);
      clearInterval(interval);
      res.end();
    }
  }, 50);
});

function generateMultilineCompletion(context: string, language: string): string {
  const lines = context.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  if (language === 'python') {
    if (lastLine.startsWith('def ')) {
      const funcName = lastLine.replace('def ', '').replace(':', '').split('(')[0].trim();
      return ':\n    """Docstring for ' + funcName + '"""\n    pass';
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(':', '').split('(')[0].trim();
      return ':\n    def __init__(self):\n        pass';
    } else if (lastLine.startsWith('if __name__')) {
      return ':\n    main()';
    }
  }

  return '';
}

export default router;
