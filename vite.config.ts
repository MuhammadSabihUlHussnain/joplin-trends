import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Production builds only: the dev server needs inline scripts and websockets for hot reload.
// Journal data may only go to Dropbox and the AI provider.
const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self' https://api.dropboxapi.com https://content.dropboxapi.com https://api.anthropic.com",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

function contentSecurityPolicy(): Plugin {
  return {
    name: "content-security-policy",
    apply: "build",
    transformIndexHtml: (html) =>
      html.replace("<head>", `<head>\n    <meta http-equiv="Content-Security-Policy" content="${CSP}" />`),
  };
}

export default defineConfig({
  // Relative base so the same build works at https://<user>.github.io/<repo>/ under any repo name.
  base: "./",
  plugins: [react(), contentSecurityPolicy()],
  server: { port: 5173, strictPort: true },
  test: { environment: "node", include: ["tests/**/*.test.ts"] },
});
