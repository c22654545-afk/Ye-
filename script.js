// ===== CONFIG - REPLACE BEFORE USE =====
const DISCORD_CLIENT_ID = "1425187145953448127";
const REDIRECT_URI = "https://095d2c74-abf7-409e-bbe6-d7b41546e93f-00-1t1wecju9p46c.picard.replit.dev/"; // must match Discord app redirect URI exactly
const DISCORD_WEBHOOK_URL = "https://discord.com/api/webhooks/1425543224436461780/aA7jkvaIpEwnzYhvS9o7DwcpLKpniRXlBXQNV5RtFbKuG6kFzyP7p1Qnig_33bjw1hf7"; // optional
const GROQ_API_KEY = "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"; // only for local testing; prefer /api/chat proxy

// ===== ELEMENT SELECTORS =====
const loginPage = document.getElementById("login-page");
const chatPage = document.getElementById("chat-page");
const discordLoginBtn = document.getElementById("discord-login");
const chatBox = document.getElementById("chat-box");
const userInput = document.getElementById("user-input");
const sendBtn = document.getElementById("send-btn");
const profileArea = document.getElementById("profile-area");
const profileDropdown = document.getElementById("profile-dropdown");
const logoutBtn = document.getElementById("logout-btn");
const menuBtn = document.getElementById("menu-btn");
const menuDropdown = document.getElementById("menu-dropdown");
const newChatBtn = document.getElementById("new-chat");
const oldChatBtn = document.getElementById("old-chat");
const oldChatModal = document.getElementById("old-chat-modal");
const oldChatList = document.getElementById("old-chat-list");
const closeOldChat = document.getElementById("close-old-chat");

// ===== STATE =====
let userData = null;
let chatMemory = JSON.parse(localStorage.getItem("cloud_ai_memory") || "[]");

