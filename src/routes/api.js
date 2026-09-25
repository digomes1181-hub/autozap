import express from 'express';
import { whatsappService } from '../services/whatsapp.js';
import { storage } from '../services/storage.js';
import { webhookService } from '../services/webhook.js';
import { config } from '../config.js';
import { apiKeyAuth } from '../middleware/auth.js';
import { upload } from '../middleware/upload.js';

const router = express.Router();

// Status & QR Endpoints (Public or Protected depending on workflow)
router.get('/status', (req, res) => {
  res.json(whatsappService.getStatus());
});

router.get('/qr', (req, res) => {
  res.json(whatsappService.getQR());
});

router.post('/connect', async (req, res) => {
  try {
    await whatsappService.initialize();
    res.json({ message: 'Inicializando conexão com o WhatsApp...', status: whatsappService.status });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao inicializar conexão', details: error.message });
  }
});

router.post('/connect-pairing', async (req, res) => {
  try {
    const { number, phone } = req.body;
    const targetPhone = number || phone;
    const code = await whatsappService.requestPairingCode(targetPhone);
    res.json({ success: true, pairingCode: code, message: 'Código de pareamento gerado com sucesso. Insira no seu WhatsApp em Dispositivos Conectados -> Conectar com número.' });
  } catch (error) {
    res.status(500).json({ success: false, error: 'Falha ao solicitar código de pareamento', details: error.message });
  }
});

router.post('/disconnect', async (req, res) => {
  try {
    await whatsappService.logout();
    res.json({ message: 'Sessão do WhatsApp desconectada com sucesso.' });
  } catch (error) {
    res.status(500).json({ error: 'Erro ao desconectar', details: error.message });
  }
});

// Protect all messaging and data endpoints with API Key Auth
router.use(apiKeyAuth);

/**
 * @route POST /api/messages/send
 * @desc Envia mensagem de texto para contato do WhatsApp (para Agentes de IA)
 */
router.post('/messages/send', async (req, res) => {
  try {
    const { number, to, text, message } = req.body;
    const recipient = number || to;
    const messageText = text || message;

    if (!recipient || !messageText) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        message: 'É necessário fornecer "number" (ex: "5511999999999") e "message" / "text".'
      });
    }

    const sentMessage = await whatsappService.sendMessage(recipient, messageText);
    res.json({
      success: true,
      message: 'Mensagem enviada com sucesso',
      data: sentMessage
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Falha ao enviar mensagem',
      details: error.message
    });
  }
});

/**
 * @route POST /api/messages/send-media
 * @desc Envia arquivo (imagem, áudio, vídeo, PDF/doc) para contato
 */
router.post('/messages/send-media', upload.single('file'), async (req, res) => {
  try {
    const { number, to, caption } = req.body;
    const recipient = number || to;

    if (!recipient || !req.file) {
      return res.status(400).json({
        error: 'Parâmetros inválidos',
        message: 'É necessário enviar o campo "number" e um arquivo no formulário (multipart/form-data com o campo "file").'
      });
    }

    const sentMedia = await whatsappService.sendMedia(
      recipient,
      req.file.buffer,
      req.file.mimetype,
      req.file.originalname,
      caption || ''
    );

    res.json({
      success: true,
      message: 'Mídia enviada com sucesso',
      data: sentMedia
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Falha ao enviar mídia',
      details: error.message
    });
  }
});

/**
 * @route GET /api/chats
 * @desc Retorna lista de conversas ativas
 */
router.get('/chats', (req, res) => {
  res.json({
    success: true,
    data: storage.getChats()
  });
});

/**
 * @route GET /api/chats/:jid/messages
 * @desc Retorna histórico de mensagens para contexto da IA
 */
router.get('/chats/:jid/messages', (req, res) => {
  const { jid } = req.params;
  const limit = parseInt(req.query.limit) || 50;

  const messages = storage.getMessagesByJid(jid, limit);
  res.json({
    success: true,
    jid,
    total: messages.length,
    data: messages
  });
});

/**
 * @route POST /api/chats/:jid/toggle-ai
 * @desc Pausa/Retoma auto-resposta do Agente de IA para uma conversa específica (Intervenção Humana)
 */
router.post('/chats/:jid/toggle-ai', (req, res) => {
  const { jid } = req.params;
  const { paused } = req.body;
  const isPaused = storage.toggleAiPause(jid, paused);

  res.json({
    success: true,
    jid,
    aiPaused: isPaused,
    message: isPaused
      ? 'IA Pausada para este chat. Modo Intervenção Humana ativo.'
      : 'IA Reativada para este chat.'
  });
});

/**
 * @route GET /api/contacts
 * @desc Retorna lista de contatos salvos
 */
router.get('/contacts', (req, res) => {
  res.json({
    success: true,
    data: storage.getContacts()
  });
});

/**
 * @route POST /api/webhook/test
 * @desc Testa a conexão enviando um evento de teste para o Webhook configurado
 */
router.post('/webhook/test', async (req, res) => {
  try {
    const { url } = req.body;
    const result = await webhookService.testWebhook(url);
    res.json({
      success: result.success,
      data: result
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Erro ao testar webhook',
      details: error.message
    });
  }
});

/**
 * @route GET /api/config
 * @desc Retorna configurações atuais da API e Webhook
 */
router.get('/config', (req, res) => {
  res.json({
    success: true,
    config: {
      webhookUrl: config.webhookUrl,
      aiAutoRespond: config.aiAutoRespond,
      aiProvider: config.aiProvider,
      openaiModel: config.openaiModel,
      aiSystemPrompt: config.aiSystemPrompt,
      apiKeySet: !!config.apiKey
    }
  });
});

/**
 * @route POST /api/config
 * @desc Atualiza Webhook URL e configurações do Agente de IA em tempo de execução
 */
router.post('/config', (req, res) => {
  const { webhookUrl, aiAutoRespond, aiProvider, openaiApiKey, openaiModel, aiSystemPrompt } = req.body;

  if (webhookUrl !== undefined) config.webhookUrl = webhookUrl;
  if (aiAutoRespond !== undefined) config.aiAutoRespond = Boolean(aiAutoRespond);
  if (aiProvider !== undefined) config.aiProvider = aiProvider;
  if (openaiApiKey !== undefined) config.openaiApiKey = openaiApiKey;
  if (openaiModel !== undefined) config.openaiModel = openaiModel;
  if (aiSystemPrompt !== undefined) config.aiSystemPrompt = aiSystemPrompt;

  res.json({
    success: true,
    message: 'Configurações atualizadas com sucesso!',
    config: {
      webhookUrl: config.webhookUrl,
      aiAutoRespond: config.aiAutoRespond,
      aiProvider: config.aiProvider,
      openaiModel: config.openaiModel,
      aiSystemPrompt: config.aiSystemPrompt,
      apiKeySet: !!config.apiKey
    }
  });
});

export default router;
