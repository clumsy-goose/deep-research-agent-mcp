# Deep Research Agent

Multi-agent deep research assistant with human-in-the-loop sub-question confirmation, web search, academic search, iterative report generation, and project-based version management. Built on the OpenAI Agents SDK and deployed on EdgeOne Makers.

**Framework:** OpenAI Agents SDK · **Category:** Research · **Language:** TypeScript

[![Deploy to EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=deep-research-edgeone&from=within&fromAgent=1&agentLang=typescript)

## Overview

This template runs a structured research pipeline that breaks a user question into sub-questions, gathers evidence from both the open web and academic databases, and synthesizes a cited research report. A follow-up chat mode lets users discuss and refine completed reports without re-running searches.

- **Human-in-the-Loop Decomposition** — The agent first breaks the research question into sub-questions and waits for user confirmation before proceeding.
- **Dual-Source Research** — Parallel web search (Tencent Cloud Web Search API) and academic search (CrossRef + Semantic Scholar) with URL scraping for detailed content.
- **Iterative Report Generation** — A synthesizer agent produces the final report with inline citations; a cleanup stage validates citation formatting.
- **Project Version Management** — Research reports are saved per-project with version history, diffing, and rollback support.
- **Follow-Up Chat** — A lightweight conversational endpoint answers questions about an existing report and can trigger regeneration.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | Yes | Model gateway API key. Use your Makers Models API Key, or any OpenAI-compatible provider key. |
| `AI_GATEWAY_BASE_URL` | Yes | Gateway base URL. For Makers Models, use `https://ai-gateway.edgeone.link/v1`. |
| `AI_GATEWAY_MODEL` | No | Model ID. Defaults to `@makers/deepseek-v4-flash`. |
| `WSA_API_KEY` | No | Tencent Cloud Web Search API (WSA) key for the platform's built-in `web_search` tool. Without it, web search falls back to a less reliable path. |

This template follows the OpenAI-compatible standard — point these at Makers Models or any compatible provider.

### How to get AI_GATEWAY_API_KEY

1. Open the Makers Console (https://edgeone.ai/makers/new?s_url=https://console.tencentcloud.com/edgeone/makers)
2. Sign in and enable Makers
3. Go to Makers → Models → API Key and create a key
4. Copy it into `AI_GATEWAY_API_KEY`

> Built-in models are free within quota and great for validation. For production, bind your own paid provider key (BYOK).

### How to get WSA_API_KEY

1. Enable Web Search (WSA) in the Tencent Cloud WSA Console (https://console.cloud.tencent.com/wsapi/index)
2. Obtain the API Key and set it as `WSA_API_KEY`
3. Reference: [WSA API Documentation](https://cloud.tencent.com/document/product/1806/130615)

> If you do not use Tencent Cloud WSA, the `web_search` tool implementation can be replaced with a third-party search service (e.g. Exa, Tavily).

## Local Development

**Prerequisites**
- Node.js 18+
- EdgeOne CLI (`npm i -g edgeone`)

```bash
npm install
cp .env.example .env
# Edit .env with your AI_GATEWAY_API_KEY, AI_GATEWAY_BASE_URL, and WSA_API_KEY
edgeone makers dev
```

Open the local observability dashboard at http://localhost:8088/agent-metrics.

## Project Structure

```
deep-research-agent/
├── agents/
│   ├── research.ts         # POST /research — main research pipeline
│   ├── chat.ts             # POST /chat — follow-up discussion
│   ├── stop.ts             # POST /stop — abort active run
│   ├── _tools.ts           # Tool factories (decompose, search, scrape)
│   ├── _prompts.ts         # System prompt builder
│   ├── _sources.ts         # Academic API parsers (CrossRef, Semantic Scholar)
│   ├── _project-store.ts   # Version persistence helpers
│   ├── _follow-up.ts       # No-search edit path for report refinement
│   ├── _report-cleanup.ts  # Post-processing and citation validation
│   └── _shared.ts          # SDK re-exports, SSE helpers, logger
├── cloud-functions/
│   ├── project/            # Project & version storage
│   ├── enrich-doi/         # DOI metadata enrichment
│   ├── health/             # GET /health
│   ├── _http.ts            # HTTP client utilities
│   └── _logger.ts          # Shared cloud-function logger
├── app/                    # Next.js App Router frontend
├── lib/
│   └── i18n.tsx            # Chinese / English translations
├── .mcp.json               # MCP client config (CodeBuddy / Cursor / …)
└── edgeone.json            # EdgeOne deployment config
```

Files prefixed with `_` are private modules — not exposed as public routes.

## How It Works

### Runtime Mode
Files under `agents/` run in **session mode**: requests with the same `conversation_id` are sticky-routed to the same agent instance and the same sandbox. This ensures conversation history and uploaded context persist across follow-up messages.

### End-to-End Workflow

1. **Question input** — The frontend POSTs `/research` with the research question, depth level, and optional project ID.
2. **Sub-question decomposition** — A decomposer agent breaks the question into focused sub-questions (2–7 depending on depth). The frontend presents these for user confirmation.
3. **User confirmation** — The user edits or confirms the sub-questions. The frontend then POSTs `/research` again with `confirmedSubQuestions` to enter full research mode.
4. **Parallel research** — The research agent spawns parallel tool calls:
   - **Web search** (`search_web`) via the platform's `web_search` tool (Tencent Cloud WSA).
   - **Academic search** (`search_literature`) via CrossRef and Semantic Scholar APIs.
5. **URL scraping** — Key URLs from web search results are scraped for detailed content using the platform `browser_fetch` tool.
6. **Report synthesis** — A synthesizer agent combines all sources into a structured research report with inline citations.
7. **Cleanup & validation** — The report passes through post-processing (preamble stripping, citation validation, structure cleanup).
8. **Persistence** — The final report is saved as a project version via `cloud-functions/project/`.
9. **Follow-up chat** — Users can POST `/chat` with an existing report to ask questions or request edits without re-running searches.

### Key Routes & Parameters
- `/research` — Main research endpoint. Body: `{ question, depth, projectId, confirmedSubQuestions?, decomposeOnly? }`.
- `/chat` — Follow-up discussion about a completed report. Body: `{ message, projectId, chatHistory, report }`.
- `/stop` — Aborts the active research run. Body: `{ conversation_id }`.
- `/health` — Liveness probe (lives in `cloud-functions/`, not AI-related).
- `conversation_id` is generated client-side and forwarded via the `makers-conversation-id` header; the runtime auto-binds it to `context.conversation_id`.

### Timeouts
Agent timeout is set to **300 seconds** in `edgeone.json` to accommodate long-running research synthesis.

## MCP Server

Once deployed, the platform exposes a standard MCP service at **`/mcp`** — no MCP Server needs to be written or deployed. At build time the `agents/` directory is scanned and the `@mcp_`-prefixed JSDoc fields in each route file's **header comment block** are parsed to register that route as an MCP Tool.

Only `/research` is exposed:

| Route | File | MCP Tool | Why |
|---|---|---|---|
| `/research` | `agents/research.ts` | `deep_research` | One call runs the whole pipeline with clear input/output semantics |
| `/chat` | `agents/chat.ts` | hidden (`@mcp_hidden true`) | Needs the `report` context that only the web UI can supply |
| `/scrape` | `agents/scrape.ts` | hidden | Internal fetcher, already part of the `/research` pipeline |
| `/stop` | `agents/stop.ts` | hidden | Abort is tied to sticky-routed web conversations |

Resulting tool definition:

```json
{
  "name": "deep_research",
  "description": "深度调研。给定一个研究主题或问题，自动分解子问题、联网与学术检索，输出带内联引用的结构化研究报告……",
  "inputSchema": {
    "type": "object",
    "properties": {
      "question": { "type": "string", "description": "研究主题或问题，描述越具体报告越聚焦" },
      "depth": { "type": "string", "description": "调研深度，决定子问题数量与报告篇幅", "enum": ["quick", "standard", "deep"], "default": "standard" },
      "locale": { "type": "string", "description": "报告语言", "enum": ["zh", "en"], "default": "zh" }
    },
    "required": ["question"]
  }
}
```

### Local debugging

```bash
edgeone makers dev
# MCP endpoint: http://localhost:8088/mcp
```

### Client setup

After deployment, copy the ready-made snippet from **Build & Deploy → Agents → MCP configuration**. For CodeBuddy, a project-level `.mcp.json`:

```jsonc
{
  "mcpServers": {
    "deep-research": {
      "type": "http",
      "url": "https://your-domain.com/mcp",
      "headers": { "Authorization": "Bearer ${DEEP_RESEARCH_JWT}" }
    }
  }
}
```

CodeBuddy expands `${VAR_NAME}` in `url` / `headers`, so the file can be committed while the token stays in a local env var:

```bash
export DEEP_RESEARCH_JWT="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### JWT auth (recommended)

Every `/research` call consumes model quota, so enable auth under `agents` in `edgeone.json`:

```json
{
  "agents": {
    "framework": "openai-agents-sdk",
    "externalNodeModules": ["@openai/agents", "openai"],
    "timeout": 300,
    "auth": {
      "type": "jwt",
      "algorithm": "RS256",
      "verificationKeys": [
        "-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8A（替换为你的公钥）\n-----END PUBLIC KEY-----"
      ]
    }
  }
}
```

Generate the key pair:

```bash
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
awk '{printf "%s\\n", $0}' public_key.pem   # single-line form for JSON
```

Tokens are issued by your own backend (the platform only verifies them):

```javascript
import jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 'codebuddy' }, privateKey, { algorithm: 'RS256', expiresIn: '7d' });
```

> With auth enabled, requests without a valid token are rejected (401) and `/mcp` is **not** exempt — `Authorization: Bearer <token>` is required from the very first `initialize` request. Redeploy after changing the config.

### Constraints

- **Request/response**: MCP `tools/call` does not stream intermediate results — clients only receive the final report. The 5-second `ping` heartbeat in `createSSEResponse` keeps the connection alive.
- **Long-running**: `deep` research approaches the 300-second agent timeout; clients should tolerate 1–5 minutes.
- **Custom domains**: must pass domain verification with a ready HTTPS certificate, otherwise the MCP connection fails. The preset domain's auth cookie on the China site is only valid for 3 hours.

## Resources

- [Makers Agents Documentation](https://pages.edgeone.ai/document/agents)
- [Makers Quick Start](https://pages.edgeone.ai/document/agents-quick-start)
- [Makers Models](https://pages.edgeone.ai/document/models)

## License

MIT
