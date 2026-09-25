import { getStore } from '@netlify/blobs';
import { webhookService } from '../../src/services/webhook.js';

const DEFAULT_CONFIG = {
  webhookUrl: '',
  aiAutoRespond: false,
  aiProvider: 'openai',
  openaiApiKey: '',
  openaiModel: 'gpt-4o-mini',
  aiSystemPrompt: 'Você é um assistente virtual inteligente atendendo no WhatsApp. Seja cortês, claro e objetivo.',
};

const UNAVAILABLE_MESSAGE =
  'Esta implantação roda em funções serverless do Netlify. O motor de WhatsApp (Baileys) precisa de uma conexão ' +
  'WebSocket sempre ativa e de uma sessão salva em disco, o que não é possível em funções serverless de curta ' +
  'duração. Para conectar um número real, hospede o motor do bot em um servidor persistente (VPS, Fly.io, Railway, ' +
  'Render, etc). O restante do painel (configurações e teste de webhook) funciona normalmente nesta implantação.';

function configStore() {
  return getStore({ name: 'agent-config', consistency: 'strong' });
}

async function loadConfig() {
  const saved = await configStore().get('settings', { type: 'json' });
  return { ...DEFAULT_CONFIG, ...(saved || {}) };
}

async function saveConfig(patch) {
  const next = { ...(await loadConfig()), ...patch };
  await configStore().setJSON('settings', next);
  return next;
}

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init.headers || {}) },
  });
}

function isAuthorized(req, expectedKey) {
  if (!expectedKey) return true;
  const header = req.headers.get('x-api-key') || req.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  const provided = header || new URL(req.url).searchParams.get('api_key');
  return provided === expectedKey;
}

function toPublicConfig(cfg, apiKey) {
  return {
    webhookUrl: cfg.webhookUrl,
    aiAutoRespond: cfg.aiAutoRespond,
    aiProvider: cfg.aiProvider,
    openaiModel: cfg.openaiModel,
    aiSystemPrompt: cfg.aiSystemPrompt,
    apiKeySet: !!apiKey,
  };
}

export default async (req) => {
  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api/, '') || '/';
  const method = req.method;
  const apiKey = Netlify.env.get('API_KEY') || '';

  // Public routes (match the original app's unauthenticated connection endpoints)
  if (method === 'GET' && path === '/status') {
    return json({
      status: 'UNAVAILABLE',
      reason: 'serverless_no_persistent_connection',
      message: UNAVAILABLE_MESSAGE,
      apiKey,
      stats: { messagesSent: 0, messagesReceived: 0, webhooksTriggered: 0, totalChats: 0, totalContacts: 0 },
    });
  }

  if (method === 'GET' && path === '/qr') {
    return json({ qr: null, status: 'UNAVAILABLE', message: UNAVAILABLE_MESSAGE });
  }

  if (method === 'POST' && path === '/connect') {
    return json({ message: UNAVAILABLE_MESSAGE, status: 'UNAVAILABLE' }, { status: 501 });
  }

  if (method === 'POST' && path === '/connect-pairing') {
    return json(
      { success: false, error: 'Pareamento indisponível nesta implantação', details: UNAVAILABLE_MESSAGE },
      { status: 501 }
    );
  }

  if (method === 'POST' && path === '/disconnect') {
    return json({ message: 'Nenhuma sessão ativa nesta implantação.', status: 'UNAVAILABLE' });
  }

  // Everything below mirrors the original router.use(apiKeyAuth) boundary
  if (!isAuthorized(req, apiKey)) {
    return json(
      {
        error: 'Não autorizado',
        message:
          'Chave de API inválida ou ausente. Forneça a chave no cabeçalho x-api-key ou Authorization: Bearer <key>',
      },
      { status: 401 }
    );
  }

  if (method === 'POST' && path === '/messages/send') {
    return json(
      { success: false, error: 'Envio de mensagens indisponível nesta implantação', details: UNAVAILABLE_MESSAGE },
      { status: 501 }
    );
  }

  if (method === 'POST' && path === '/messages/send-media') {
    return json(
      { success: false, error: 'Envio de mídia indisponível nesta implantação', details: UNAVAILABLE_MESSAGE },
      { status: 501 }
    );
  }

  if (method === 'GET' && path === '/chats') {
    return json({ success: true, data: [] });
  }

  const messagesMatch = path.match(/^\/chats\/([^/]+)\/messages$/);
  if (method === 'GET' && messagesMatch) {
    return json({ success: true, jid: decodeURIComponent(messagesMatch[1]), total: 0, data: [] });
  }

  const toggleAiMatch = path.match(/^\/chats\/([^/]+)\/toggle-ai$/);
  if (method === 'POST' && toggleAiMatch) {
    const jid = decodeURIComponent(toggleAiMatch[1]);
    const body = await req.json().catch(() => ({}));
    const isPaused = Boolean(body.paused);
    return json({
      success: true,
      jid,
      aiPaused: isPaused,
      message: isPaused ? 'IA pausada para este chat.' : 'IA reativada para este chat.',
    });
  }

  if (method === 'GET' && path === '/contacts') {
    return json({ success: true, data: [] });
  }

  if (method === 'POST' && path === '/webhook/test') {
    const body = await req.json().catch(() => ({}));
    try {
      const result = await webhookService.testWebhook(body.url);
      return json({ success: result.success, data: result });
    } catch (error) {
      return json({ success: false, error: 'Erro ao testar webhook', details: error.message }, { status: 500 });
    }
  }

  if (method === 'GET' && path === '/config') {
    const cfg = await loadConfig();
    return json({ success: true, config: toPublicConfig(cfg, apiKey) });
  }

  if (method === 'POST' && path === '/config') {
    const body = await req.json().catch(() => ({}));
    const patch = {};
    for (const key of ['webhookUrl', 'aiProvider', 'openaiApiKey', 'openaiModel', 'aiSystemPrompt']) {
      if (body[key] !== undefined) patch[key] = body[key];
    }
    if (body.aiAutoRespond !== undefined) patch.aiAutoRespond = Boolean(body.aiAutoRespond);

    const cfg = await saveConfig(patch);
    return json({
      success: true,
      message: 'Configurações atualizadas com sucesso!',
      config: toPublicConfig(cfg, apiKey),
    });
  }

  return json({ error: 'Rota não encontrada' }, { status: 404 });
};

export const config = {
  path: '/api/*',
};
