const MonacoWebapckPlugin = require('monaco-editor-webpack-plugin');
const path = require('path');

module.exports = {
  entry: './src/ai-completion.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js'
  },
  // 开启持久化缓存，显著提升二次启动速度
  cache: {
    type: 'filesystem',
    buildDependencies: {
      config: [__filename],
    },
  },
  devServer: {
    port: 8080,
    static: [
      path.resolve(__dirname, 'src'),
      path.resolve(__dirname),
    ],
  },
  module: {
    rules: [
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader']
      },
      {
        test: /\.ttf$/,
        use: ['file-loader']
      },
    ],
  },
  plugins: [
    new MonacoWebapckPlugin({
      languages: ['python', 'cpp', 'go'],
      features: [
        '!accessibilityHelp',
        '!bracketMatching',
        '!caretOperations',
        '!clipboard',
        '!codeAction',
        '!codelens',
        '!colorDetector',
        '!comment',
        '!contextmenu',
        '!coreCommands',
        '!cursorUndo',
        '!dnd',
        '!find',
        '!folding',
        '!fontZoom',
        '!format',
        '!gotoError',
        '!gotoLine',
        '!gotoSymbol',
        '!hover',
        '!iPadShowKeyboard',
        '!inPlaceReplace',
        '!inspectTokens',
        '!linesOperations',
        '!links',
        '!multicursor',
        '!parameterHints',
        '!quickCommand',
        '!quickOutline',
        '!referenceSearch',
        '!rename',
        '!smartSelect',
        '!snippets',
        '!suggest',
        '!toggleHighContrast',
        '!toggleTabFocusMode',
        '!transpose',
        '!wordHighlighter',
        '!wordOperations',
        '!wordPartOperations'
      ]
    }),
  ]
}
