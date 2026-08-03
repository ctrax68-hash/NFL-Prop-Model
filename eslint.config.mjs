import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({
  baseDirectory: dirname(fileURLToPath(import.meta.url)),
});

export default [
  {
    ignores: [".next/**", "node_modules/**", ".data/**", ".cache/**"],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      // `require` is used deliberately in one place, to load the Supabase store
      // lazily so a missing config cannot break the default file-store path.
      "@typescript-eslint/no-require-imports": "off",
    },
  },
];
