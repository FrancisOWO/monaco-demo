/**
 * AI 代码补全服务
 * 支持单行和多行代码补全
 */

import express, { Router } from 'express';
import { config } from './config';

const router: Router = express.Router();

// 测试模式开关（设为 true 则使用本地模拟，无需 API）
const TEST_MODE = true;

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

    let result;
    if (TEST_MODE) {
      // 测试模式：返回固定补全
      result = generateTestCompletion(context, language);
    } else {
      result = generateAICompletion(context, language);
    }
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
  let completion;
  if (TEST_MODE) {
    completion = generateTestMultilineCompletion(context, language);
  } else {
    completion = generateMultilineCompletion(context, language);
  }

  if (!completion) {
    res.json({ error: 'No multiline completion available for this context' });
    return;
  }

  // 流式发送（每次发送一小段，模拟打字效果）
  const chunks = completion.split('');
  let index = 0;

  const sendChunk = () => {
    if (index < chunks.length) {
      const text = chunks.slice(0, index + 3).join(''); // 每次3个字符
      index += 3;
      res.write(`data: ${JSON.stringify({ text: chunks.slice(index - 3, index).join(''), done: false, progress: Math.round(index / chunks.length * 100) })}\n\n`);
      setTimeout(sendChunk, 30); // 30ms 间隔，模拟打字
    } else {
      res.write(`data: ${JSON.stringify({ done: true, fullText: completion, confidence: 0.85 })}\n\n`);
      res.end();
    }
  };

  sendChunk();
});

