# cf_ai_study-buddy

> **AI-powered interview & study coach** built on Cloudflare Workers AI, Durable Objects, and the Agents SDK.

---

## What it does

StudyBuddy is a real-time AI chat application that helps users prepare for technical software engineering interviews. You can ask it technical questions (Java, Spring Boot, React, Kafka, system design), request mock quiz questions, or practice behavioral answers — all in a persistent, session-aware chat.

---

## Architecture

```
Browser (Chat UI)
    │  WebSocket
    ▼
Cloudflare Worker (Hono router)
    │  Durable Object stub
    ▼
StudyBuddyAgent (Durable Object — AIChatAgent)
    │  persists messages in built-in SQLite
    │  streams responses via Workers AI
    ▼
Llama 3.3 70B (@cf/meta/llama-3.3-70b-instruct-fp8-fast)
```

### Components mapping to requirements

| Requirement | Implementation |
|---|---|
| **LLM** | Llama 3.3 70B via Cloudflare Workers AI (`@cf/meta/llama-3.3-70b-instruct-fp8-fast`) |
| **Workflow / coordination** | Durable Objects (`StudyBuddyAgent` extends `AIChatAgent`) |
| **User input via chat** | WebSocket chat UI served from the Worker |
| **Memory / state** | Durable Object built-in SQLite — messages persist across page reloads and reconnects |

---

## Tech Stack

- **Runtime**: Cloudflare Workers
- **Framework**: Hono (routing)
- **AI SDK**: `agents` (Cloudflare Agents SDK) + `ai` (Vercel AI SDK)
- **LLM**: Llama 3.3 70B Instruct via Workers AI
- **State**: Durable Objects with SQLite (via `AIChatAgent`)
- **Frontend**: Vanilla HTML/CSS/JS served inline from the Worker

---

## Running locally

### Prerequisites

- Node.js 18+
- Cloudflare account (free tier works)
- Wrangler CLI

### Steps

```bash
# 1. Clone the repo
git clone https://github.com/<your-username>/cf_ai_study-buddy
cd cf_ai_study-buddy

# 2. Install dependencies
npm install

# 3. Login to Cloudflare (only needed once)
npx wrangler login

# 4. Run locally
npm run dev
```

Open [http://localhost:8787](http://localhost:8787) in your browser.

> **Note**: Workers AI runs on Cloudflare's network even in local dev. Wrangler proxies AI requests automatically — no extra setup needed.

---

## Deploy to Cloudflare

```bash
npm run deploy
```

Wrangler will output a `*.workers.dev` URL you can share.

---

## Features

- 💬 **Real-time streaming chat** — responses stream token by token via WebSocket
- 🧠 **Persistent memory** — conversation history is stored in the Durable Object's SQLite database; refreshing the page or reconnecting resumes the session
- ⚡ **Quick-start chips** — one-click prompts for common interview topics
- 🔄 **Auto-reconnect** — WebSocket reconnects automatically on disconnect
- 📱 **Responsive UI** — works on desktop and mobile

---

## Example prompts to try

- `"Explain microservices vs monolith"`
- `"Quiz me on Java"`
- `"What is JWT and how does token auth work?"`
- `"Tell me about yourself — give me a sample answer"`
- `"What questions should I ask the interviewer?"`
- `"Explain Apache Kafka in simple terms"`
- `"What is the difference between Docker and Kubernetes?"`

---

## Project structure

```
cf_ai_study-buddy/
├── src/
│   └── index.ts        # Worker entrypoint + StudyBuddyAgent Durable Object + HTML UI
├── wrangler.toml        # Cloudflare config (AI binding, Durable Object, vars)
├── package.json
├── tsconfig.json
├── README.md
└── PROMPTS.md           # AI prompts used during development
```

---

## Author

Shreshika Veerannagari — built as part of a Cloudflare internship application assignment.
