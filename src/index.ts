import { Hono } from "hono";
import { cors } from "hono/cors";

export interface Env {
  AI: Ai;
  STUDY_BUDDY_AGENT: DurableObjectNamespace;
}

// ─── Durable Object ───────────────────────────────────────────────────────────

export class StudyBuddyAgent implements DurableObject {
  private history: { role: "user" | "assistant"; content: string }[] = [];

  constructor(private state: DurableObjectState, private env: Env) {
    this.state.blockConcurrencyWhile(async () => {
      const saved = await this.state.storage.get<{ role: "user" | "assistant"; content: string }[]>("history");
      if (saved) this.history = saved;
    });
  }

  async fetch(request: Request): Promise<Response> {
    const upgrade = request.headers.get("Upgrade");
    if (upgrade?.toLowerCase() === "websocket") {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      this.state.acceptWebSocket(server);
      // Send history on connect
      server.send(JSON.stringify({ type: "history", messages: this.history }));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("Expected WebSocket", { status: 400 });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    try {
      const data = JSON.parse(raw as string);
      if (data.type !== "chat") return;

      const userMsg: { role: "user" | "assistant"; content: string } = {
        role: "user",
        content: data.content,
      };
      this.history.push(userMsg);

      const messages = [
        {
          role: "system" as const,
          content:
            "You are StudyBuddy, an expert AI interview coach for software engineers. Help users prepare for technical interviews. Give clear, concise answers with examples. Be encouraging and supportive.",
        },
        ...this.history,
      ];

      // Use non-streaming for reliability
      const response = await (this.env.AI as any).run(
        "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
        { messages }
      ) as { response: string };

      const reply = response?.response ?? "Sorry, I could not generate a response.";

      // Send as delta then done (keeps client code working)
      ws.send(JSON.stringify({ type: "delta", text: reply }));
      ws.send(JSON.stringify({ type: "done" }));

      this.history.push({ role: "assistant", content: reply });

      // Keep history to last 20 messages to avoid token limits
      if (this.history.length > 20) {
        this.history = this.history.slice(-20);
      }

      await this.state.storage.put("history", this.history);
    } catch (err: any) {
      console.error("AI error:", err);
      ws.send(JSON.stringify({ type: "error", text: "AI error: " + (err?.message ?? "unknown") }));
    }
  }

  async webSocketClose(ws: WebSocket) {}
  async webSocketError(ws: WebSocket) {}
}

// ─── Worker ───────────────────────────────────────────────────────────────────

const app = new Hono<{ Bindings: Env }>();
app.use("*", cors({ origin: "*" }));

app.get("/", (c) => c.html(renderUI()));

app.all("/chat/:sessionId", async (c) => {
  const sessionId = c.req.param("sessionId") ?? "default";
  const id = c.env.STUDY_BUDDY_AGENT.idFromName(sessionId);
  const stub = c.env.STUDY_BUDDY_AGENT.get(id);
  return stub.fetch(c.req.raw);
});

export default app;

// ─── UI ───────────────────────────────────────────────────────────────────────

function renderUI(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1.0"/>
  <title>StudyBuddy — AI Interview Coach</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{--bg:#0f1117;--surface:#1a1d27;--border:#2a2d3a;--accent:#6c63ff;--accent2:#a78bfa;--text:#e2e8f0;--muted:#94a3b8;--ai-bubble:#1e2130;--r:14px}
    body{font-family:'Segoe UI',system-ui,sans-serif;background:var(--bg);color:var(--text);height:100dvh;display:flex;flex-direction:column;align-items:center}
    header{width:100%;max-width:760px;padding:18px 24px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:12px}
    .logo{width:38px;height:38px;background:linear-gradient(135deg,var(--accent),var(--accent2));border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px}
    header h1{font-size:1.2rem;font-weight:700}
    header p{font-size:.78rem;color:var(--muted);margin-top:1px}
    .badge{margin-left:auto;background:rgba(108,99,255,.15);color:var(--accent2);border:1px solid rgba(108,99,255,.3);font-size:.7rem;padding:3px 10px;border-radius:20px}
    #chat{flex:1;width:100%;max-width:760px;overflow-y:auto;padding:24px 20px;display:flex;flex-direction:column;gap:16px;scroll-behavior:smooth}
    .msg{display:flex;flex-direction:column;max-width:82%;gap:4px}
    .msg.user{align-self:flex-end;align-items:flex-end}
    .msg.ai{align-self:flex-start;align-items:flex-start}
    .bubble{padding:12px 16px;border-radius:var(--r);line-height:1.6;font-size:.92rem;white-space:pre-wrap;word-break:break-word}
    .msg.user .bubble{background:var(--accent);color:#fff;border-bottom-right-radius:4px}
    .msg.ai .bubble{background:var(--ai-bubble);border:1px solid var(--border);border-bottom-left-radius:4px}
    .label{font-size:.7rem;color:var(--muted);padding:0 4px}
    .typing{display:flex;gap:5px;padding:14px 16px;align-items:center}
    .dot{width:7px;height:7px;border-radius:50%;background:var(--muted);animation:bounce 1.2s infinite}
    .dot:nth-child(2){animation-delay:.2s}.dot:nth-child(3){animation-delay:.4s}
    @keyframes bounce{0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
    .chips{display:flex;flex-wrap:wrap;gap:8px;padding:0 20px 8px;max-width:760px;width:100%}
    .chip{background:var(--surface);border:1px solid var(--border);color:var(--muted);font-size:.78rem;padding:6px 14px;border-radius:20px;cursor:pointer;transition:all .15s}
    .chip:hover{border-color:var(--accent);color:var(--accent2)}
    footer{width:100%;max-width:760px;padding:12px 20px 20px;border-top:1px solid var(--border)}
    .row{display:flex;gap:10px;align-items:flex-end}
    textarea{flex:1;background:var(--surface);border:1px solid var(--border);border-radius:var(--r);color:var(--text);font-size:.92rem;padding:12px 16px;resize:none;max-height:140px;line-height:1.5;outline:none;transition:border-color .15s;font-family:inherit}
    textarea:focus{border-color:var(--accent)}
    textarea::placeholder{color:var(--muted)}
    #btn{background:var(--accent);border:none;border-radius:var(--r);color:#fff;width:44px;height:44px;cursor:pointer;font-size:1.1rem;flex-shrink:0;display:flex;align-items:center;justify-content:center;transition:background .15s}
    #btn:hover{background:var(--accent2)}
    #btn:disabled{opacity:.4;cursor:not-allowed}
    .hint{font-size:.7rem;color:var(--muted);margin-top:8px;text-align:center}
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
    <div class="bubble">👋 Hi! I'm your AI interview coach powered by Llama 3.3 on Cloudflare.
Ask me anything — Java, Spring Boot, React, Kafka, system design — or say "quiz me"!</div>
  </div>
</div>
<div class="chips" id="chips">
  <button class="chip" onclick="qs('Explain microservices vs monolith')">Microservices vs Monolith</button>
  <button class="chip" onclick="qs('What is JWT and how does it work?')">JWT Auth</button>
  <button class="chip" onclick="qs('Quiz me on Java')">Quiz me on Java ⚡</button>
  <button class="chip" onclick="qs('Give me a sample answer for tell me about yourself')">Tell me about yourself</button>
  <button class="chip" onclick="qs('Explain Apache Kafka simply')">Apache Kafka</button>
  <button class="chip" onclick="qs('What questions should I ask the interviewer?')">Questions to ask</button>
</div>
<footer>
  <div class="row">
    <textarea id="inp" rows="1" placeholder="Ask anything…" oninput="resize(this)" onkeydown="key(event)"></textarea>
    <button id="btn" onclick="send()">➤</button>
  </div>
  <p class="hint">Enter to send · Shift+Enter new line · Session remembered 💾</p>
</footer>
<script>
  let sid=localStorage.getItem('sb')||('s'+Math.random().toString(36).slice(2,9));
  localStorage.setItem('sb',sid);
  const WS=(location.protocol==='https:'?'wss':'ws')+'://'+location.host+'/chat/'+sid;
  let ws,bubble=null,text='',on=false;
  function conn(){
    ws=new WebSocket(WS);
    ws.onopen=()=>{on=true;document.getElementById('btn').disabled=false};
    ws.onclose=()=>{on=false;setTimeout(conn,2000)};
    ws.onerror=()=>ws.close();
    ws.onmessage=(e)=>{
      try{
        const d=JSON.parse(e.data);
        if(d.type==='history'){
          document.getElementById('chat').innerHTML='<div class="msg ai"><span class="label">StudyBuddy</span><div class="bubble">👋 Hi! I\'m your AI interview coach powered by Llama 3.3 on Cloudflare.\\nAsk me anything — Java, Spring Boot, React, Kafka, system design — or say \\"quiz me\\"!</div></div>';
          d.messages.forEach(m=>addB(m.role==='user'?'user':'ai',m.content));
        }
        if(d.type==='delta'){text+=d.text;if(bubble)bubble.textContent=text;sc()}
        if(d.type==='done'){bubble=null;text='';rmTyping();document.getElementById('btn').disabled=false}
        if(d.type==='error'){bubble=null;text='';rmTyping();addB('ai','⚠️ '+d.text);document.getElementById('btn').disabled=false}
      }catch(err){console.error(err)}
    };
  }
  conn();
  function send(){
    const inp=document.getElementById('inp'),t=inp.value.trim();
    if(!t||!on)return;
    addB('user',t);inp.value='';resize(inp);
    showTyping();text='';bubble=mkB();
    document.getElementById('btn').disabled=true;
    ws.send(JSON.stringify({type:'chat',content:t}));
  }
  function qs(t){document.getElementById('inp').value=t;send();document.getElementById('chips').style.display='none'}
  function addB(r,t){
    const c=document.getElementById('chat');
    const m=document.createElement('div');m.className='msg '+r;
    m.innerHTML='<span class="label">'+(r==='user'?'You':'StudyBuddy')+'</span><div class="bubble">'+t.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/\n/g,'<br>')+'</div>';
    c.appendChild(m);sc();
  }
  function mkB(){
    const c=document.getElementById('chat');
    const m=document.createElement('div');m.className='msg ai';
    const l=document.createElement('span');l.className='label';l.textContent='StudyBuddy';
    const b=document.createElement('div');b.className='bubble';
    m.appendChild(l);m.appendChild(b);c.appendChild(m);sc();return b;
  }
  function showTyping(){
    const c=document.getElementById('chat');
    const t=document.createElement('div');t.className='msg ai';t.id='typ';
    t.innerHTML='<div class="bubble typing"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
    c.appendChild(t);sc();
  }
  function rmTyping(){const t=document.getElementById('typ');if(t)t.remove()}
  function sc(){const c=document.getElementById('chat');c.scrollTop=c.scrollHeight}
  function resize(el){el.style.height='auto';el.style.height=Math.min(el.scrollHeight,140)+'px'}
  function key(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}
</script>
</body>
</html>`;
}
