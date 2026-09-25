import axios from 'axios';
import { config } from '../config.js';
import { storage } from './storage.js';

class AIAgentService {
  async processIncomingMessage(messageData, sendReplyCallback) {
    if (!config.aiAutoRespond) return;
    if (messageData.fromMe) return; // Don't reply to own messages
    if (!messageData.text) return; // Skip non-text for simple AI auto-respond
    if (storage.isAiPaused(messageData.jid)) {
      console.log(`[AI Agent] Resposta ignorada para ${messageData.jid} (Modo Intervenção Humana ativo)`);
      return;
    }

    try {
      let aiResponseText = '';

      if (config.aiProvider === 'openai' && config.openaiApiKey) {
        aiResponseText = await this.queryOpenAI(messageData);
      } else {
        // Fallback / mock AI agent response if key isn't provided
        aiResponseText = `🤖 [AI Agent Auto-Responder]\nRecebi sua mensagem: "${messageData.text}".\n(Para ativar respostas completas do GPT, insira a OPENAI_API_KEY no arquivo .env ou no painel).`;
      }

      if (aiResponseText && typeof sendReplyCallback === 'function') {
        // Wait a slight delay to simulate human typing speed
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sendReplyCallback(messageData.jid, aiResponseText);
      }
    } catch (error) {
      console.error('[AI Agent Error]:', error.message);
    }
  }

  async queryOpenAI(messageData) {
    const history = storage.getMessagesByJid(messageData.jid, 6);
    const messages = [
      { role: 'system', content: config.aiSystemPrompt }
    ];

    // Add recent history to context
    for (const h of history) {
      messages.push({
        role: h.fromMe ? 'assistant' : 'user',
        content: h.text || '[mídia]'
      });
    }

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model: config.openaiModel,
        messages,
        max_tokens: 500,
        temperature: 0.7
      },
      {
        headers: {
          'Authorization': `Bearer ${config.openaiApiKey}`,
          'Content-Type': 'application/json'
        },
        timeout: 20000
      }
    );

    return response.data?.choices?.[0]?.message?.content?.trim() || '';
  }
}

export const aiAgentService = new AIAgentService();
