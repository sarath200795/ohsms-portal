import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

export default [
    {
        ignores: [
            'dist/**',
            'dist-field-portal/**',
            '.vercel/**',
            'backend/dist/**',
            'node_modules/**'
        ]
    },
    js.configs.recommended,
    {
        files: ['**/*.{js,jsx,mjs}'],
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                ecmaFeatures: { jsx: true }
            },
            globals: {
                ...globals.browser,
                ...globals.node
            }
        },
        rules: {
            'no-unused-vars': ['error', {
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^[A-Z_]'
            }]
        }
    },
    {
        files: ['src/**/*.{js,jsx}'],
        ...reactHooks.configs.flat.recommended
    },
    {
        files: ['src/**/*.{js,jsx}'],
        ...reactRefresh.configs.vite
    }
];
