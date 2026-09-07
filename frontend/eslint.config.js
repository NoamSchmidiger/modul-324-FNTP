import js from '@eslint/js'
import pluginVue from 'eslint-plugin-vue'
import eslintConfigPrettier from 'eslint-config-prettier'
import globals from 'globals'

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'eslint_report.json'],
  },

  js.configs.recommended,

  ...pluginVue.configs['flat/recommended'],

  eslintConfigPrettier,

  {
    files: ['**/*.{js,vue}'],

    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },

    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
]