import swaggerUi from 'swagger-ui-express';
import express from 'express';

const router = express.Router();

export const openApiSpec = {
  openapi: '3.0.0',
  info: {
    title: 'WhatsApp API para Agentes de I.A.',
    version: '1.0.0',
    description: 'API RESTful de alto desempenho para envio, recebimento de mensagens e integração de Agentes de Inteligência Artificial (OpenAI, LangChain, Flowise, n8n, AutoGen) com o WhatsApp.'
  },
  servers: [
    {
      url: 'http://localhost:3000',
      description: 'Servidor Local'
    }
  ],
  components: {
    securitySchemes: {
      ApiKeyAuth: {
        type: 'apiKey',
        in: 'header',
        name: 'x-api-key',
        description: 'Chave de segurança da API'
      },
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT'
      }
    },
    schemas: {
      SendMessageRequest: {
        type: 'object',
        required: ['number', 'message'],
        properties: {
          number: {
            type: 'string',
            example: '5511999999999',
            description: 'Número de telefone do destinatário com código do país e DDD'
          },
          message: {
            type: 'string',
            example: 'Olá! Sou um assistente de IA. Como posso te ajudar hoje?',
            description: 'Texto da mensagem a ser enviada'
          }
        }
      },
      ConfigUpdate: {
        type: 'object',
        properties: {
          webhookUrl: {
            type: 'string',
            example: 'https://seu-servidor-ia.com/api/webhook'
          },
          aiAutoRespond: {
            type: 'boolean',
            example: true
          },
          aiSystemPrompt: {
            type: 'string',
            example: 'Você é um assistente prestativo da empresa.'
          }
        }
      }
    }
  },
  security: [
    { ApiKeyAuth: [] }
  ],
  paths: {
    '/api/status': {
      get: {
        summary: 'Verifica status da conexão e estatísticas',
        security: [],
        responses: {
          200: { description: 'Status retornado com sucesso' }
        }
      }
    },
    '/api/qr': {
      get: {
        summary: 'Obtém o QR Code em formato Base64 para pareamento',
        security: [],
        responses: {
          200: { description: 'QR Code e status da conexão' }
        }
      }
    },
    '/api/connect-pairing': {
      post: {
        summary: 'Gera um código de 8 dígitos para parear o WhatsApp por número de telefone sem QR Code',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['number'],
                properties: {
                  number: { type: 'string', example: '5511999999999' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Código de pareamento gerado com sucesso' }
        }
      }
    },
    '/api/messages/send': {
      post: {
        summary: 'Envia uma mensagem de texto no WhatsApp',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/SendMessageRequest'
              }
            }
          }
        },
        responses: {
          200: { description: 'Mensagem enviada' },
          400: { description: 'Dados ausentes ou inválidos' },
          401: { description: 'Chave de API não autorizada' }
        }
      }
    },
    '/api/chats': {
      get: {
        summary: 'Lista as conversas ativas no WhatsApp',
        responses: {
          200: { description: 'Lista de chats' }
        }
      }
    },
    '/api/chats/{jid}/messages': {
      get: {
        summary: 'Obtém histórico de mensagens de uma conversa (para memória de contexto da IA)',
        parameters: [
          {
            name: 'jid',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '5511999999999@s.whatsapp.net'
          },
          {
            name: 'limit',
            in: 'query',
            schema: { type: 'integer', default: 50 }
          }
        ],
        responses: {
          200: { description: 'Histórico de mensagens' }
        }
      }
    },
    '/api/chats/{jid}/toggle-ai': {
      post: {
        summary: 'Pausa ou reativa o Agente de IA para uma conversa específica (Intervenção Humana)',
        parameters: [
          {
            name: 'jid',
            in: 'path',
            required: true,
            schema: { type: 'string' },
            example: '5511999999999@s.whatsapp.net'
          }
        ],
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  paused: { type: 'boolean', example: true, description: 'True para pausar a IA e permitir atendimento humano' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Status da IA alterado com sucesso' }
        }
      }
    },
    '/api/webhook/test': {
      post: {
        summary: 'Dispara um evento de teste via HTTP POST para a URL de Webhook configurada',
        requestBody: {
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  url: { type: 'string', example: 'https://seu-servidor-ia.com/api/webhook' }
                }
              }
            }
          }
        },
        responses: {
          200: { description: 'Resultado do teste de Webhook' }
        }
      }
    },
    '/api/config': {
      get: {
        summary: 'Retorna as configurações atuais de Webhook e IA',
        responses: { 200: { description: 'Configurações atuais' } }
      },
      post: {
        summary: 'Atualiza o Webhook URL e parâmetros do Agente de IA',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/ConfigUpdate'
              }
            }
          }
        },
        responses: { 200: { description: 'Configurações atualizadas' } }
      }
    }
  }
};

router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiSpec));
router.get('/openapi.json', (req, res) => res.json(openApiSpec));

export default router;
