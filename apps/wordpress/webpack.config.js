const path = require('path');
const defaultConfig = require('@wordpress/scripts/config/webpack.config');

module.exports = {
  ...defaultConfig,
  entry: {
    index: './src/index.ts',
    'editor-styles': './src/editor-styles.ts',
  },
  module: {
    ...defaultConfig.module,
    rules: defaultConfig.module.rules.map((rule) => {
      if (rule.test?.toString().includes('scss')) {
        return {
          ...rule,
          use: rule.use?.map((loader) => {
            if (typeof loader === 'object' && loader.loader?.includes('sass-loader')) {
              return {
                ...loader,
                options: {
                  ...loader.options,
                  sassOptions: {
                    ...loader.options?.sassOptions,
                    includePaths: [path.resolve(__dirname, 'src/styles')],
                  },
                },
              };
            }
            return loader;
          }),
        };
      }
      return rule;
    }),
  },
  resolve: {
    ...defaultConfig.resolve,
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.scss', '.css'],
    alias: {
      ...defaultConfig.resolve?.alias,
      '@styles': path.resolve(__dirname, 'src/styles'),
    },
  },
};
