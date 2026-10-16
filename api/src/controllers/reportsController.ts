import multer from 'multer';
import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, presignDownload } from '../config/s3';
import { env } from '../config/env';

// Reportes de bugs: capturas chicas, límite 5 MB en memoria.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, /^(image\/|application\/pdf|text\/plain)/.test(file.mimetype)),
});

export const uploadFileToS3 = [
  upload.single('file'),
  async (req: any, res: any) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const key = `reports/${randomUUID()}-${req.file.originalname.replace(/[^\w.-]+/g, '_')}`;
      if (!env.reportsBucket) return res.status(500).json({ error: 'Almacenamiento no configurado' });
      await s3.send(new PutObjectCommand({ Bucket: env.reportsBucket, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }));
      // Bucket privado: se devuelve un link firmado válido por 7 días (máximo permitido).
      res.json({ fileUrl: await presignDownload(env.reportsBucket, key, 7 * 24 * 3600), key });
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      res.status(500).json({ error: 'Error uploading file to S3' });
    }
  },
];
