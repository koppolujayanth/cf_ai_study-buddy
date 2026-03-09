# PROMPTS.md — AI Prompts Used During Development

This file documents the AI prompts used during the development of `cf_ai_study-buddy` as required by the assignment.

---

## 1. Project planning prompt

**Tool**: Claude (Anthropic)

**Prompt**:
```
I need to build an AI-powered application on Cloudflare for an internship assignment. Requirements:
- LLM: Llama 3.3 on Workers AI
- Workflow/coordination: Durable Objects or Workflows
- User input via chat or voice
- Memory or state

The Cloudflare Agents SDK is available (npm: agents). 
AIChatAgent gives persistent message history via Durable Objects with SQLite.
Design me a project: a study/interview coach chat app. 
Give me the full file structure, wrangler.toml, src/index.ts, package.json.
```

**Used for**: Overall architecture design, deciding to use `AIChatAgent` as the Durable Object base class, Hono for routing, and inline HTML for the UI.

---

## 2. Durable Object + AIChatAgent wiring prompt

**Tool**: Claude (Anthropic)

**Prompt**:
```
Show me how to extend AIChatAgent from the Cloudflare Agents SDK to create a StudyBuddyAgent.
The agent should:
1. Use Workers AI with Llama 3.3 70B (model string: @cf/meta/llama-3.3-70b-instruct-fp8-fast)
2. Use createWorkersAI from workers-ai-provider
3. Use streamText from the ai package
4. Accept a SYSTEM_PROMPT env variable
5. Export the class as a Durable Object
```

**Used for**: `StudyBuddyAgent` class in `src/index.ts`.

---

## 3. Chat UI WebSocket client prompt

**Tool**: Claude (Anthropic)

**Prompt**:
```
Write a vanilla HTML/CSS/JS single-page chat UI that:
- Connects via WebSocket to /agents/study-buddy/:sessionId
- Sends messages using the Cloudflare Agents SDK wire format: 
  { type: 'cf_agent_chat_message', message: { role: 'user', content: text, id: 'msg-N' } }
- Handles streaming text-delta events and renders them incrementally
- Shows a typing indicator while waiting
- Has quick-start suggestion chips
- Persists sessionId in localStorage so the session resumes on reload
- Dark theme, clean modern design
```

**Used for**: The `renderUI()` function HTML/CSS/JS in `src/index.ts`.

---

## 4. wrangler.toml configuration prompt

**Tool**: Claude (Anthropic)

**Prompt**:
```
Write a wrangler.toml for a Cloudflare Worker that:
- Uses TypeScript (main: src/index.ts)
- Has an AI binding named AI
- Declares a Durable Object binding named STUDY_BUDDY_AGENT pointing to class StudyBuddyAgent
- Uses new_sqlite_classes migration for the Durable Object
- Sets a SYSTEM_PROMPT var
compatibility_date should be recent (2025).
```

**Used for**: `wrangler.toml`.

---

## 5. System prompt for the LLM

**Tool**: Claude (Anthropic)

**Prompt**:
```
Write a system prompt for an AI interview coach named StudyBuddy. 
It should be concise, friendly, encourage the user, 
give clear technical answers with examples, 
and track topics covered in the session.
```

**Result used as** the `SYSTEM_PROMPT` variable in `wrangler.toml`:
> "You are StudyBuddy, an expert AI interview and study coach. Help users prepare for technical interviews. Give concise, clear answers. When explaining code or technical concepts, use examples. Encourage the user and track what topics they have covered in this session."

---

*All code was reviewed, understood, and assembled by the developer. AI was used as a coding assistant, not as a replacement for understanding.*
