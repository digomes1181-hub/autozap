import multer from 'multer';

// Use memory storage for quick streaming/sending via Baileys socket
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: {
    fileSize: 50 * 1024 * 1024 // 50 MB max
  }
});
