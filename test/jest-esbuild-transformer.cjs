const esbuild = require('esbuild');

module.exports = {
    process(sourceText, sourcePath) {
        const loader = sourcePath.endsWith('.ts') || sourcePath.endsWith('.tsx')
            ? 'ts'
            : 'js';

        const result = esbuild.transformSync(sourceText, {
            loader,
            format: 'cjs',
            target: 'node20',
            sourcemap: 'inline',
        });

        return {
            code: result.code,
            map: result.map,
        };
    },
};
