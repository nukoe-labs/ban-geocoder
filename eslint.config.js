import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "coverage", "api-docs"] },
  eslint.configs.recommended,
  ...tseslint.configs.strict,
);
