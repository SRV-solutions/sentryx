import multer from 'multer';
import { randomUUID } from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3 } from '../config/s3';
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
      await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET_NAME!, Key: key, Body: req.file.buffer, ContentType: req.file.mimetype }));
      res.json({ fileUrl: `https://${env.S3_BUCKET_NAME}.s3.${env.AWS_REGION}.amazonaws.com/${key}` });
    } catch (error) {
      console.error('Error uploading file to S3:', error);
      res.status(500).json({ error: 'Error uploading file to S3' });
    }
  },
];
