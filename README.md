# claude-usage-meter

MCP server (stdio) que mede **horas de uso ativo** do [Claude Code](https://claude.com/claude-code) e do [Codex CLI](https://github.com/openai/codex), lendo os transcritos que as duas ferramentas já gravam na sua máquina. Zero telemetria, zero rede: tudo local.

- Claude Code: `~/.claude/projects/**/*.jsonl`
- Codex: `~/.codex/sessions/**/*.jsonl`

Responde perguntas como "quantas horas usei o Claude esta semana?" direto de dentro do Claude Code ou do Codex.

## Instalação

```bash
git clone https://github.com/MGGalpoes/claude-usage-meter
cd claude-usage-meter
npm install
```

Registrar no Claude Code (escopo do usuário):

```bash
claude mcp add --scope user usage-meter -- node /caminho/para/claude-usage-meter/index.js
```

Registrar no Codex (`~/.codex/config.toml`, use barras normais mesmo no Windows):

```toml
[mcp_servers.usage_meter]
command = "node"
args = ["/caminho/para/claude-usage-meter/index.js"]
```

## Uso sem MCP (CLI)

```bash
node index.js report            # hoje + últimos 14 dias
node index.js report week       # today | yesterday | week | 7d | month | 30d | all
```

Exemplo de saída:

```
Periodo: week  (2026-08-31 -> 2026-09-03), ocioso > 10 min encerra bloco
  claude     8h30  sessoes=13  prompts=347
  codex      0h00  sessoes=0   prompts=0
  TOTAL      8h30  (soma simples 8h30, sobreposicao 0h00)
```

## Clauditchi (tamagotchi)

Um bichinho que muda de humor conforme as horas do dia:

| Horas hoje | Humor |
|---|---|
| < 1h | Disposto (pulando, brilhinhos) |
| 1–3h | No ritmo |
| 3–5h | Meio cansado (olhos caídos) |
| 5–7h | Cansado (suando) |
| ≥ 7h | Exausto (olhos em X) |
| sem atividade > 30 min | Dormindo (zzz) |

```bash
node index.js serve          # abre em http://localhost:4242
```

Barra de energia, horas de hoje e da semana, últimos 7 dias. Os botões ◀ ▶ (ou `?demo=6`) mostram os humores sem esperar as horas passarem. Atualiza sozinho a cada 30 s.

**Personalização (⚙️ no canto):** nome, formato do corpo (redondo, gota, quadrado, gato, robô), cor das bochechas, cores da carcaça, tela e destaque, tema do fundo (automático pela hora, claro, entardecer, noite), meta de horas do dia, minutos parado até dormir, pausa que encerra bloco, ferramentas medidas, e para cada humor: cor, rótulo, limite de horas e mensagem (`{h}` = horas, `{m}` = minutos parado). Preview ao vivo; salva no navegador; exporta/importa JSON.

## Ferramentas MCP

| Tool | Parâmetros | Retorna |
|---|---|---|
| `usage_summary` | `period` (today, yesterday, week, 7d, month, 30d, all), `tool` (claude, codex, both), `idle_minutes` | total, por ferramenta, sessões, prompts, horas por dia |
| `usage_daily` | `days`, `tool`, `idle_minutes` | tabela dia a dia (claude, codex, total real) |
| `usage_sessions` | `limit`, `tool`, `idle_minutes` | sessões recentes com tempo ativo, decorrido, prompts e pasta |

## Como mede

1. Extrai o `timestamp` de cada evento (prompt, resposta, tool call).
2. Eventos seguidos com intervalo até `idle_minutes` (padrão 10) formam um bloco ativo; gap maior encerra o bloco.
3. Blocos de sessões paralelas são **unidos**, então não contam em dobro. O campo `sobreposicao` mostra quanto a soma simples exageraria.
4. Horas por dia usam o fuso local da máquina.

## Limitações

- Só conta o que tem transcrito no PC onde roda. Sessões na nuvem, em outra máquina ou no app Desktop não entram.
- O Claude Code apaga transcritos antigos após o período de limpeza configurado, então `all` cobre só o que ainda existe em disco.
- Cache incremental em `~/.claude-usage-meter-cache.json`. Apague para reprocessar tudo.

## Licença

MIT
