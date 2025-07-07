import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  splitting: false,
  sourcemap: true,
  outExtension({ format }) {
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
  },
  // Ensure proper module handling
  platform: "node",
  target: "node14",
  // Handle the 'ignore' package properly for both formats
  external: ["playwright", "playwright-core"],
  noExternal: ["ignore"]
});