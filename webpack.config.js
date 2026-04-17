const MonacoWebapckPlugin = require('monaco-editor-webpack-plugin');
const path = require('path');

module.exports = {
  entry: './src/ai-completion.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'app.js'
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
    new MonacoWebapckPlugin(),
  ]
}