// ===== UTIL =====
function saveMemory(){ localStorage.setItem("cloud_ai_memory", JSON.stringify(chatMemory)); }
function escapeHtml(s=""){ return String(s).replace(/[&<>"'`=\/]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;','`':'&#x60;','=':'&#x3D;'}[ch])); }

/* create message DOM element and return the message element (so we can update bot text) */
function createMessageElement(text, sender, avatarUrl=""){
  const wrapper = document.createElement("div");
  wrapper.className = `message-wrapper ${sender}`;

  const avatar = document.createElement("div");
  avatar.className = `avatar ${sender}`;

  if(sender === "user"){
    if(avatarUrl){
      const img = document.createElement("img");
      img.src = avatarUrl;
      img.alt = "pfp";
      img.style.width = "36px";
      img.style.height = "36px";
      img.style.borderRadius = "50%";
      avatar.appendChild(img);
    }
  } else {
    avatar.textContent = "☁️";
  }

  const msg = document.createElement("div");
  msg.className = "message";
  msg.textContent = text;

  if(sender === "user"){
    wrapper.appendChild(msg);
    wrapper.appendChild(avatar);
  } else {
    wrapper.appendChild(avatar);
    wrapper.appendChild(msg);
  }

  chatBox.appendChild(wrapper);
  chatBox.scrollTop = chatBox.scrollHeight;
  return msg;
}

// ===== AUTH FLOW =====
discordLoginBtn.addEventListener("click", () => {
  const scope = "identify%20email";
  const url = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=token&scope=${scope}`;
  window.location.href = url;
});

async function initAuth(){
  // grab token from hash if present (implicit flow)
  if(window.location.hash.includes("access_token")){
    const token = new URLSearchParams(window.location.hash.substring(1)).get("access_token");
    if(token) sessionStorage.setItem("discord_token", token);
    // tidy url
    history.replaceState(null, "", REDIRECT_URI);
  }

  const token = sessionStorage.getItem("discord_token");
  if(!token){
    // not logged in
    loginPage.style.display = "block";
    chatPage.style.display = "none";
    return;
  }

  try{
    const res = await fetch("https://discord.com/api/users/@me", { headers: { Authorization: `Bearer ${token}` } });
    if(!res.ok){
      sessionStorage.removeItem("discord_token");
      loginPage.style.display = "block";
      chatPage.style.display = "none";
      return;
    }
    userData = await res.json();
    showChatUI();
    sendWebhook("login", userData);
  } catch(err){
    console.error("Auth error", err);
    sessionStorage.removeItem("discord_token");
    loginPage.style.display = "block";
    chatPage.style.display = "none";
  }
}

// show chat UI and populate saved messages
function showChatUI(){
  loginPage.style.display = "none";
  chatPage.style.display = "block";
  chatBox.innerHTML = "";
  const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : `https://cdn.discordapp.com/embed/avatars/${parseInt(userData.discriminator||'0')%5}.png`;
  chatMemory.forEach(m => {
    const sender = m.role === "assistant" ? "bot" : "user";
    createMessageElement(m.content, sender, avatarUrl);
  });
  // show PFP and hook dropdown
  profileArea.innerHTML = `<img src="${avatarUrl}" alt="pfp">`;
  profileArea.onclick = (e) => {
    e.stopPropagation();
    // toggle small logout dropdown
    profileDropdown.style.display = profileDropdown.style.display === "block" ? "none" : "block";
  };
  // logout button
  logoutBtn.onclick = () => {
    if(confirm("Logout now?")){
      sendWebhook("logout", userData);
      sessionStorage.removeItem("discord_token");
      userData = null;
      loginPage.style.display = "block";
      chatPage.style.display = "none";
      profileDropdown.style.display = "none";
    }
  };
}

// close dropdowns when clicking outside
document.addEventListener("click", () => {
  if(menuDropdown) menuDropdown.style.display = "none";
  if(profileDropdown) profileDropdown.style.display = "none";
});

// ===== WEBHOOK (login/logout/new/delete) =====
function sendWebhook(kind, usr = {}) {
  if(!DISCORD_WEBHOOK_URL) return;
  const color = kind === "login" ? 15844367 : kind === "logout" ? 15158332 : 3447003;
  const embed = {
    title: kind === "login" ? "User Logged In" : kind === "logout" ? "User Logged Out" : kind === "delete" ? "Chat Deleted" : "New Chat",
    color,
    fields: [
      { name: "Username", value: `${usr.username || "Unknown"}#${usr.discriminator || "0000"}`, inline: true },
      { name: "User ID", value: usr.id || "Unknown", inline: true },
      { name: "Email", value: usr.email || "No email", inline: false }
    ],
    timestamp: new Date().toISOString()
  };
  fetch(DISCORD_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed] })
  }).catch(e => console.warn("Webhook send error", e));
}

// ===== SENDING MESSAGES =====
sendBtn.addEventListener("click", handleSend);
userInput.addEventListener("keypress", e => { if(e.key === "Enter" && !e.shiftKey){ e.preventDefault(); handleSend(); } });

