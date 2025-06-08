import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist/",
      ".scaffold/",
      "node_modules/",
      "attachment-finder.js", // Legacy file
      "bootstrap.js",
      "build.sh",
      "run-tests.js",
      "tests/",
      "*.config.js",
      "*.config.mjs",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        Zotero: "readonly",
        Components: "readonly",
        Services: "readonly",
        ChromeUtils: "readonly",
        window: "readonly",
        document: "readonly",
        _globalThis: "readonly",
        addon: "readonly",
        ztoolkit: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/explicit-function-return-type": "off",
      "@typescript-eslint/explicit-module-boundary-types": "off",
      "@typescript-eslint/no-non-null-assertion": "warn",
      "prefer-const": "error",
      "no-var": "error",
    },
  },
); 