import fs from 'fs';
import path from 'path';

class StorageService {
  constructor() {
    this.messages = []; // [{ id, jid, fromMe, text, timestamp, mediaUrl, pushName }]
    this.contacts = new Map(); // jid -> { name, notify, jid }
    this.chats = new Map(); // jid -> { lastMessage, unreadCount, timestamp }
    this.aiPausedChats = new Set(); // JIDs with AI auto-response paused (Human Takeover mode)
    this.stats = {
      messagesSent: 0,
      messagesReceived: 0,
      webhooksTriggered: 0,
      startedAt: new Date().toISOString()
    };
  }

  addMessage(msg) {
    this.messages.push(msg);
    // Keep max 1000 messages in memory for context retrieval
    if (this.messages.length > 1000) {
      this.messages.shift();
    }

    if (msg.fromMe) {
      this.stats.messagesSent++;
    } else {
      this.stats.messagesReceived++;
    }

    // Update chat summary
    const jid = msg.jid;
    const existing = this.chats.get(jid) || { jid, unreadCount: 0 };
    this.chats.set(jid, {
      ...existing,
      lastMessage: msg.text || (msg.mediaUrl ? '[Mídia]' : '[Mensagem]'),
      timestamp: msg.timestamp,
      pushName: msg.pushName || existing.pushName || jid.split('@')[0],
      unreadCount: msg.fromMe ? 0 : (existing.unreadCount + 1)
    });
  }

  isAiPaused(jid) {
    if (!jid) return false;
    const cleanJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    return this.aiPausedChats.has(cleanJid);
  }

  toggleAiPause(jid, status) {
    if (!jid) return false;
    const cleanJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    const newState = status !== undefined ? Boolean(status) : !this.aiPausedChats.has(cleanJid);
    
    if (newState) {
      this.aiPausedChats.add(cleanJid);
    } else {
      this.aiPausedChats.delete(cleanJid);
    }
    return newState;
  }

  getMessagesByJid(jid, limit = 50) {
    const cleanJid = jid.includes('@') ? jid : `${jid}@s.whatsapp.net`;
    return this.messages
      .filter(m => m.jid === cleanJid || m.jid.startsWith(cleanJid.split('@')[0]))
      .slice(-limit);
  }

  saveContact(jid, data) {
    const existing = this.contacts.get(jid) || {};
    this.contacts.set(jid, { ...existing, jid, ...data });
  }

  getContacts() {
    return Array.from(this.contacts.values());
  }

  getChats() {
    return Array.from(this.chats.values()).map(chat => ({
      ...chat,
      aiPaused: this.isAiPaused(chat.jid)
    })).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }

  incrementWebhookCount() {
    this.stats.webhooksTriggered++;
  }

  getStats() {
    return {
      ...this.stats,
      totalChats: this.chats.size,
      totalContacts: this.contacts.size
    };
  }
}

export const storage = new StorageService();
