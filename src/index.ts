import { AIChatAgent } from "agents";
import { createWorkersAI } from "workers-ai-provider";
import { streamText } from "ai";
import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
  AI: Ai;
  STUDY_BUDDY_AGENT: DurableObjectNamespace;
  SYSTEM_PROMPT: string;
}

export class StudyBuddyAgent extends AIChatAgent<Env> {
  async onChatMessage(
    onFinish: (result: { text: string }) => void
  ) {
    const workersai = createWorkersAI({ binding: this.env.AI });
    const systemPrompt =
      this.env.SYSTEM_PROMPT ||
      "You are StudyBuddy, an expert AI interview coach. Help the user prepare for technical interviews with clear, concise answers and practical examples.";

    const messages = this.messages.map((m: { role: string; content: string }) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
    }));

    const result = streamText({
      model: workersai("@cf/meta/llama-3.3-70b-instruct-fp8-fast"),
      system: systemPrompt,
      messages,
      onFinish,
    });

    return result.toDataStreamResponse();
  }
}

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.html(renderUI()));

app.all("/agents/*", async (c) => {
  const parts = new URL(c.req.url).pathname.split("/");
  const sessionId = parts[3] ?? "default";
  const id = c.env.STUDY_BUDDY_AGENT.idFromName(sessionId);
  const stub = c.env.STUDY_BUDDY_AGENT.get(id);
  return stub.fetch(c.req.raw);
});

export default app;

function renderUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>StudyBuddy — AI Interview Coach</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --bg: #0f1117; --surface: #1a1d27; --border: #2a2d3a;
      --accent: #6c63ff; --accent2: #a78bfa; --text: #e2e8f0;
      --muted: #94a3b8; --ai-bubble: #1e2130; --radius: 14px;
    }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: var(--bg); color: var(--text); height: 100dvh; display: flex; flex-direction: column; align-items: center; }
    header { width: 100%; max-width: 760px; padding: 18px 24px 14px; border-bottom: 1px solid var(--border); display: flex; align-items: center; gap: 12px; }
    .logo { width: 38px; height: 38px; background: linear-gradient(135deg, var(--accent), var(--accent2)); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 20px; }
    header h1 { font-size: 1.2rem; font-weight: 700; }
    header p { font-size: 0.78rem; color: var(--muted); margin-top: 1px; }
    .badge { margin-left: auto; background: rgba(108,99,255,0.15); color: var(--accent2); border: 1px solid rgba(108,99,255,0.3); font-size: 0.7rem; padding: 3px 10px; border-radius: 20px; }
    #chat { flex: 1; width: 100%; max-width: 760px; overflow-y: auto; padding: 24px 20px; display: flex; flex-direction: column; gap: 16px; scroll-behavior: smooth; }
    .msg { display: flex; flex-direction: column; max-width: 82%; gap: 4px; }
    .msg.user { align-self: flex-end; align-items: flex-end; }
    .msg.ai { align-self: flex-start; align-items: flex-start; }
    .bubble { padding: 12px 16px; border-radius: var(--radius); line-height: 1.6; font-size: 0.92rem; white-space: pre-wrap; word-break: break-word; }
    .msg.user .bubble { background: var(--accent); color: #fff; border-bottom-right-radius: 4px; }
    .msg.ai .bubble { background: var(--ai-bubble); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
    .label { font-size: 0.7rem; color: var(--muted); padding: 0 4px; }
    .typing { display: flex; gap: 5px; padding: 14px 16px; align-items: center; }
    .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--muted); animation: bounce 1.2s infinite; }
    .dot:nth-child(2) { animation-delay: 0.2s; }
    .dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes bounce { 0%,80%,100% { transform:translateY(0); } 40% { transform:translateY(-6px); } }
    .suggestions { display: flex; flex-wrap: wrap; gap: 8px; padding: 0 20px 8px; max-width: 760px; width: 100%; }
    .chip { background: var(--surface); border: 1px solid var(--border); color: var(--muted); font-size: 0.78rem; padding: 6px 14px; border-radius: 20px; cursor: pointer; transition: all .15s; }
    .chip:hover { border-color: var(--accent); color: var(--accent2); }
    footer { width: 100%; max-width: 760px; padding: 12px 20px 20px; border-top: 1px solid var(--border); }
    .input-row { display: flex; gap: 10px; align-items: flex-end; }
    textarea { flex: 1; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 0.92rem; padding: 12px 16px; resize: none; max-height: 140px; line-height: 1.5; outline: none; transition: border-color .15s; font-family: inherit; }
    textarea:focus { border-color: var(--accent); }
    textarea::placeholder { color: var(--muted); }
    button#send { background: var(--accent); border: none; border-radius: var(--radius); color: #fff; width: 44px; height: 44px; cursor: pointer; font-size: 1.1rem; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
    button#send:hover { background: var(--accent2); }
    button#send:disabled { opacity: 0.4; cursor: not-allowed; }
    .hint { font-size: 0.7rem; color: var(--muted); margin-top: 8px; text-align: center; }
  </style>
