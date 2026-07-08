// @ts-check
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/artifacts/**",
      "**/cache/**",
      "**/typechain-types/**",
      "**/coverage/**",
      "**/.source/**",
      // Lit Action files run inside the Lit Chipotle TEE — not a Node.js environment.
      // ESLint doesn't know about TEE globals (ethers, Lit, js_params) so exclude them.
      "**/lit-actions/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-require-imports": "warn",
      "@typescript-eslint/ban-ts-comment": "warn",
      "no-console": "off",
    },
  },
);