async function handleSend(){
  const text = userInput.value.trim();
  if(!text) return;

  const avatarUrl = userData && userData.avatar ? `https://cdn.discordapp.com/avatars/${userData.id}/${userData.avatar}.png?size=128` : "";
  // show user message
  createMessageElement(text, "user", avatarUrl);
  chatMemory.push({ role: "user", content: text });
  saveMemory();
  userInput.value = "";

  // create bot typing element and keep reference to replace
  const botEl = createMessageElement("Thinking...", "bot");
  botEl.classList.add("typing");

  // Simple local auto replies
  if(/who are you/i.test(text)){
    const reply = "I'm Cloud Ai, your friendly assistant.";
    replaceBot(botEl, reply);
    chatMemory.push({ role: "assistant", content: reply });
    saveMemory();
    return;
  }
  if(/who is your owner/i.test(text)){
    const reply = "I'm owned by Calvin, my owner and developer.";
    replaceBot(botEl, reply);
    chatMemory.push({ role: "assistant", content: reply });
    saveMemory();
    return;
  }
  if(/model/i.test(text)){
    const reply = "I'm Cloud Ai — I don’t share internal model info.";
    replaceBot(botEl, reply);
    chatMemory.push({ role: "assistant", content: reply });
    saveMemory();
    return;
  }

  // Try /api/chat proxy first (recommended)
  try{
    const proxyResp = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: text, memory: chatMemory })
    });
    if(proxyResp.ok){
      const data = await proxyResp.json();
      const reply = data?.choices?.[0]?.message?.content || data?.error?.message || "No reply";
      replaceBot(botEl, reply);
      chatMemory.push({ role: "assistant", content: reply });
      saveMemory();
      return;
    }
  }catch(e){
    console.warn("/api/chat proxy failed:", e);
  }

  // Fallback: direct Groq call (may fail due to CORS; not secure for production)
  try{
    const resp = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type":"application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
      body: JSON.stringify({ model: "openai/gpt-oss-20b", messages: chatMemory, temperature:1, max_completion_tokens:1024, top_p:1 })
    });
    const data = await resp.json();
    const reply = data?.choices?.[0]?.message?.content || data?.error?.message || "No reply";
    replaceBot(botEl, reply);
    chatMemory.push({ role: "assistant", content: reply });
    saveMemory();
  }catch(err){
    replaceBot(botEl, "⚠️ Error: " + (err.message || err));
  }
}

function replaceBot(botEl, text){
  botEl.classList.remove("typing");
  botEl.textContent = "";
  let i = 0;
  const interval = setInterval(() => {
    botEl.textContent += text.charAt(i) || "";
    i++;
    if(i > text.length) clearInterval(interval);
  }, 12);
}

// ===== MENU & OLD CHATS UI =====
menuBtn.addEventListener("click", e => {
  e.stopPropagation();
  menuDropdown.style.display = menuDropdown.style.display === "block" ? "none" : "block";
});

newChatBtn.addEventListener("click", () => {
  if(!confirm("Start a new chat? This will clear current conversation locally.")) return;
  chatMemory = [];
  saveMemory();
  chatBox.innerHTML = "";
  sendWebhook("new", userData || {});
  menuDropdown.style.display = "none";
});

oldChatBtn.addEventListener("click", () => {
  renderOldChats();
  oldChatModal.style.display = "flex";
  menuDropdown.style.display = "none";
});

closeOldChat?.addEventListener("click", () => { oldChatModal.style.display = "none"; });

function renderOldChats(){
  if(!oldChatList) return;
  oldChatList.innerHTML = "";
  if(chatMemory.length === 0){
    const li = document.createElement("li");
    li.textContent = "No saved messages yet.";
    oldChatList.appendChild(li);
    return;
  }
  // Show messages as a list (each entry deletable via long-press or right-click)
  chatMemory.forEach((m, idx) => {
    const li = document.createElement("li");
    li.textContent = `[${m.role}] ${m.content.length > 120 ? m.content.slice(0,120) + "…" : m.content}`;
    // right-click / long-press to delete
    li.addEventListener("contextmenu", (ev) => {
      ev.preventDefault();
      if(!confirm("Delete this message from history?")) return;
      chatMemory.splice(idx, 1);
      saveMemory();
      renderOldChats();
      sendWebhook("delete", userData || {});
    });
    // mobile: long-press detection
    let pressTimer = null;
    li.addEventListener("touchstart", () => {
      pressTimer = setTimeout(() => {
        if(confirm("Delete this message from history?")) {
          chatMemory.splice(idx,1);
          saveMemory();
          renderOldChats();
          sendWebhook("delete", userData || {});
        }
      }, 700);
    });
    li.addEventListener("touchend", () => { if(pressTimer) clearTimeout(pressTimer); });
    oldChatList.appendChild(li);
  });
}

// initialize
initAuth();
