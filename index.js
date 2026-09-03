#!/usr/bin/env node
// MCP server (stdio) + CLI: node index.js report [today|yesterday|week|7d|month|30d|all]
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { summary, daily, recentSessions, petState } from "./meter.js";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const PERIODS = ["today", "yesterday", "week", "7d", "month", "30d", "all"];
const TOOLS = ["claude", "codex", "both"];
const pick = (t) => (t === "both" || !t ? ["claude", "codex"] : [t]);
const txt = (o) => ({ content: [{ type: "text", text: JSON.stringify(o, null, 2) }] });

if (process.argv[2] === "report") {
  const period = process.argv[3] || "today";
  const s = await summary({ period });
  console.log(`Periodo: ${period}  (${s.de.slice(0, 10)} -> ${s.ate.slice(0, 10)}), ocioso > ${s.idleMinutes} min encerra bloco`);
  for (const [k, v] of Object.entries(s.ferramentas)) console.log(`  ${k.padEnd(7)} ${v.horas.padStart(7)}  sessoes=${v.sessoes}  prompts=${v.prompts}`);
  console.log(`  TOTAL   ${s.total.horas.padStart(7)}  (soma simples ${s.total.horasSomaSimples}, sobreposicao ${s.total.sobreposicao})`);
  console.log("\nUltimos 14 dias:");
  for (const r of await daily({ days: 14 })) console.log(`  ${r.dia}  claude ${r.claude.padStart(6)}  codex ${r.codex.padStart(6)}  total ${r.total.padStart(6)}`);
  process.exit(0);
}

if (process.argv[2] === "serve") {
  const port = Number(process.argv[3] || 4242);
  const here = path.dirname(fileURLToPath(import.meta.url));
  const html = path.join(here, "web", "index.html");
  http.createServer(async (req, res) => {
    try {
      if (req.url.startsWith("/api/state")) {
        const u = new URL(req.url, "http://x");
        const idle = Math.min(120, Math.max(1, Number(u.searchParams.get("idle")) || 10));
        const tool = u.searchParams.get("tool");
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(await petState({ idleMinutes: idle, tools: pick(TOOLS.includes(tool) ? tool : "both") })));
      } else if (req.url.startsWith("/api/config")) {
        const cfgFile = path.join(os.homedir(), ".clauditchi-config.json");
        if (req.method === "POST") {
          let body = ""; req.on("data", (c) => (body += c)); await new Promise((r) => req.on("end", r));
          JSON.parse(body); fs.writeFileSync(cfgFile, body);
          res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}');
        }
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(fs.existsSync(cfgFile) ? fs.readFileSync(cfgFile) : "null");
      } else if (req.url.startsWith("/api/skins")) {
        const dir = path.join(here, "web", "skins");
        const skins = fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : [];
        res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        res.end(JSON.stringify(skins));
      } else if (req.url.startsWith("/skins/")) {
        const rel = decodeURIComponent(req.url.split("?")[0]).replace(/\.\./g, "");
        const file = path.join(here, "web", rel);
        if (!fs.existsSync(file)) { res.writeHead(404); return res.end("not found"); }
        const ext = path.extname(file).toLowerCase();
        res.writeHead(200, { "content-type": ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg", "cache-control": "no-cache" });
        res.end(fs.readFileSync(file));
      } else {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(fs.readFileSync(html));
      }
    } catch (e) { res.writeHead(500); res.end(String(e)); }
  }).listen(port, "127.0.0.1", () => console.log(`Tamagotchi em http://localhost:${port}`));
} else {

const server = new McpServer({ name: "claude-usage-meter", version: "1.0.0" });

server.tool(
  "usage_summary",
  "Horas de uso ATIVO do Claude Code e/ou Codex num periodo (uniao de intervalos; gap maior que idle_minutes conta como pausa). Retorna total, por ferramenta, sessoes, prompts e horas por dia.",
  { period: z.enum(PERIODS).default("today"), tool: z.enum(TOOLS).default("both"), idle_minutes: z.number().min(1).max(120).default(10) },
  async ({ period, tool, idle_minutes }) => txt(await summary({ period, tools: pick(tool), idleMinutes: idle_minutes }))
);

server.tool(
  "usage_daily",
  "Tabela de horas ativas por dia (ultimos N dias), separando Claude e Codex e o total real (sem contar sobreposicao).",
  { days: z.number().int().min(1).max(365).default(14), tool: z.enum(TOOLS).default("both"), idle_minutes: z.number().min(1).max(120).default(10) },
  async ({ days, tool, idle_minutes }) => txt(await daily({ days, tools: pick(tool), idleMinutes: idle_minutes }))
);

server.tool(
  "usage_sessions",
  "Sessoes mais recentes com tempo ativo, tempo decorrido, prompts, pasta e id.",
  { limit: z.number().int().min(1).max(200).default(15), tool: z.enum(TOOLS).default("both"), idle_minutes: z.number().min(1).max(120).default(10) },
  async ({ limit, tool, idle_minutes }) => txt(await recentSessions({ limit, tools: pick(tool), idleMinutes: idle_minutes }))
);

await server.connect(new StdioServerTransport());
}
