import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true, // Keep this true to generate index.d.ts
  clean: true, // Good practice to add this
  splitting: false, // Often better for libraries, prevents chunks
  sourcemap: true, // Optional: good for debugging
  outExtension({ format }) {
    // Only define the extension for the JS files
    return {
      js: format === "esm" ? ".mjs" : ".cjs",
    };
    // NO 'dts' entry here anymore
  },
});
