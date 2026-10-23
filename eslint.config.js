// eslint.config.js
import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js", "**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module", // project is ESM ("type": "module")
      globals: {
        ...globals.node, // process, console, etc. — no false "no-undef"
      },
    },
    rules: {
      // Allow intentionally-unused args/vars prefixed with `_` (e.g. a param kept
      // for interface/call-site documentation but not read in the body).
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
