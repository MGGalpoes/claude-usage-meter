#!/usr/bin/env node
// MCP server (stdio) + CLI: node index.js report [today|yesterday|week|7d|month|30d|all]
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { summary, daily, recentSessions } from "./meter.js";

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
