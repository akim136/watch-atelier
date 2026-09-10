import js from "@eslint/js";
import tseslint from "typescript-eslint";
export const domainRules = {
  "no-restricted-imports": [
    "error",
    {
      patterns: [
        {
          regex: "^(?!zod$|\\./[a-zA-Z0-9_/-]+(?:\\.ts)?$)",
          message: "Domain imports must stay inside domain or Zod.",
        },
        {
          group: [
            "**/application/**",
            "**/render/**",
            "**/storage/**",
            "**/studio/**",
          ],
          message: "Domain cannot depend on adapters.",
        },
      ],
    },
  ],
  "no-restricted-syntax": [
    "error",
    { selector: "ImportExpression", message: "No dynamic imports in domain." },
    {
      selector: 'CallExpression[callee.name="require"]',
      message: "No require in domain.",
    },
  ],
};
export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "artifacts/**",
      "playwright-report/**",
      "test-results/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        process: "readonly",
        Buffer: "readonly",
        URL: "readonly",
        performance: "readonly",
        Blob: "readonly",
        indexedDB: "readonly",
        crypto: "readonly",
        atob: "readonly",
        btoa: "readonly",
        File: "readonly",
        navigator: "readonly",
        Image: "readonly",
        FontFace: "readonly",
        createImageBitmap: "readonly",
        requestAnimationFrame: "readonly",
        cancelAnimationFrame: "readonly",
        ResizeObserver: "readonly",
        BroadcastChannel: "readonly",
        TextEncoder: "readonly",
        AbortController: "readonly",
        structuredClone: "readonly",
        fetch: "readonly",
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_" },
      ],
    },
  },
  { files: ["src/domain/**/*.ts"], rules: domainRules },
);