</head>
<body>
<header>
  <div class="logo">🎓</div>
  <div><h1>StudyBuddy</h1><p>AI-powered interview &amp; study coach</p></div>
  <span class="badge">Llama 3.3 · Cloudflare</span>
</header>
<div id="chat">
  <div class="msg ai">
    <span class="label">StudyBuddy</span>
    <div class="bubble">👋 Hi! I'm your AI interview coach powered by Llama 3.3 on Cloudflare Workers AI.

Ask me anything — Java, Spring Boot, React, Kafka, system design, or say quiz me to practice!</div>
  </div>
</div>
<div class="suggestions" id="chips">
  <button class="chip" onclick="send('Explain microservices vs monolith')">Microservices vs Monolith</button>
  <button class="chip" onclick="send('What is JWT and how does it work?')">JWT Auth</button>
  <button class="chip" onclick="send('Quiz me on Java')">Quiz me on Java ⚡</button>
  <button class="chip" onclick="send('Give me a sample answer for tell me about yourself')">Tell me about yourself</button>
  <button class="chip" onclick="send('Explain Apache Kafka in simple terms')">Apache Kafka</button>
  <button class="chip" onclick="send('What questions should I ask the interviewer?')">Questions to ask</button>
</div>
<footer>
  <div class="input-row">
    <textarea id="input" rows="1" placeholder="Ask a question or say 'quiz me'…" oninput="autoResize(this)" onkeydown="handleKey(event)"></textarea>
    <button id="send" onclick="sendMessage()">➤</button>
  </div>
  <p class="hint">Enter to send · Shift+Enter for new line · Session remembered 💾</p>
</footer>
<script>
  let sessionId = localStorage.getItem('sb_session');
  if (!sessionId) { sessionId = 'session-' + Math.random().toString(36).slice(2,10); localStorage.setItem('sb_session', sessionId); }
  const WS_URL = (location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/agents/study-buddy/'+sessionId;
  let ws, pendingBubble=null, pendingText='', msgId=0, connected=false;
  function connect() {
    ws = new WebSocket(WS_URL);
    ws.onopen  = () => { connected=true; document.getElementById('send').disabled=false; };
    ws.onclose = () => { connected=false; setTimeout(connect,2000); };
    ws.onerror = () => ws.close();
    ws.onmessage = (e) => { try { handle(JSON.parse(e.data)); } catch(_){} };
  }
  connect();
  function handle(d) {
    if (d.type==='text-delta'||d.type==='delta') { pendingText+=(d.delta??d.text??''); if(pendingBubble) { pendingBubble.textContent=pendingText; scroll(); } }
    if (d.type==='finish'||d.type==='done'||d.type==='text-finish') { pendingBubble=null; pendingText=''; removeTyping(); document.getElementById('send').disabled=false; }
  }
  function sendMessage() {
    const inp=document.getElementById('input'); const text=inp.value.trim();
    if(!text||!connected) return;
    addBubble('user',text); inp.value=''; autoResize(inp);
    showTyping(); pendingText=''; pendingBubble=aiB();
    document.getElementById('send').disabled=true;
    ws.send(JSON.stringify({type:'cf_agent_chat_message',message:{role:'user',content:text,id:'msg-'+(++msgId)}}));
  }
  function send(t) { document.getElementById('input').value=t; sendMessage(); document.getElementById('chips').style.display='none'; }
  function addBubble(r,t) { const c=document.getElementById('chat'); const m=document.createElement('div'); m.className='msg '+r; m.innerHTML='<span class="label">'+(r==='user'?'You':'StudyBuddy')+'</span><div class="bubble">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;')+'</div>'; c.appendChild(m); scroll(); }
  function aiB() { const c=document.getElementById('chat'); const m=document.createElement('div'); m.className='msg ai'; const l=document.createElement('span'); l.className='label'; l.textContent='StudyBuddy'; const b=document.createElement('div'); b.className='bubble'; m.appendChild(l); m.appendChild(b); c.appendChild(m); scroll(); return b; }
  function showTyping() { const c=document.getElementById('chat'); const t=document.createElement('div'); t.className='msg ai'; t.id='typing'; t.innerHTML='<div class="bubble typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>'; c.appendChild(t); scroll(); }
  function removeTyping() { const t=document.getElementById('typing'); if(t) t.remove(); }
  function scroll() { const c=document.getElementById('chat'); c.scrollTop=c.scrollHeight; }
  function autoResize(el) { el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,140)+'px'; }
  function handleKey(e) { if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendMessage();} }
</script>
</body>
</html>`;
}
