import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

export default defineConfig({
  plugins: [react()],
  envDir: root,
  server: { port: 5173, host: "127.0.0.1" },
});
