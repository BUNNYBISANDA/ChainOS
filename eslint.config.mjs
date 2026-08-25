// Flat ESLint config shared by every workspace (apps/api, apps/web,
// packages/database). Kept deliberately light — recommended rulesets only,
// plus a couple of overrides for things the existing codebase already does
// on purpose (see comments below) — per phase 0.5 hardening scope, this is
// not the place for opinionated stylistic rules.
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";
import globals from "globals";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/.next/**",
      "**/.turbo/**",
      "**/generated/**",
      "**/coverage/**",
      "**/*.d.ts",
    ],
  },

  ...tseslint.configs.recommended,

  {
    rules: {
      // Unused destructured/catch args prefixed `_` are a deliberate
      // "intentionally unused" signal used throughout (e.g. middleware
      // `(req, _res, next)`), not a mistake to flag.
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // Constraint from the engineering guidelines: never silence a type
      // error by widening to `any`.
      "@typescript-eslint/no-explicit-any": "error",
    },
  },

  // Node runtime (NestJS API + the Prisma package, including its scripts).
  {
    files: ["apps/api/**/*.ts", "packages/database/**/*.{ts,js}"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Plain CommonJS Node scripts (run directly via `node`, not built) —
  // `require()` is correct here, not a lint violation.
  {
    files: ["packages/database/scripts/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },

  // Browser/React runtime (Next.js app).
  {
    files: ["apps/web/**/*.{ts,tsx}"],
    plugins: {
      react,
      "react-hooks": reactHooks,
      "@next/next": nextPlugin,
    },
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    settings: {
      react: { version: "detect" },
      next: { rootDir: "apps/web" },
    },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      ...nextPlugin.configs.recommended.rules,
      // Next.js's automatic JSX runtime doesn't need React in scope, and
      // prop types are covered by TypeScript, not this plugin.
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
      // App Router only (no pages/ dir) — this rule assumes Pages Router
      // and otherwise just warns that it can't find a pages directory.
      "@next/next/no-html-link-for-pages": "off",
    },
  },

  // Test files talk to fixtures/mocks where a precise type isn't always
  // worth modeling out.
  {
    files: ["**/*.spec.ts", "**/*.e2e-spec.ts", "**/test/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
);
