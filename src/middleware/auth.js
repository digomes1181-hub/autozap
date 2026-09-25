import { config } from '../config.js';

export const apiKeyAuth = (req, res, next) => {
  // If no API_KEY is set or it's default blank, allow access
  if (!config.apiKey) {
    return next();
  }

  const clientKey = req.headers['x-api-key'] || 
                    req.headers['authorization']?.replace('Bearer ', '') || 
                    req.query.api_key;

  if (clientKey === config.apiKey) {
    return next();
  }

  return res.status(401).json({
    error: 'Não autorizado',
    message: 'Chave de API inválida ou ausente. Forneça a chave no cabeçalho x-api-key ou Authorization: Bearer <key>'
  });
};
