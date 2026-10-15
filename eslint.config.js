import js from '@eslint/js'
import ts from 'typescript-eslint'
export default ts.config({ ignores: ['dist/**', 'node_modules/**'] }, js.configs.recommended, ...ts.configs.recommended, {
  files: ['**/*.{ts,tsx,js,mjs}'], languageOptions: { globals: { console: 'readonly', process: 'readonly', fetch: 'readonly', URL: 'readonly', AbortSignal: 'readonly', setTimeout: 'readonly', Buffer: 'readonly', document: 'readonly', innerWidth: 'readonly' } }
})
