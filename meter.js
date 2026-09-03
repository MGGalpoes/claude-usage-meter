// Nucleo do medidor: varre transcritos do Claude Code e do Codex, extrai timestamps
// e calcula tempo ATIVO (uniao de intervalos; gap > idleMinutes = pausa).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import readline from "node:readline";

const HOME = os.homedir();
export const SOURCES = {
  claude: path.join(HOME, ".claude", "projects"),
  codex: path.join(HOME, ".codex", "sessions"),
};
const CACHE_FILE = path.join(HOME, ".claude-usage-meter-cache.json");
const CACHE_VERSION = 3;

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && e.name.endsWith(".jsonl")) out.push(p);
  }
  return out;
}

function loadCache() {
  try {
    const c = JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
    if (c.version === CACHE_VERSION) return c;
  } catch {}
  return { version: CACHE_VERSION, files: {} };
}
function saveCache(c) {
  try { fs.writeFileSync(CACHE_FILE, JSON.stringify(c)); } catch {}
}

// Le um arquivo e devolve { ts: number[] (ms, ordenados), prompts, cwd, sessionId }
async function parseFile(file, tool) {
  const ts = [];
  let prompts = 0, cwd = null, sessionId = null;
  const rl = readline.createInterface({ input: fs.createReadStream(file, "utf8"), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.startsWith("{")) continue;
    let o;
    try { o = JSON.parse(line); } catch { continue; }
    const t = typeof o.timestamp === "string" ? Date.parse(o.timestamp) : NaN;
    if (!Number.isFinite(t)) continue;
    if (tool === "claude") {
      if (o.type !== "user" && o.type !== "assistant" && o.type !== "system") continue;
      if (!cwd) cwd = o.cwd || null;
      if (!sessionId) sessionId = o.sessionId || null;
      if (o.type === "user" && o.origin && o.origin.kind === "human") prompts++;
      else if (o.type === "user" && !o.origin && o.message && typeof o.message.content === "string") prompts++;
      ts.push(t);
    } else {
      const p = o.payload || {};
      if (o.type === "session_meta") {
        if (!cwd) cwd = p.cwd || null;
        if (!sessionId) sessionId = p.id || null;
        continue;
      }
      if (o.type === "event_msg" && p.type === "user_message" && !String(p.message || "").startsWith("<")) prompts++;
      ts.push(t);
    }
  }
  ts.sort((a, b) => a - b);
  return { ts, prompts, cwd, sessionId: sessionId || path.basename(file, ".jsonl") };
}

export async function collect({ tools = ["claude", "codex"] } = {}) {
  const cache = loadCache();
  const sessions = [];
  const seen = new Set();
  for (const tool of tools) {
    for (const file of walk(SOURCES[tool])) {
      const st = fs.statSync(file);
      seen.add(file);
      let entry = cache.files[file];
      if (!entry || entry.size !== st.size || entry.mtime !== st.mtimeMs) {
        const parsed = await parseFile(file, tool);
        entry = { tool, size: st.size, mtime: st.mtimeMs, ...parsed };
        cache.files[file] = entry;
      }
      if (entry.ts.length) sessions.push({ file, ...entry });
    }
  }
  if (tools.length === 2) for (const k of Object.keys(cache.files)) if (!seen.has(k)) delete cache.files[k];
  saveCache(cache);
  return sessions;
}

// Une timestamps em intervalos ativos. Cada evento vale ate o proximo se o gap <= idle; senao fecha o bloco.
// Evento isolado conta um piso (floorSec) para nao zerar sessoes curtas.
export function toIntervals(tsSorted, idleMinutes = 10, floorSec = 60) {
  const idle = idleMinutes * 60000;
  const out = [];
  let start = null, prev = null;
  for (const t of tsSorted) {
    if (start === null) { start = t; prev = t; continue; }
    if (t - prev > idle) { out.push([start, Math.max(prev, start + floorSec * 1000)]); start = t; }
    prev = t;
  }
  if (start !== null) out.push([start, Math.max(prev, start + floorSec * 1000)]);
  return out;
}

export function mergeIntervals(list) {
  const s = [...list].sort((a, b) => a[0] - b[0]);
  const out = [];
  for (const [a, b] of s) {
    if (out.length && a <= out[out.length - 1][1]) out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
    else out.push([a, b]);
  }
  return out;
}

function dayKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function startOfDay(ms) { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); }

