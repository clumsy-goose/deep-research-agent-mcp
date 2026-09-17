# 深度研究助手

多 Agent 深度研究助手，支持子问题人工确认、联网搜索、学术搜索、迭代报告生成与项目版本管理。基于 OpenAI Agents SDK 构建，部署在 EdgeOne Makers。

**Framework:** OpenAI Agents SDK · **Category:** Research · **Language:** TypeScript

[![部署到 EdgeOne Makers](https://cdnstatic.tencentcs.com/edgeone/pages/deploy.svg)](https://edgeone.ai/makers/new?template=deep-research-edgeone&from=within&fromAgent=1&agentLang=typescript)

## 概述

本模板运行一条结构化研究管线：将用户问题分解为子问题，从开放网络与学术数据库收集证据，并合成一份带引用的研究报告。跟进聊天模式允许用户在已完成报告的基础上进行讨论与优化，无需重新执行搜索。

- **人工确认式分解** —— Agent 先将研究问题拆分为子问题，等待用户确认后再继续。
- **双源研究** —— 并行执行联网搜索（腾讯云 Web Search API）与学术搜索（CrossRef + Semantic Scholar），并对关键 URL 抓取详细内容。
- **迭代报告生成** —— 合成 Agent 产出带内联引用的结构化研究报告；清理阶段验证引用格式。
- **项目版本管理** —— 研究报告按项目保存，支持版本历史、差异对比与回滚。
- **跟进聊天** —— 轻量级对话端点，基于已有报告回答问题或触发重新生成。

## 环境变量

| 变量 | 必填 | 说明 |
|----------|----------|-------------|
| `AI_GATEWAY_API_KEY` | 是 | 模型网关 API Key。使用 Makers Models 的 API Key，或任何兼容 OpenAI 协议的提供商 Key。 |
| `AI_GATEWAY_BASE_URL` | 是 | 网关基础地址。使用 Makers Models 时填写 `https://ai-gateway.edgeone.link/v1`。 |
| `AI_GATEWAY_MODEL` | 否 | 模型 ID，默认为 `@makers/deepseek-v4-flash`。 |
| `WSA_API_KEY` | 否 | 腾讯云 Web Search API（WSA）Key，用于平台内置 `web_search` 工具。未配置时联网搜索将回退到稳定性较差的方案。 |

本模板遵循 OpenAI 兼容标准 —— 可指向 Makers Models 或任何兼容提供商。

### 如何获取 AI_GATEWAY_API_KEY

1. 打开 Makers 控制台（https://edgeone.ai/makers/new?s_url=https://console.tencentcloud.com/edgeone/makers）
2. 登录并启用 Makers
3. 进入 Makers → Models → API Key，创建 Key
4. 将其填入 `AI_GATEWAY_API_KEY`

> 内置模型在额度内免费，适合验证；生产环境请绑定自费厂商 Key（BYOK）。

### 如何获取 WSA_API_KEY

1. 在腾讯云 WSA 控制台（https://console.cloud.tencent.com/wsapi/index）启用 Web Search（WSA）
2. 获取 API Key 并设置为 `WSA_API_KEY`
3. 参考：[WSA API 文档](https://cloud.tencent.com/document/product/1806/130615)

> 如不使用腾讯云 WSA，可将 `web_search` 工具实现替换为第三方搜索服务（如 Exa、Tavily）。

## 本地开发

**前置依赖**
- Node.js 18+
- EdgeOne CLI（`npm i -g edgeone`）

```bash
npm install
cp .env.example .env
# 编辑 .env，填入 AI_GATEWAY_API_KEY、AI_GATEWAY_BASE_URL 和 WSA_API_KEY
edgeone makers dev
```

本地可观测面板地址：http://localhost:8088/agent-metrics。

## 项目结构

```
deep-research-agent/
├── agents/
│   ├── research.ts         # POST /research —— 主研究管线
│   ├── chat.ts             # POST /chat —— 跟进讨论
│   ├── stop.ts             # POST /stop —— 中止运行
│   ├── _tools.ts           # 工具工厂（分解、搜索、抓取）
│   ├── _prompts.ts         # 系统提示词构建器
│   ├── _sources.ts         # 学术 API 解析器（CrossRef、Semantic Scholar）
│   ├── _project-store.ts   # 版本持久化辅助函数
│   ├── _follow-up.ts       # 无搜索编辑路径（报告优化）
│   ├── _report-cleanup.ts  # 后处理与引用验证
│   └── _shared.ts          # SDK 重导出、SSE 辅助函数、日志
├── cloud-functions/
│   ├── project/            # 项目与版本存储
│   ├── enrich-doi/         # DOI 元数据增强
│   ├── health/             # GET /health
│   ├── _http.ts            # HTTP 客户端工具
│   └── _logger.ts          # 云函数共享日志
├── app/                    # Next.js App Router 前端
├── lib/
│   └── i18n.tsx            # 中 / 英翻译
├── .mcp.json               # MCP 客户端配置（CodeBuddy / Cursor 等）
└── edgeone.json            # EdgeOne 部署配置
```

以 `_` 为前缀的文件是私有模块，不会作为公共路由暴露。

## 工作原理

### 运行模式
`agents/` 下的文件以**会话模式**运行：相同 `conversation_id` 的请求会被粘性路由到同一 Agent 实例及同一沙箱。这保证了对话历史与上传上下文在后续消息中始终可用。

### 端到端流程

1. **问题输入** —— 前端 POST `/research`，携带研究问题、深度级别和可选的项目 ID。
2. **子问题分解** —— 分解 Agent 将问题拆分为聚焦的子问题（2–7 个，取决于深度）。前端展示这些子问题供用户确认。
3. **用户确认** —— 用户编辑或确认子问题。前端再次 POST `/research`，携带 `confirmedSubQuestions` 进入完整研究模式。
4. **并行研究** —— 研究 Agent 发起并行工具调用：
   - **联网搜索**（`search_web`）通过平台 `web_search` 工具（腾讯云 WSA）。
   - **学术搜索**（`search_literature`）通过 CrossRef 和 Semantic Scholar API。
5. **URL 抓取** —— 对联网搜索结果中的关键 URL，使用平台 `browser_fetch` 工具抓取详细内容。
6. **报告合成** —— 合成 Agent 将所有来源整合为一份带内联引用的结构化研究报告。
7. **清理与验证** —— 报告经过后处理（去除前言、验证引用、清理结构）。
8. **持久化** —— 最终报告通过 `cloud-functions/project/` 保存为项目版本。
9. **跟进聊天** —— 用户可以 POST `/chat`，基于已有报告进行提问或请求编辑，无需重新执行搜索。

### 关键路由与参数
- `/research` —— 主研究端点。Body：`{ question, depth, projectId, confirmedSubQuestions?, decomposeOnly? }`。
- `/chat` —— 基于已完成报告的跟进讨论。Body：`{ message, projectId, chatHistory, report }`。
- `/stop` —— 中止活跃研究运行。Body：`{ conversation_id }`。
- `/health` —— 存活探针（位于 `cloud-functions/`，不涉及 AI）。
- `conversation_id` 由前端生成，通过 `makers-conversation-id` Header 传入；运行时会自动绑定到 `context.conversation_id`。

### 超时配置
`edgeone.json` 中将 Agent 超时设置为 **300 秒**，以适应长时间运行的研究合成。

## MCP 服务

部署后平台会在 **`/mcp`** 端点自动暴露标准 MCP 服务，无需编写或部署任何 MCP Server。构建阶段会扫描 `agents/` 目录，解析每个路由文件**头部注释块**中以 `@mcp_` 为前缀的 JSDoc 字段，把路由注册为 MCP Tool。

本模板只对外暴露 `/research` 一个 Tool：

| 路由 | 文件 | MCP Tool | 说明 |
|---|---|---|---|
| `/research` | `agents/research.ts` | `deep_research` | 一次调用完成调研全流程，输入输出语义清晰 |
| `/chat` | `agents/chat.ts` | 隐藏（`@mcp_hidden true`） | 依赖前端传入 `report` 上下文，AI 客户端无法自行构造 |
| `/scrape` | `agents/scrape.ts` | 隐藏 | 内部抓取工具，已被 `/research` 管线包含 |
| `/stop` | `agents/stop.ts` | 隐藏 | 依赖会话粘性路由中止运行，AI 客户端无对应语义 |

最终生成的 Tool 定义：

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

### 本地调试

```bash
edgeone makers dev
# MCP 端点：http://localhost:8088/mcp
```

### 客户端接入

部署后在「构建部署 → Agents」的 MCP 配置区块可一键复制配置片段。以 CodeBuddy 为例，项目根目录的 `.mcp.json`：

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

CodeBuddy 支持在 `url` / `headers` 中展开 `${VAR_NAME}`，因此配置文件可提交到仓库，Token 只保留在本地环境变量：

```bash
export DEEP_RESEARCH_JWT="eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### JWT 鉴权（推荐）

每次 `/research` 调用都会消耗模型额度，对外服务建议在 `edgeone.json` 的 `agents` 下开启鉴权：

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

生成密钥对：

```bash
openssl genrsa -out private_key.pem 2048
openssl rsa -in private_key.pem -pubout -out public_key.pem
awk '{printf "%s\\n", $0}' public_key.pem   # 转成可粘贴进 JSON 的单行字符串
```

Token 由你自己的后端签发（平台只持公钥验签）：

```javascript
import jwt from 'jsonwebtoken';
const token = jwt.sign({ sub: 'codebuddy' }, privateKey, { algorithm: 'RS256', expiresIn: '7d' });
```

> 开启鉴权后未携带合法 Token 的请求会被拒绝（401），`/mcp` 不在豁免范围内，从 `initialize` 起就必须携带 `Authorization: Bearer <token>`。修改配置后需重新部署。

### 使用约束

- **请求-响应模式**：MCP `tools/call` 不支持流式中间结果，客户端只接收最终报告；`createSSEResponse` 每 5 秒的 `ping` 心跳用于避免客户端超时断连。
- **长任务**：`deep` 深度调研接近 300 秒 Agent 超时上限，客户端需容忍 1–5 分钟。
- **自定义域名**：绑定自定义域名后必须完成接入验证且 HTTPS 证书处于就绪状态，否则 MCP 连接失败；国内站预设域名的鉴权 Cookie 仅 3 小时有效。

## 相关资源

- [Makers Agents 文档](https://cloud.tencent.com/document/product/1552/132759)
- [Makers 快速开始](https://cloud.tencent.com/document/product/1552/132786)
- [Makers Models](https://cloud.tencent.com/document/product/1552/132748)

## 许可证

MIT
