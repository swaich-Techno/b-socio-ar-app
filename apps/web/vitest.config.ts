import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
      "@bsocio/shared-types": path.resolve(__dirname, "../../packages/shared-types/src/index.ts"),
      "@bsocio/validation": path.resolve(__dirname, "../../packages/validation/src/index.ts"),
      "@bsocio/constants": path.resolve(__dirname, "../../packages/constants/src/index.ts"),
      "@bsocio/database": path.resolve(__dirname, "../../packages/database/src/index.ts"),
      "@bsocio/storage": path.resolve(__dirname, "../../packages/storage/src/index.ts"),
      "@bsocio/qr-engine": path.resolve(__dirname, "../../packages/qr-engine/src/index.ts"),
      "@bsocio/ui": path.resolve(__dirname, "../../packages/ui/src/index.tsx"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    include: ["tests/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["components/**/*.{ts,tsx}", "lib/**/*.ts", "../../packages/*/src/**/*.ts"],
    },
  },
});
