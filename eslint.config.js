// @ts-check
import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: [
      // eslint ignore globs here
    ],
  },
  {
    rules: {
      // overrides
      'no-console': 'off',
    },
  },
  {
    files: ['cli.mjs'],
    rules: {
      'antfu/no-import-dist': 'off',
    },
  },
)