function generateMultilineCompletion(context: string, language: string): string {
  const lines = context.split('\n');
  const lastLine = lines[lines.length - 1].trim();
  const secondLastLine = lines.length > 1 ? lines[lines.length - 2].trim() : '';

  if (language === 'python') {
    // Python 多行补全模板
    if (lastLine.startsWith('def ')) {
      const funcName = lastLine.replace('def ', '').replace(':', '').split('(')[0].trim();
      return `:\n    """\n    ${funcName} 函数的文档字符串\n\n    Args:\n        param1: 第一个参数\n        param2: 第二个参数\n\n    Returns:\n        返回值说明\n    """\n    pass`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(':', '').split('(')[0].trim();
      return `:\n    def __init__(self${lastLine.includes('(') ? lastLine.match(/\((.*)\)/)?.[1] || '' : ''}):\n        """初始化方法"""\n        super().__init__()\n        self._init()\n\n    def _init(self):\n        """子类初始化逻辑"""\n        pass`;
    } else if (lastLine.startsWith('if ') && lastLine.endsWith(':')) {
      // if 语句后补全
      return `\n    ${secondLastLine ? '# 判断条件' : 'pass'}\nelif `;
    } else if (lastLine.startsWith('try:')) {
      return `\n    pass\nexcept ${secondLastLine || 'Exception'} as e:\n    print(f"Error: {e}")\n    raise`;
    } else if (lastLine.startsWith('with ')) {
      return `:\n    pass`;
    } else if (lastLine.startsWith('for ')) {
      return ` in ${lastLine.includes('range') ? 'range(10)' : 'items'}:\n    pass`;
    } else if (lastLine.startsWith('while ')) {
      return `:\n    pass`;
    }
  } else if (language === 'javascript' || language === 'typescript') {
    if (lastLine.startsWith('function ') || lastLine.startsWith('async function ')) {
      const funcName = lastLine.replace(/^(async\s+)?function\s*/, '').replace(/\(.*/, '').trim() || 'myFunction';
      return `(${lastLine.includes('async') ? '' : ''}) {\n    /**\n     * @description ${funcName} 函数\n     * @param {*} params 参数\n     * @returns {Promise<*>}\n     */\n    return await Promise.resolve();\n}`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(/ extends .*/, '').trim();
      const extendsClass = lastLine.includes('extends') ? lastLine.match(/extends (\w+)/)?.[1] || '' : '';
      return ` {\n    constructor(${extendsClass ? '' : ''}) {\n        ${extendsClass ? `super(${extendsClass ? '' : ''});` : ''}\n    }\n\n    /**\n     * @description 初始化方法\n     */\n    init() {\n        // TODO: implement\n    }\n}`;
    } else if (lastLine.endsWith('=>')) {
      return ` {\n    return ;\n}`;
    }
  } else if (language === 'cpp' || language === 'c') {
    if (lastLine.startsWith('int main(') || lastLine.startsWith('void main(')) {
      return `) {\n    // TODO: implement\n    return 0;\n}`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(/ :.*/, '').trim();
      return ` {\npublic:\n    ${className}();\n    ~${className}();\n\nprivate:\n    // TODO: add members\n};`;
    } else if (lastLine.startsWith('struct ')) {
      const structName = lastLine.replace('struct ', '').replace(/ {.*/, '').trim();
      return ` {\n    // TODO: add members\n};`;
    }
  } else if (language === 'go') {
    if (lastLine.startsWith('func ')) {
      const isMethod = lastLine.includes('(');
      if (isMethod) {
        const match = lastLine.match(/func\s*\((\w+)\s+\*?(\w+)\)\s*(\w+)/);
        if (match) {
          const receiver = match[1];
          const typeName = match[2];
          const methodName = match[3];
          return ` {\n    // ${methodName} 方法的实现\n    return nil\n}`;
        }
      } else {
        const funcName = lastLine.replace('func ', '').replace(/\(.*/, '').trim();
        return `(${lastLine.match(/\((.*)\)/)?.[1] || ''}) {\n    // ${funcName} 函数的实现\n    return\n}`;
      }
    } else if (lastLine.startsWith('if err != nil')) {
      return ` {\n    return nil, err\n}`;
    } else if (lastLine.startsWith('type ')) {
      const typeName = lastLine.replace('type ', '').replace(' interface', '').replace(' struct', '').trim();
      if (lastLine.includes('interface')) {
        return ` {\n    // TODO: define methods\n}`;
      } else if (lastLine.includes('struct')) {
        return ` {\n    // TODO: define fields\n}`;
      }
    }
  }

  return '';
}

// ============ 测试模式：固定补全内容 ============

function generateTestCompletion(context: string, language: string): AICompletionResponse {
  const lines = context.split('\n');
  const lastLine = lines[lines.length - 1];
  const suggestions: AICompletionResponse['suggestions'] = [];

  if (language === 'python') {
    if (lastLine.trim().startsWith('def ')) {
      suggestions.push(
        { text: ':\n    """函数文档字符串"""\n    pass', confidence: 0.95, displayText: ': (函数定义)' },
        { text: ':', confidence: 0.7, displayText: ':' }
      );
    } else if (lastLine.trim().startsWith('class ')) {
      suggestions.push(
        { text: ':\n    def __init__(self):\n        pass', confidence: 0.95, displayText: ': (类定义)' },
        { text: ':', confidence: 0.6, displayText: ':' }
      );
    } else if (lastLine.endsWith('.')) {
      suggestions.push(
        { text: 'upper()', confidence: 0.9, displayText: 'upper()' },
        { text: 'lower()', confidence: 0.9, displayText: 'lower()' },
        { text: 'split()', confidence: 0.85, displayText: 'split()' }
      );
    } else if (lastLine.trim() === 'if __name__ == \'__main__\':' ||
               lastLine.trim() === 'if __name__ == "__main__":') {
      suggestions.push(
        { text: '\n    main()', confidence: 0.95, displayText: '\\n    main()' },
        { text: '\n    pass', confidence: 0.5, displayText: '\\n    pass' }
      );
    } else if (lastLine.trim().startsWith('for ')) {
      suggestions.push(
        { text: ' in range(10):\n    print(i)', confidence: 0.9, displayText: ' in range(10):' },
        { text: ' in :', confidence: 0.6, displayText: ' in :' }
      );
    } else if (lastLine.trim().startsWith('try:')) {
      suggestions.push(
        { text: '\n    pass\nexcept Exception as e:\n    print(e)', confidence: 0.9, displayText: '\\n    pass\\nexcept...' },
        { text: '\n    pass', confidence: 0.5, displayText: '\\n    pass' }
      );
    } else if (lastLine.trim() === '') {
      suggestions.push(
        { text: '# TODO: 注释', confidence: 0.7, displayText: '# TODO: 注释' },
        { text: 'pass', confidence: 0.6, displayText: 'pass' }
      );
    } else {
      suggestions.push(
        { text: '()', confidence: 0.7, displayText: '()' },
        { text: '[]', confidence: 0.6, displayText: '[]' }
      );
    }
  } else if (language === 'javascript' || language === 'typescript') {
    if (lastLine.trim().startsWith('function ')) {
      suggestions.push(
        { text: '() {\n    console.log("");\n}', confidence: 0.95, displayText: '() {...}' },
        { text: '() {\n    \n}', confidence: 0.8, displayText: '() {...}' }
      );
    } else if (lastLine.endsWith('.')) {
      suggestions.push(
        { text: 'then(result => )', confidence: 0.8, displayText: '.then(...)' },
        { text: 'catch(err => )', confidence: 0.8, displayText: '.catch(...)' }
      );
    } else {
      suggestions.push(
        { text: '()', confidence: 0.7, displayText: '()' },
        { text: '{}', confidence: 0.6, displayText: '{}' }
      );
    }
  } else if (language === 'cpp' || language === 'c') {
    if (lastLine.trim().startsWith('int main(')) {
      suggestions.push(
        { text: ') {\n    return 0;\n}', confidence: 0.95, displayText: ') {...}' }
      );
    } else {
      suggestions.push(
        { text: ';\n', confidence: 0.7, displayText: ';' }
      );
    }
  } else if (language === 'go') {
    if (lastLine.trim().startsWith('func ')) {
      suggestions.push(
        { text: '() {\n    return\n}', confidence: 0.95, displayText: '() {...}' }
      );
    } else if (lastLine.trim().startsWith('if err != nil')) {
      suggestions.push(
        { text: ' {\n    return nil, err\n}', confidence: 0.95, displayText: ' {...}' }
      );
    } else {
      suggestions.push(
        { text: '()', confidence: 0.7, displayText: '()' }
      );
    }
  }

  if (suggestions.length === 0) {
    suggestions.push({ text: '// AI 测试补全', confidence: 0.5 });
  }

  return { suggestions };
}

function generateTestMultilineCompletion(context: string, language: string): string {
  const lines = context.split('\n');
  const lastLine = lines[lines.length - 1].trim();

  if (language === 'python') {
    if (lastLine.startsWith('def ')) {
      const funcName = lastLine.replace('def ', '').replace(':', '').split('(')[0].trim();
      return `:\n    """\n    ${funcName} 函数\n\n    参数:\n        param1: 第一个参数\n        param2: 第二个参数\n\n    返回:\n        返回值说明\n    """\n    pass\n\n\n# 测试函数\nif __name__ == '__main__':\n    result = ${funcName}(param1, param2)\n    print(result)`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(':', '').split('(')[0].trim();
      return `:\n    def __init__(self, name):\n        self.name = name\n        self._init()\n\n    def _init(self):\n        """初始化逻辑"""\n        pass\n\n    def __str__(self):\n        return f"{self.__class__.__name__}({self.name})"`;
    } else if (lastLine.startsWith('if __name__')) {
      return `:\n    print("程序开始运行")\n\n    # 主逻辑\n    pass`;
    } else if (lastLine.startsWith('for ')) {
      return ` in range(10):\n    print(i)\n    # 处理逻辑\n    pass`;
    } else if (lastLine.startsWith('try:')) {
      return `:\n    pass\nexcept Exception as e:\n    print(f"发生错误: {e}")\n    raise\nfinally:\n    print("清理资源")`;
    } else if (lastLine.startsWith('while ')) {
      return `:\n    count = 0\n    while count < 10:\n        print(count)\n        count += 1`;
    }
  } else if (language === 'javascript' || language === 'typescript') {
    if (lastLine.startsWith('function ') || lastLine.startsWith('async function ')) {
      return `(${lastLine.includes('async') ? '' : ''}) {\n    /**\n     * 函数描述\n     * @param {*} param1 参数1\n     * @returns {Promise<*>}\n     */\n    try {\n        const result = await Promise.resolve();\n        return result;\n    } catch (error) {\n        console.error('Error:', error);\n        throw error;\n    }\n}`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(/ extends .*/, '').trim();
      return ` {\n    constructor() {\n        this.init();\n    }\n\n    init() {\n        // 初始化逻辑\n    }\n\n    toString() {\n        return '[${className}]';\n    }\n}`;
    } else if (lastLine.startsWith('const ') || lastLine.startsWith('let ') || lastLine.startsWith('var ')) {
      return ` = {\n    // 属性定义\n    name: 'value',\n    // 方法\n    getData: async function() {\n        return this.name;\n    }\n};`;
    }
  } else if (language === 'cpp' || language === 'c') {
    if (lastLine.startsWith('int main(') || lastLine.startsWith('void main(')) {
      return `) {\n    // 程序入口\n    std::cout << "Hello, World!" << std::endl;\n\n    // 主逻辑\n\n    return 0;\n}`;
    } else if (lastLine.startsWith('class ')) {
      const className = lastLine.replace('class ', '').replace(/ :.*/, '').trim();
      return ` {\npublic:\n    ${className}();\n    ~${className}();\n\n    void setName(const std::string& name);\n    std::string getName() const;\n\nprivate:\n    std::string m_name;\n};`;
    } else if (lastLine.startsWith('struct ')) {
      const structName = lastLine.replace('struct ', '').replace(/ {.*/, '').trim();
      return ` {\n    // 成员变量\n    int id;\n    std::string name;\n\n    // 构造函数\n    ${structName}() : id(0), name("") {}\n    ${structName}(int id, const std::string& name) : id(id), name(name) {}\n};`;
    }
  } else if (language === 'go') {
    if (lastLine.startsWith('func ')) {
      if (lastLine.includes('(')) {
        return ` {\n    // 方法实现\n    return nil\n}`;
      } else {
        return `() {\n    // 函数实现\n    return\n}`;
      }
    } else if (lastLine.startsWith('if err != nil')) {
      return ` {\n    log.Printf("Error: %v", err)\n    return nil, err\n}`;
    } else if (lastLine.startsWith('type ')) {
      const typeName = lastLine.replace('type ', '').replace(/ interface| struct/, '').trim();
      if (lastLine.includes('interface')) {
        return ` {\n    // 定义接口方法\n    DoSomething() error\n}`;
      } else if (lastLine.includes('struct')) {
        return ` {\n    // 定义结构体字段\n    Name  string\n    Value int\n}`;
      }
    }
  }

  return '';
}

export default router;
