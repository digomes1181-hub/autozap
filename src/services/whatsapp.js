import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import QRCode from 'qrcode';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { storage } from './storage.js';
import { webhookService } from './webhook.js';
import { aiAgentService } from './aiAgent.js';

class WhatsappService {
  constructor() {
    this.sock = null;
    this.qrCodeBase64 = null;
    this.qrRaw = null;
    this.status = 'DISCONNECTED'; // DISCONNECTED, CONNECTING, QR_READY, CONNECTED
    this.user = null;
    this.io = null; // Socket.io instance for dashboard
  }

  setSocketIO(io) {
    this.io = io;
  }

  emitDashboard(event, data) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }

  async initialize() {
    if (this.status === 'CONNECTING' || this.status === 'CONNECTED') {
      return;
    }

    this.status = 'CONNECTING';
    this.emitDashboard('status_change', { status: this.status });

    // Ensure auth folder exists
    const sessionPath = path.resolve(config.sessionDir);
    if (!fs.existsSync(sessionPath)) {
      fs.mkdirSync(sessionPath, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionPath);
    const { version } = await fetchLatestBaileysVersion();

    const logger = pino({ level: 'silent' });

    this.sock = makeWASocket({
      version,
      logger,
      auth: state,
      browser: ['WhatsApp AI Agent', 'Chrome', '1.0.0']
    });

    this.sock.ev.on('creds.update', saveCreds);

    this.sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        this.qrRaw = qr;
        this.status = 'QR_READY';
        try {
          this.qrCodeBase64 = await QRCode.toDataURL(qr);
          this.emitDashboard('qr_update', { qr: this.qrCodeBase64 });
          this.emitDashboard('status_change', { status: this.status });
        } catch (err) {
          console.error('[QR Error]', err);
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        console.log(`[WhatsApp] Conexão fechada. Motivo: ${statusCode}. Reconectando: ${shouldReconnect}`);

        this.status = 'DISCONNECTED';
        this.qrCodeBase64 = null;
        this.qrRaw = null;
        this.user = null;
        this.emitDashboard('status_change', { status: this.status });

        if (shouldReconnect) {
          setTimeout(() => this.initialize(), 3000);
        } else {
          // Clear credentials directory if logged out
          fs.rmSync(sessionPath, { recursive: true, force: true });
        }
      } else if (connection === 'open') {
        this.status = 'CONNECTED';
        this.qrCodeBase64 = null;
        this.qrRaw = null;
        this.user = this.sock.user;
        console.log(`[WhatsApp] Conectado com sucesso! Usuário: ${this.sock.user?.id}`);

        this.emitDashboard('status_change', {
          status: this.status,
          user: {
            id: this.sock.user?.id,
            name: this.sock.user?.name || this.sock.user?.id?.split(':')[0]
          }
        });
      }
    });

    // Inbound & Outbound message handlers
    this.sock.ev.on('messages.upsert', async (m) => {
      if (m.type !== 'notify') return;

      for (const msg of m.messages) {
        if (!msg.message) continue;

        const jid = msg.key.remoteJid;
        if (!jid || jid.endsWith('@g.us')) continue; // Focus on direct chats for AI Agent (groups can be enabled if requested)

        const fromMe = msg.key.fromMe || false;
        const pushName = msg.pushName || '';

        // Extract message content
        const messageType = Object.keys(msg.message)[0];
        let text = '';

        if (messageType === 'conversation') {
          text = msg.message.conversation;
        } else if (messageType === 'extendedTextMessage') {
          text = msg.message.extendedTextMessage.text;
        } else if (messageType === 'imageMessage') {
          text = msg.message.imageMessage.caption || '[Imagem]';
        } else if (messageType === 'videoMessage') {
          text = msg.message.videoMessage.caption || '[Vídeo]';
        } else if (messageType === 'documentMessage') {
          text = msg.message.documentMessage.caption || '[Documento]';
        } else if (messageType === 'audioMessage') {
          text = '[Áudio]';
        }

        const msgObj = {
          id: msg.key.id,
          jid,
          fromMe,
          pushName,
          text,
          messageType,
          timestamp: new Date(msg.messageTimestamp * 1000 || Date.now()).toISOString()
        };

        // Save to memory store
        storage.addMessage(msgObj);
        storage.saveContact(jid, { name: pushName });

        // Emit to real-time Web Dashboard
        this.emitDashboard('new_message', msgObj);

        // If message is received from a contact (not sent by us)
        if (!fromMe) {
          // 1. Send to Webhook for remote AI agents (n8n, Flowise, custom API)
          webhookService.triggerWebhook('message.received', msgObj);

          // 2. Process with built-in AI Agent (if configured)
          aiAgentService.processIncomingMessage(msgObj, (toJid, replyText) => {
            return this.sendMessage(toJid, replyText);
          });
        }
      }
    });
  }

  formatJid(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/\D/g, '');
    if (!cleaned.endsWith('@s.whatsapp.net')) {
      cleaned = `${cleaned}@s.whatsapp.net`;
    }
    return cleaned;
  }

  async sendMessage(to, text, options = {}) {
    if (this.status !== 'CONNECTED' || !this.sock) {
      throw new Error('WhatsApp não está conectado. Por favor, escaneie o QR Code.');
    }

    const jid = this.formatJid(to);
    const result = await this.sock.sendMessage(jid, { text }, options);

    const sentObj = {
      id: result.key.id,
      jid,
      fromMe: true,
      pushName: 'API / Agente IA',
      text,
      messageType: 'text',
      timestamp: new Date().toISOString()
    };

    storage.addMessage(sentObj);
    this.emitDashboard('new_message', sentObj);

    return sentObj;
  }

  async sendMedia(to, fileBuffer, mimetype, filename, caption = '') {
    if (this.status !== 'CONNECTED' || !this.sock) {
      throw new Error('WhatsApp não está conectado.');
    }

    const jid = this.formatJid(to);
    let payload = {};

    if (mimetype.startsWith('image/')) {
      payload = { image: fileBuffer, caption };
    } else if (mimetype.startsWith('video/')) {
      payload = { video: fileBuffer, caption };
    } else if (mimetype.startsWith('audio/')) {
      payload = { audio: fileBuffer, mimetype, ptt: true };
    } else {
      payload = { document: fileBuffer, mimetype, fileName: filename || 'file', caption };
    }

    const result = await this.sock.sendMessage(jid, payload);

    const sentObj = {
      id: result.key.id,
      jid,
      fromMe: true,
      pushName: 'API / Agente IA',
      text: caption || `[Mídia: ${mimetype}]`,
      messageType: mimetype,
      timestamp: new Date().toISOString()
    };

    storage.addMessage(sentObj);
    this.emitDashboard('new_message', sentObj);

    return sentObj;
  }

  async logout() {
    if (this.sock) {
      await this.sock.logout();
      this.status = 'DISCONNECTED';
      this.qrCodeBase64 = null;
      this.user = null;
      this.emitDashboard('status_change', { status: this.status });
    }
  }

  async requestPairingCode(phone) {
    if (!phone) {
      throw new Error('Informe o número de telefone com código do país (ex: 5511999999999).');
    }
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.length < 10) {
      throw new Error('Número de telefone inválido ou muito curto.');
    }

    if (!this.sock || this.status === 'DISCONNECTED') {
      await this.initialize();
      // Small delay for socket initialization
      await new Promise(r => setTimeout(r, 1000));
    }

    if (this.sock && typeof this.sock.requestPairingCode === 'function') {
      const code = await this.sock.requestPairingCode(cleaned);
      return code;
    } else {
      throw new Error('Não foi possível gerar o Código de Pareamento.');
    }
  }

  getStatus() {
    return {
      status: this.status,
      user: this.user ? {
        id: this.user.id,
        name: this.user.name || this.user.id.split(':')[0]
      } : null,
      stats: storage.getStats()
    };
  }

  getQR() {
    return {
      status: this.status,
      qrCodeBase64: this.qrCodeBase64
    };
  }
}

export const whatsappService = new WhatsappService();