// Divide intervalos por dia local e soma ms por dia.
export function splitByDay(intervals) {
  const acc = {};
  for (let [a, b] of intervals) {
    while (a < b) {
      const next = startOfDay(a) + 86400000;
      const end = Math.min(b, next);
      acc[dayKey(a)] = (acc[dayKey(a)] || 0) + (end - a);
      a = end;
    }
  }
  return acc;
}

export function periodRange(period, now = Date.now()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  const day0 = d.getTime();
  if (period === "today") return [day0, now];
  if (period === "yesterday") return [day0 - 86400000, day0];
  if (period === "week") { const dow = (d.getDay() + 6) % 7; return [day0 - dow * 86400000, now]; }
  if (period === "7d") return [day0 - 6 * 86400000, now];
  if (period === "month") return [new Date(d.getFullYear(), d.getMonth(), 1).getTime(), now];
  if (period === "30d") return [day0 - 29 * 86400000, now];
  return [0, now];
}

function clip(intervals, [from, to]) {
  return intervals.map(([a, b]) => [Math.max(a, from), Math.min(b, to)]).filter(([a, b]) => b > a);
}
function sumMs(intervals) { return intervals.reduce((a, [x, y]) => a + (y - x), 0); }

export function fmtH(ms) {
  const m = Math.round(ms / 60000);
  return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}`;
}

export async function summary({ period = "today", tools = ["claude", "codex"], idleMinutes = 10 } = {}) {
  const range = periodRange(period);
  const sessions = await collect({ tools });
  const perTool = {};
  const all = [];
  for (const tool of tools) {
    const ivs = [];
    let nSess = 0, prompts = 0;
    for (const s of sessions.filter((s) => s.tool === tool)) {
      const sIv = clip(toIntervals(s.ts, idleMinutes), range);
      if (!sIv.length) continue;
      nSess++;
      prompts += s.prompts;
      ivs.push(...sIv);
    }
    const merged = mergeIntervals(ivs);
    const ms = sumMs(merged);
    const porDia = {};
    for (const [k, v] of Object.entries(splitByDay(merged))) porDia[k] = fmtH(v);
    perTool[tool] = { ms, horas: fmtH(ms), sessoes: nSess, prompts, porDia };
    all.push(...merged);
  }
  const total = sumMs(mergeIntervals(all));
  const rawSum = Object.values(perTool).reduce((a, t) => a + t.ms, 0);
  return {
    periodo: period,
    de: new Date(range[0]).toISOString(),
    ate: new Date(range[1]).toISOString(),
    idleMinutes,
    total: { ms: total, horas: fmtH(total), horasSomaSimples: fmtH(rawSum), sobreposicao: fmtH(rawSum - total) },
    ferramentas: perTool,
  };
}

export async function daily({ days = 14, tools = ["claude", "codex"], idleMinutes = 10 } = {}) {
  const now = Date.now();
  const from = startOfDay(now) - (days - 1) * 86400000;
  const sessions = await collect({ tools });
  const byTool = {};
  const allIvs = [];
  for (const tool of tools) {
    const ivs = [];
    for (const s of sessions.filter((s) => s.tool === tool)) ivs.push(...clip(toIntervals(s.ts, idleMinutes), [from, now]));
    const merged = mergeIntervals(ivs);
    byTool[tool] = splitByDay(merged);
    allIvs.push(...merged);
  }
  const totalByDay = splitByDay(mergeIntervals(allIvs));
  const rows = [];
  for (let i = 0; i < days; i++) {
    const k = dayKey(from + i * 86400000);
    const row = { dia: k };
    for (const tool of tools) row[tool] = fmtH(byTool[tool][k] || 0);
    row.total = fmtH(totalByDay[k] || 0);
    rows.push(row);
  }
  return rows;
}

export async function recentSessions({ limit = 15, tools = ["claude", "codex"], idleMinutes = 10 } = {}) {
  const sessions = await collect({ tools });
  const out = sessions.map((s) => {
    const last = s.ts[s.ts.length - 1];
    return {
      ferramenta: s.tool,
      inicio: new Date(s.ts[0]).toISOString(),
      fim: new Date(last).toISOString(),
      ativo: fmtH(sumMs(toIntervals(s.ts, idleMinutes))),
      decorrido: fmtH(last - s.ts[0]),
      prompts: s.prompts,
      eventos: s.ts.length,
      pasta: s.cwd,
      sessao: s.sessionId,
    };
  });
  out.sort((a, b) => b.fim.localeCompare(a.fim));
  return out.slice(0, limit);
}
