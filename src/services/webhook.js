import axios from 'axios';
import crypto from 'crypto';
import { config } from '../config.js';
import { storage } from './storage.js';

class WebhookService {
  async triggerWebhook(event, messageData) {
    const url = config.webhookUrl;
    if (!url) {
      return null;
    }

    const payload = {
      event,
      timestamp: new Date().toISOString(),
      data: {
        id: messageData.id,
        from: messageData.jid,
        phone: messageData.jid ? messageData.jid.split('@')[0] : '',
        senderName: messageData.pushName || 'Contato WhatsApp',
        message: messageData.text,
        messageType: messageData.messageType || 'text',
        mediaUrl: messageData.mediaUrl || null,
        fromMe: messageData.fromMe,
        timestamp: messageData.timestamp,
        // Include recent conversation history context for AI prompt building
        conversationHistory: storage.getMessagesByJid(messageData.jid, 10)
      }
    };

    // Generate HMAC signature if secret is defined
    const signature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Signature': signature,
          'X-WhatsApp-Event': event,
          'User-Agent': 'WhatsApp-AI-Agent-API/1.0'
        },
        timeout: 10000 // 10s timeout
      });

      storage.incrementWebhookCount();
      return { success: true, status: response.status, responseData: response.data };
    } catch (error) {
      console.error(`[Webhook Error] Failed to send webhook to ${url}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  async testWebhook(targetUrl) {
    const url = targetUrl || config.webhookUrl;
    if (!url) {
      throw new Error('Nenhuma URL de Webhook foi configurada.');
    }

    const payload = {
      event: 'webhook.test',
      timestamp: new Date().toISOString(),
      data: {
        message: 'Teste de conexão de Webhook enviado pela WhatsApp AI Agent API.',
        phone: '5511999999999',
        senderName: 'Sistema de Teste',
        test: true
      }
    };

    const signature = crypto
      .createHmac('sha256', config.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    const startTime = Date.now();
    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-WhatsApp-Signature': signature,
          'X-WhatsApp-Event': 'webhook.test',
          'User-Agent': 'WhatsApp-AI-Agent-API/1.0'
        },
        timeout: 10000
      });

      const responseTime = Date.now() - startTime;
      storage.incrementWebhookCount();

      return {
        success: true,
        status: response.status,
        statusText: response.statusText,
        responseTimeMs: responseTime,
        responseData: response.data
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return {
        success: false,
        status: error.response?.status || 500,
        responseTimeMs: responseTime,
        error: error.message,
        details: error.response?.data || null
      };
    }
  }
}

export const webhookService = new WebhookService();
