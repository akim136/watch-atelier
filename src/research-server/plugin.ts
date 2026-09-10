import type { Plugin } from "vite";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { jobRequestSchema } from "../build/jobs.ts";
import { boundedJSON } from "../build/model.ts";
import { research, MODEL, CLI_VERSION } from "./provider.ts";

export function validOrigin(
  headers: Record<string, string | string[] | undefined>,
) {
  return (
    headers.host === "127.0.0.1:5173" &&
    headers["sec-fetch-site"] === "same-origin" &&
    (!headers.origin || headers.origin === "http://127.0.0.1:5173")
  );
}
export function validToken(actual: string | undefined, token: string) {
  const a = Buffer.from(actual ?? ""),
    b = Buffer.from("Bearer " + token);
  return a.length === b.length && timingSafeEqual(a, b);
}
export function researchPlugin(): Plugin {
  const token = randomBytes(32).toString("hex");
  let active = false;
  const enabled = process.env.WATCH_BI_CODEX === "1";
  return {
    name: "watch-atelier-local-research",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__bi/")) {
          next();
          return;
        }
        const send = (code: number, body: unknown) => {
          if (!res.destroyed) {
            res.writeHead(code, {
              "Content-Type": "application/json",
              "Cache-Control": "no-store",
              "X-Content-Type-Options": "nosniff",
            });
            res.end(JSON.stringify(body));
          }
        };
        if (!validOrigin(req.headers)) {
          send(403, {
            message: "Research requires the same-origin loopback app.",
          });
          return;
        }
        if (
          req.url === "/__bi/session" &&
          req.method === "GET" &&
          req.headers["x-watch-atelier"] === "research"
        ) {
          send(200, { token, enabled, model: MODEL, cliVersion: CLI_VERSION });
          return;
        }
        if (
          !validToken(req.headers.authorization, token) ||
          req.headers.origin !== "http://127.0.0.1:5173"
        ) {
          send(403, { message: "Research session authorization required." });
          return;
        }
        if (req.url !== "/__bi/research" || req.method !== "POST") {
          send(404, { message: "Unknown research action." });
          return;
        }
        if (!enabled) {
          send(503, {
            message:
              "Provider disabled. Run pnpm dev:research. Saved/manual research remains usable.",
          });
          return;
        }
        if (active) {
          send(409, { message: "One local research job is already running." });
          return;
        }
        if (req.headers["content-type"] !== "application/json") {
          send(415, { message: "JSON input required." });
          return;
        }
        active = true;
        const controller = new AbortController(),
          chunks: Buffer[] = [];
        let bytes = 0;
        const timer = setTimeout(() => controller.abort(), 180_000);
        res.on("close", () => {
          if (!res.writableEnded) controller.abort();
        });
        try {
          for await (const chunk of req) {
            bytes += chunk.length;
            if (bytes > 16 * 1024) throw new Error("Request too large.");
            chunks.push(chunk);
          }
          const request = jobRequestSchema.parse(
            boundedJSON(Buffer.concat(chunks).toString("utf8"), 16 * 1024),
          );
          const result = await research(request, controller.signal);
          send(200, result);
        } catch {
          send(400, {
            message:
              "Invalid, cancelled or oversized research request. No result accepted.",
          });
        } finally {
          clearTimeout(timer);
          active = false;
        }
      });
    },
  };
}
