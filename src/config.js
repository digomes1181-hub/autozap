import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const config = {
  port: process.env.PORT || 3000,
  apiKey: process.env.API_KEY || 'sk_whatsapp_agent_secret_key_123',
  webhookUrl: process.env.WEBHOOK_URL || '',
  webhookSecret: process.env.WEBHOOK_SECRET || 'whatsapp_agent_wh_secret',
  aiAutoRespond: process.env.AI_AUTO_RESPOND === 'true',
  aiProvider: process.env.AI_PROVIDER || 'openai',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  openaiModel: process.env.OPENAI_MODEL || 'gpt-4o-mini',
  aiSystemPrompt: process.env.AI_SYSTEM_PROMPT || 'Você é um assistente virtual inteligente atendendo no WhatsApp. Seja cortês, claro e objetivo.',
  sessionDir: process.env.SESSION_DIR || '.baileys_auth',
  uploadsDir: path.join(__dirname, '../uploads')
};
