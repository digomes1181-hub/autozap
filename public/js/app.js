document.addEventListener('DOMContentLoaded', () => {
  // Connect Socket.IO
  const socket = io();

  // Elements
  const statusBadge = document.getElementById('statusBadge');
  const statusText = document.getElementById('statusText');
  const qrPlaceholder = document.getElementById('qrPlaceholder');
  const qrImage = document.getElementById('qrImage');
  const connectedUser = document.getElementById('connectedUser');
  const userName = document.getElementById('userName');
  const userId = document.getElementById('userId');

  const btnConnect = document.getElementById('btnConnect');
  const btnPairingCode = document.getElementById('btnPairingCode');
  const btnDisconnect = document.getElementById('btnDisconnect');
  const pairingContainer = document.getElementById('pairingContainer');
  const pairingPhone = document.getElementById('pairingPhone');
  const btnSubmitPairing = document.getElementById('btnSubmitPairing');
  const pairingCodeDisplay = document.getElementById('pairingCodeDisplay');
  const pairingCodeVal = document.getElementById('pairingCodeVal');

  const messagesLog = document.getElementById('messagesLog');
  const statSent = document.getElementById('statSent');
  const statReceived = document.getElementById('statReceived');
  const statWebhooks = document.getElementById('statWebhooks');

  const sendMessageForm = document.getElementById('sendMessageForm');
  const configForm = document.getElementById('configForm');

  const cfgWebhookUrl = document.getElementById('cfgWebhookUrl');
  const btnTestWebhook = document.getElementById('btnTestWebhook');
  const webhookTestResult = document.getElementById('webhookTestResult');
  const cfgAiAutoRespond = document.getElementById('cfgAiAutoRespond');
  const cfgOpenaiKey = document.getElementById('cfgOpenaiKey');
  const cfgSystemPrompt = document.getElementById('cfgSystemPrompt');

  // Console Tabs & Live Chats
  const tabBtnLog = document.getElementById('tabBtnLog');
  const tabBtnChats = document.getElementById('tabBtnChats');
  const viewLiveFeed = document.getElementById('viewLiveFeed');
  const viewLiveChats = document.getElementById('viewLiveChats');

  const btnRefreshChats = document.getElementById('btnRefreshChats');
  const chatList = document.getElementById('chatList');
  const chatHeader = document.getElementById('chatHeader');
  const chatActiveName = document.getElementById('chatActiveName');
  const chatActiveJid = document.getElementById('chatActiveJid');
  const chkTakeoverAi = document.getElementById('chkTakeoverAi');
  const takeoverLabel = document.getElementById('takeoverLabel');
  const chatThread = document.getElementById('chatThread');
  const chatReplyForm = document.getElementById('chatReplyForm');
  const chatReplyText = document.getElementById('chatReplyText');

  let currentApiKey = 'sk_whatsapp_agent_secret_key_123';
  let selectedJid = null;

  // Fetch initial config
  fetchConfig();
  fetchChats();

  // Socket Event Handlers
  socket.on('status_change', (data) => {
    updateStatusUI(data.status, data.user);
    if (data.stats) {
      updateStatsUI(data.stats);
    }
  });

  socket.on('qr_update', (data) => {
    if (data.qr) {
      qrImage.src = data.qr;
      qrImage.classList.remove('hidden');
      qrPlaceholder.classList.add('hidden');
      connectedUser.classList.add('hidden');
    }
  });

  socket.on('new_message', (msg) => {
    appendLogMessage(msg);
    fetchChats();
    if (selectedJid && (msg.jid === selectedJid || msg.jid.startsWith(selectedJid.split('@')[0]))) {
      appendThreadMessage(msg);
    }
  });

  // Connection Actions
  btnConnect.addEventListener('click', async () => {
    try {
      pairingContainer.classList.add('hidden');
      const res = await fetch('/api/connect', { method: 'POST' });
      const data = await res.json();
      appendSystemLog(`[Conexão]: ${data.message}`);
    } catch (err) {
      appendSystemLog(`[Erro Conexão]: ${err.message}`);
    }
  });

  btnPairingCode.addEventListener('click', () => {
    pairingContainer.classList.toggle('hidden');
  });

  btnSubmitPairing.addEventListener('click', async () => {
    const phone = pairingPhone.value.trim();
    if (!phone) {
      alert('Por favor, informe o número de telefone.');
      return;
    }

    try {
      btnSubmitPairing.disabled = true;
      btnSubmitPairing.textContent = 'Gerando...';

      const res = await fetch('/api/connect-pairing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ number: phone })
      });
      const data = await res.json();

      if (data.success && data.pairingCode) {
        const formatted = data.pairingCode.match(/.{1,4}/g)?.join(' - ') || data.pairingCode;
        pairingCodeVal.textContent = formatted;
        pairingCodeDisplay.classList.remove('hidden');
        appendSystemLog(`🔑 Código de Pareamento Gerado: ${formatted}`);
      } else {
        alert(`Erro: ${data.details || data.error}`);
      }
    } catch (err) {
      alert(`Falha ao gerar código: ${err.message}`);
    } finally {
      btnSubmitPairing.disabled = false;
      btnSubmitPairing.textContent = 'Gerar';
    }
  });

  btnDisconnect.addEventListener('click', async () => {
    try {
      const res = await fetch('/api/disconnect', { method: 'POST' });
      const data = await res.json();
      appendSystemLog(`[Desconexão]: ${data.message}`);
    } catch (err) {
      appendSystemLog(`[Erro Desconexão]: ${err.message}`);
    }
  });

  // Console Views Switching
  tabBtnLog.addEventListener('click', () => {
    tabBtnLog.classList.add('active');
    tabBtnChats.classList.remove('active');
    viewLiveFeed.classList.remove('hidden');
    viewLiveFeed.classList.add('active');
    viewLiveChats.classList.add('hidden');
    viewLiveChats.classList.remove('active');
  });

  tabBtnChats.addEventListener('click', () => {
    tabBtnChats.classList.add('active');
    tabBtnLog.classList.remove('active');
    viewLiveChats.classList.remove('hidden');
    viewLiveChats.classList.add('active');
    viewLiveFeed.classList.add('hidden');
    viewLiveFeed.classList.remove('active');
    fetchChats();
  });

  btnRefreshChats.addEventListener('click', fetchChats);

  // Send Test Message Form
  sendMessageForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const number = document.getElementById('sendPhone').value.trim();
    const message = document.getElementById('sendMessageText').value.trim();

    if (!number || !message) return;

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey
        },
        body: JSON.stringify({ number, message })
      });
      const data = await res.json();

      if (data.success) {
        document.getElementById('sendMessageText').value = '';
        appendSystemLog(`✅ Mensagem enviada para ${number}`);
      } else {
        alert(`Erro: ${data.details || data.error}`);
      }
    } catch (err) {
      alert(`Falha na requisição: ${err.message}`);
    }
  });

  // Live Chat Reply Form
  chatReplyForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!selectedJid) return;
    const text = chatReplyText.value.trim();
    if (!text) return;

    try {
      const res = await fetch('/api/messages/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey
        },
        body: JSON.stringify({ to: selectedJid, message: text })
      });
      const data = await res.json();
      if (data.success) {
        chatReplyText.value = '';
      } else {
        alert(`Erro ao responder: ${data.details || data.error}`);
      }
    } catch (err) {
      alert(`Erro de conexão: ${err.message}`);
    }
  });

  // Human Takeover Toggle
  chkTakeoverAi.addEventListener('change', async () => {
    if (!selectedJid) return;
    const isPaused = chkTakeoverAi.checked;

    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(selectedJid)}/toggle-ai`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey
        },
        body: JSON.stringify({ paused: isPaused })
      });
      const data = await res.json();
      if (data.success) {
        updateTakeoverLabel(isPaused);
        fetchChats();
      }
    } catch (err) {
      console.error('Failed to toggle AI pause:', err);
    }
  });

  // Test Webhook Action
  btnTestWebhook.addEventListener('click', async () => {
    const url = cfgWebhookUrl.value.trim();
    if (!url) {
      alert('Por favor, informe a Webhook URL primeiro.');
      return;
    }

    webhookTestResult.classList.remove('hidden', 'test-success', 'test-error');
    webhookTestResult.textContent = 'Enviando disparo de teste...';

    try {
      const res = await fetch('/api/webhook/test', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey
        },
        body: JSON.stringify({ url })
      });
      const data = await res.json();

      if (data.success && data.data?.success) {
        webhookTestResult.classList.add('test-success');
        webhookTestResult.textContent = `✅ Sucesso HTTP ${data.data.status} (${data.data.responseTimeMs}ms) - Servidor respondeu OK!`;
      } else {
        webhookTestResult.classList.add('test-error');
        webhookTestResult.textContent = `❌ Falha HTTP ${data.data?.status || 500} - ${data.data?.error || data.error || 'Erro desconhecido'}`;
      }
    } catch (err) {
      webhookTestResult.classList.add('test-error');
      webhookTestResult.textContent = `❌ Erro de requisição: ${err.message}`;
    }
  });

  // Save Configuration Form
  configForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      webhookUrl: cfgWebhookUrl.value.trim(),
      aiAutoRespond: cfgAiAutoRespond.checked,
      openaiApiKey: cfgOpenaiKey.value.trim(),
      aiSystemPrompt: cfgSystemPrompt.value.trim()
    };

    try {
      const res = await fetch('/api/config', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': currentApiKey
        },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        alert('Configurações do Agente de I.A. salvas com sucesso!');
      }
    } catch (err) {
      alert(`Erro ao salvar configurações: ${err.message}`);
    }
  });

  // Tab switching logic for Developers Code Generator
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

      btn.classList.add('active');
      const tabId = btn.getAttribute('data-tab');
      document.getElementById(tabId).classList.add('active');
    });
  });

  // Helper Functions
  async function fetchConfig() {
    try {
      const res = await fetch('/api/config', {
        headers: { 'x-api-key': currentApiKey }
      });
      const data = await res.json();
      if (data.success && data.config) {
        cfgWebhookUrl.value = data.config.webhookUrl || '';
        cfgAiAutoRespond.checked = !!data.config.aiAutoRespond;
        cfgSystemPrompt.value = data.config.aiSystemPrompt || '';
      }
    } catch (err) {
      console.error('Failed to fetch config:', err);
    }
  }

  async function fetchChats() {
    try {
      const res = await fetch('/api/chats', {
        headers: { 'x-api-key': currentApiKey }
      });
      const data = await res.json();
      if (data.success && data.data) {
        renderChatList(data.data);
      }
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    }
  }

  function renderChatList(chats) {
    chatList.innerHTML = '';
    if (!chats || chats.length === 0) {
      chatList.innerHTML = '<div class="chat-empty">Nenhum chat ativo ainda.</div>';
      return;
    }

    chats.forEach(chat => {
      const item = document.createElement('div');
      item.className = `chat-item ${selectedJid === chat.jid ? 'active' : ''}`;

      const titleName = chat.pushName || chat.jid.split('@')[0];
      const aiBadge = chat.aiPaused ? '<span class="chat-badge-ai">IA Muted</span>' : '';

      item.innerHTML = `
        <div class="chat-item-name">
          <span>${escapeHtml(titleName)}</span>
          ${aiBadge}
        </div>
        <div class="chat-item-last">${escapeHtml(chat.lastMessage || '')}</div>
      `;

      item.addEventListener('click', () => selectChat(chat));
      chatList.appendChild(item);
    });
  }

  async function selectChat(chat) {
    selectedJid = chat.jid;
    renderChatList(await getChatsData());

    chatActiveName.textContent = chat.pushName || chat.jid.split('@')[0];
    chatActiveJid.textContent = chat.jid;
    chatHeader.classList.remove('hidden');
    chatReplyForm.classList.remove('hidden');

    chkTakeoverAi.checked = !!chat.aiPaused;
    updateTakeoverLabel(chat.aiPaused);

    fetchThreadMessages(chat.jid);
  }

  async function getChatsData() {
    try {
      const res = await fetch('/api/chats', { headers: { 'x-api-key': currentApiKey } });
      const data = await res.json();
      return data.data || [];
    } catch {
      return [];
    }
  }

  async function fetchThreadMessages(jid) {
    chatThread.innerHTML = '<div class="chat-empty-thread">Carregando mensagens...</div>';
    try {
      const res = await fetch(`/api/chats/${encodeURIComponent(jid)}/messages?limit=50`, {
        headers: { 'x-api-key': currentApiKey }
      });
      const data = await res.json();
      if (data.success && data.data) {
        chatThread.innerHTML = '';
        if (data.data.length === 0) {
          chatThread.innerHTML = '<div class="chat-empty-thread">Sem histórico recente.</div>';
        } else {
          data.data.forEach(msg => appendThreadMessage(msg));
        }
      }
    } catch (err) {
      chatThread.innerHTML = `<div class="chat-empty-thread">Erro ao carregar histórico: ${err.message}</div>`;
    }
  }

  function appendThreadMessage(msg) {
    const emptyNotice = chatThread.querySelector('.chat-empty-thread');
    if (emptyNotice) emptyNotice.remove();

    const bubble = document.createElement('div');
    const time = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    bubble.className = `chat-bubble ${msg.fromMe ? 'outbound' : 'inbound'}`;
    bubble.innerHTML = `
      <div>${escapeHtml(msg.text)}</div>
      <span class="chat-time">${time}</span>
    `;

    chatThread.appendChild(bubble);
    chatThread.scrollTop = chatThread.scrollHeight;
  }

  function updateTakeoverLabel(isPaused) {
    if (isPaused) {
      takeoverLabel.textContent = '🤖 IA Pausada (Atendimento Humano)';
      takeoverLabel.style.color = '#ef4444';
    } else {
      takeoverLabel.textContent = '🤖 IA Ativa (Auto-responder)';
      takeoverLabel.style.color = '#10b981';
    }
  }

  function updateStatusUI(status, user) {
    statusBadge.className = 'badge';
    if (status === 'CONNECTED') {
      statusBadge.classList.add('badge-connected');
      statusText.textContent = 'Conectado';
      qrImage.classList.add('hidden');
      qrPlaceholder.classList.add('hidden');
      connectedUser.classList.remove('hidden');
      btnConnect.classList.add('hidden');
      btnPairingCode.classList.add('hidden');
      pairingContainer.classList.add('hidden');
      btnDisconnect.classList.remove('hidden');

      if (user) {
        userName.textContent = user.name || 'WhatsApp Conectado';
        userId.textContent = user.id ? user.id.split(':')[0] : '';
      }
    } else if (status === 'QR_READY') {
      statusBadge.classList.add('badge-connecting');
      statusText.textContent = 'Aguardando QR Code';
      btnConnect.classList.add('hidden');
      btnDisconnect.classList.remove('hidden');
    } else if (status === 'CONNECTING') {
      statusBadge.classList.add('badge-connecting');
      statusText.textContent = 'Conectando...';
      btnConnect.classList.add('hidden');
      btnDisconnect.classList.remove('hidden');
    } else {
      statusBadge.classList.add('badge-disconnected');
      statusText.textContent = 'Desconectado';
      qrImage.classList.add('hidden');
      connectedUser.classList.add('hidden');
      qrPlaceholder.classList.remove('hidden');
      qrPlaceholder.querySelector('p').textContent = 'Clique em "Conectar" ou "Parear via Código" para conectar o WhatsApp.';
      btnConnect.classList.remove('hidden');
      btnPairingCode.classList.remove('hidden');
      btnDisconnect.classList.add('hidden');
    }
  }

  function updateStatsUI(stats) {
    if (stats.messagesSent !== undefined) statSent.textContent = stats.messagesSent;
    if (stats.messagesReceived !== undefined) statReceived.textContent = stats.messagesReceived;
    if (stats.webhooksTriggered !== undefined) statWebhooks.textContent = stats.webhooksTriggered;
  }

  function appendLogMessage(msg) {
    const div = document.createElement('div');
    const time = new Date(msg.timestamp).toLocaleTimeString();
    
    if (msg.fromMe) {
      div.className = 'log-entry log-outbound';
      div.innerHTML = `<strong>[${time}] Enviado para ${msg.jid.split('@')[0]}:</strong> ${escapeHtml(msg.text)}`;
    } else {
      div.className = 'log-entry log-inbound';
      div.innerHTML = `<strong>[${time}] Recebido de ${msg.pushName || msg.jid.split('@')[0]}:</strong> ${escapeHtml(msg.text)}`;
    }

    messagesLog.appendChild(div);
    messagesLog.scrollTop = messagesLog.scrollHeight;
  }

  function appendSystemLog(text) {
    const div = document.createElement('div');
    div.className = 'log-entry log-system';
    div.textContent = `[${new Date().toLocaleTimeString()}] ${text}`;
    messagesLog.appendChild(div);
    messagesLog.scrollTop = messagesLog.scrollHeight;
  }

  function escapeHtml(text) {
    return (text || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }
});
