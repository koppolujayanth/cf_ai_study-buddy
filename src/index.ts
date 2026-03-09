import { AIChatAgent } from "agents/ai-chat";
import { createWorkersAI } from "workers-ai-provider";
import { streamText, convertToModelMessages } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Env {
  AI: Ai;
  STUDY_BUDDY_AGENT: DurableObjectNamespace;
  SYSTEM_PROMPT: string;
}

// ─── Durable Object: StudyBuddyAgent ─────────────────────────────────────────
// Extends AIChatAgent — gives us persistent message history, resumable streams,
// and WebSocket support out of the box via the Agents SDK.

export class StudyBuddyAgent extends AIChatAgent<Env> {
  // Called on every new chat message from the client
  async onChatMessage(
    onFinish: (result: { text: string }) => void
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });

    const systemPrompt =
      this.env.SYSTEM_PROMPT ||
      "You are StudyBuddy, an expert AI interview coach. Help the user prepare for technical interviews with clear, concise answers and practical examples.";

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: systemPrompt,
      messages: convertToModelMessages(this.messages),
      onFinish,
    });

    return result.toUIMessageStreamResponse();
  }
}

// ─── Worker: HTTP routing ─────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();

app.use("*", cors({ origin: "*" }));

// Serve the chat UI
app.get("/", (c) => {
  return c.html(renderUI());
});

// Route WebSocket + HTTP requests to the Durable Object
// Pattern: /agents/study-buddy/:sessionId
app.all("/agents/*", async (c) => {
  const url = new URL(c.req.url);
  const parts = url.pathname.split("/"); // ['', 'agents', 'study-buddy', sessionId]
  const sessionId = parts[3] ?? "default";

  const id = c.env.STUDY_BUDDY_AGENT.idFromName(sessionId);
  const stub = c.env.STUDY_BUDDY_AGENT.get(id);

  // Forward the request to the Durable Object
  return stub.fetch(c.req.raw);
});

export default app;

// ─── Inline HTML UI ──────────────────────────────────────────────────────────

