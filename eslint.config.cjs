const js = require("@eslint/js");
const prettier = require("eslint-config-prettier/flat");
const globals = require("globals");
const tseslint = require("typescript-eslint");

module.exports = tseslint.config(
    { ignores: ["node_modules/", "dist/", "out/", "release/"] },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    prettier,
    {
        languageOptions: {
            ecmaVersion: 2022,
            globals: {
                ...globals.node,
                ...globals.jest,
            },
        },
        rules: {
            "no-unused-vars": "off",
            "@typescript-eslint/no-unused-vars": ["error", { varsIgnorePattern: "^_" }],
        },
    },
    {
        files: ["**/*.js", "**/*.cjs"],
        ...tseslint.configs.disableTypeChecked,
        languageOptions: {
            sourceType: "commonjs",
        },
        rules: {
            "@typescript-eslint/no-require-imports": "off",
        },
    },
    {
        files: ["**/*.tsx"],
        languageOptions: {
            parserOptions: {
                ecmaFeatures: { jsx: true },
            },
            globals: {
                ...globals.browser,
            },
        },
    },
);
