import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';

import { config } from './config.js';
import { whatsappService } from './services/whatsapp.js';
import apiRoutes from './routes/api.js';
import docsRoutes from './routes/docs.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const server = http.createServer(app);

// Socket.IO for real-time Web Dashboard
const io = new SocketIOServer(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

whatsappService.setSocketIO(io);

// Middlewares
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static files (Web Dashboard)
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.use('/api', apiRoutes);
app.use('/', docsRoutes);

// Socket connection
io.on('connection', (socket) => {
  // Send current status immediately upon client connection
  socket.emit('status_change', whatsappService.getStatus());
  if (whatsappService.qrCodeBase64) {
    socket.emit('qr_update', { qr: whatsappService.qrCodeBase64 });
  }
});

// Start Express + WhatsApp engine
const PORT = config.port;

server.listen(PORT, async () => {
  console.log(`
  ======================================================
  🚀 WhatsApp API para Agentes de I.A. Rodando!
  ------------------------------------------------------
  🌐 Painel Web:          http://localhost:${PORT}
  📚 Swagger API Docs:    http://localhost:${PORT}/docs
  📄 OpenAPI Spec JSON:   http://localhost:${PORT}/openapi.json
  🔑 API Key:             ${config.apiKey ? config.apiKey : '(Desativada)'}
  ======================================================
  `);

  // Auto-initialize WhatsApp connection
  try {
    await whatsappService.initialize();
  } catch (error) {
    console.error('[WhatsApp Engine Error]', error);
  }
});