function renderUI(): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StudyBuddy — AI Interview Coach</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg: #0f1117;
      --surface: #1a1d27;
      --border: #2a2d3a;
      --accent: #6c63ff;
      --accent2: #a78bfa;
      --text: #e2e8f0;
      --muted: #94a3b8;
      --user-bubble: #6c63ff;
      --ai-bubble: #1e2130;
      --radius: 14px;
    }

    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: var(--bg);
      color: var(--text);
      height: 100dvh;
      display: flex;
      flex-direction: column;
      align-items: center;
    }

    header {
      width: 100%;
      max-width: 760px;
      padding: 18px 24px 14px;
      border-bottom: 1px solid var(--border);
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .logo {
      width: 38px; height: 38px;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      font-size: 20px;
    }

    header h1 { font-size: 1.2rem; font-weight: 700; }
    header p  { font-size: 0.78rem; color: var(--muted); margin-top: 1px; }

    .badge {
      margin-left: auto;
      background: rgba(108,99,255,0.15);
      color: var(--accent2);
      border: 1px solid rgba(108,99,255,0.3);
      font-size: 0.7rem;
      padding: 3px 10px;
      border-radius: 20px;
    }

    #chat {
      flex: 1;
      width: 100%;
      max-width: 760px;
      overflow-y: auto;
      padding: 24px 20px;
      display: flex;
      flex-direction: column;
      gap: 16px;
      scroll-behavior: smooth;
    }

    .msg {
      display: flex;
      flex-direction: column;
      max-width: 82%;
      gap: 4px;
    }
    .msg.user  { align-self: flex-end; align-items: flex-end; }
    .msg.ai    { align-self: flex-start; align-items: flex-start; }

    .bubble {
      padding: 12px 16px;
      border-radius: var(--radius);
      line-height: 1.6;
      font-size: 0.92rem;
      white-space: pre-wrap;
      word-break: break-word;
    }
    .msg.user .bubble {
      background: var(--user-bubble);
      color: #fff;
      border-bottom-right-radius: 4px;
    }
    .msg.ai .bubble {
      background: var(--ai-bubble);
      border: 1px solid var(--border);
      border-bottom-left-radius: 4px;
    }

    .label {
      font-size: 0.7rem;
      color: var(--muted);
      padding: 0 4px;
    }

    .typing { display: flex; gap: 5px; padding: 14px 16px; align-items: center; }
    .dot {
      width: 7px; height: 7px;
      border-radius: 50%;
      background: var(--muted);
      animation: bounce 1.2s infinite;
    }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce {
      0%,80%,100% { transform: translateY(0); }
      40%          { transform: translateY(-6px); }
    }

    .suggestions {
      display: flex; flex-wrap: wrap; gap: 8px;
      padding: 0 20px 8px;
      max-width: 760px; width: 100%;
    }
    .chip {
      background: var(--surface);
      border: 1px solid var(--border);
      color: var(--muted);
      font-size: 0.78rem;
      padding: 6px 14px;
      border-radius: 20px;
      cursor: pointer;
      transition: all .15s;
    }
    .chip:hover { border-color: var(--accent); color: var(--accent2); }

    footer {
      width: 100%;
      max-width: 760px;
      padding: 12px 20px 20px;
      border-top: 1px solid var(--border);
    }

    .input-row {
      display: flex; gap: 10px; align-items: flex-end;
    }

    textarea {
      flex: 1;
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      color: var(--text);
      font-size: 0.92rem;
      padding: 12px 16px;
      resize: none;
      max-height: 140px;
      line-height: 1.5;
      outline: none;
      transition: border-color .15s;
      font-family: inherit;
    }
    textarea:focus { border-color: var(--accent); }
    textarea::placeholder { color: var(--muted); }

    button#send {
      background: var(--accent);
      border: none;
      border-radius: var(--radius);
      color: #fff;
      width: 44px; height: 44px;
      cursor: pointer;
      font-size: 1.1rem;
      flex-shrink: 0;
      transition: background .15s, transform .1s;
      display: flex; align-items: center; justify-content: center;
    }
    button#send:hover    { background: var(--accent2); }
    button#send:active   { transform: scale(0.95); }
    button#send:disabled { opacity: 0.4; cursor: not-allowed; }

    .hint { font-size: 0.7rem; color: var(--muted); margin-top: 8px; text-align: center; }
  </style>
</head>
<body>

<header>
  <div class="logo">🎓</div>
  <div>
    <h1>StudyBuddy</h1>
    <p>AI-powered interview & study coach</p>
  </div>
  <span class="badge">Llama 3.3 · Cloudflare</span>
</header>

<div id="chat">
  <div class="msg ai">
    <span class="label">StudyBuddy</span>
    <div class="bubble">👋 Hi! I'm your AI interview coach powered by Llama 3.3 on Cloudflare Workers AI.

Ask me anything — Java, Spring Boot, React, Kafka, system design, behavioral questions, or just say <strong>"quiz me"</strong> to practice!</div>
  </div>
</div>

<div class="suggestions" id="chips">
  <button class="chip" onclick="send('Explain microservices vs monolith')">Microservices vs Monolith</button>
  <button class="chip" onclick="send('What is JWT and how does it work?')">JWT Auth</button>
  <button class="chip" onclick="send('Quiz me on Java')">Quiz me on Java ⚡</button>
  <button class="chip" onclick="send('Tell me about yourself — give me a sample answer')">Tell me about yourself</button>
  <button class="chip" onclick="send('Explain Apache Kafka in simple terms')">Apache Kafka</button>
  <button class="chip" onclick="send('What questions should I ask the interviewer?')">Questions to ask</button>
</div>

<footer>
  <div class="input-row">
    <textarea id="input" rows="1" placeholder="Ask a question or say 'quiz me'…" oninput="autoResize(this)" onkeydown="handleKey(event)"></textarea>
    <button id="send" onclick="sendMessage()" title="Send">➤</button>
  </div>
  <p class="hint">Enter to send · Shift+Enter for new line · Your session is remembered 💾</p>
</footer>

<script>
  // ── Session ──────────────────────────────────────────────────────────────────
  let sessionId = localStorage.getItem('sb_session');
  if (!sessionId) {
    sessionId = 'session-' + Math.random().toString(36).slice(2, 10);
    localStorage.setItem('sb_session', sessionId);
  }

  const WS_URL = (location.protocol === 'https:' ? 'wss' : 'ws') +
    '://' + location.host + '/agents/study-buddy/' + sessionId;

  let ws;
  let pendingBubble = null;
  let pendingText = '';
  let msgId = 0;
  let connected = false;

  // ── WebSocket ────────────────────────────────────────────────────────────────
  function connect() {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      connected = true;
      document.getElementById('send').disabled = false;
    };

    ws.onclose = () => {
      connected = false;
      setTimeout(connect, 2000); // auto-reconnect
    };

    ws.onerror = () => ws.close();

    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        handleServerMessage(data);
      } catch (_) {}
    };
  }

  connect();

  // ── Message handling ─────────────────────────────────────────────────────────
  function handleServerMessage(data) {
    // Agents SDK streams text deltas and a final 'finish' event
    if (data.type === 'text-delta' || data.type === 'delta') {
      const delta = data.delta ?? data.text ?? '';
      pendingText += delta;
      if (pendingBubble) pendingBubble.textContent = pendingText;
    }

    if (data.type === 'finish' || data.type === 'done') {
      pendingBubble = null;
      pendingText = '';
      removeTyping();
      document.getElementById('send').disabled = false;
    }

    // Full message replacement (history sync)
    if (data.type === 'messages' || data.type === 'cf_agent_chat_messages_added') {
      // Rebuild or append from full message list — handled by delta above
    }
  }

  // ── Send ─────────────────────────────────────────────────────────────────────
  function sendMessage() {
    const input = document.getElementById('input');
    const text = input.value.trim();
    if (!text || !connected) return;

    // Append user bubble
    appendBubble('user', text);
    input.value = '';
    autoResize(input);

    // Show typing indicator + create AI bubble
    showTyping();
    pendingText = '';
    pendingBubble = createAIBubble();

    document.getElementById('send').disabled = true;

    // Send via WebSocket using Agents SDK format
    ws.send(JSON.stringify({
      type: 'cf_agent_chat_message',
      message: { role: 'user', content: text, id: 'msg-' + (++msgId) }
    }));
  }

  function send(text) {
    document.getElementById('input').value = text;
    sendMessage();
    document.getElementById('chips').style.display = 'none';
  }

  // ── DOM helpers ──────────────────────────────────────────────────────────────
  function appendBubble(role, text) {
    const chat = document.getElementById('chat');
    const msg = document.createElement('div');
    msg.className = 'msg ' + role;
    msg.innerHTML = \`<span class="label">\${role === 'user' ? 'You' : 'StudyBuddy'}</span>
      <div class="bubble">\${escHtml(text)}</div>\`;
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
  }

  function createAIBubble() {
    const chat = document.getElementById('chat');
    const msg = document.createElement('div');
    msg.className = 'msg ai';
    msg.id = 'ai-streaming';
    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'StudyBuddy';
    msg.appendChild(label);
    msg.appendChild(bubble);
    chat.appendChild(msg);
    chat.scrollTop = chat.scrollHeight;
    return bubble;
  }

  function showTyping() {
    const chat = document.getElementById('chat');
    const t = document.createElement('div');
    t.className = 'msg ai'; t.id = 'typing';
    t.innerHTML = \`<div class="bubble typing">
      <span class="dot"></span><span class="dot"></span><span class="dot"></span>
    </div>\`;
    chat.appendChild(t);
    chat.scrollTop = chat.scrollHeight;
  }

  function removeTyping() {
    const t = document.getElementById('typing');
    if (t) t.remove();
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
            .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function autoResize(el) {
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 140) + 'px';
  }

  function handleKey(e) {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  }
</script>
</body>
</html>`;
}
