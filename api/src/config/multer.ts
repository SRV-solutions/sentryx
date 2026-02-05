import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Ruta absoluta del directorio de uploads de videos
const uploadDir = path.join(__dirname, '..', 'uploads', 'videos');

// Crear la carpeta si no existe
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configuración de almacenamiento de multer

const storage = multer.memoryStorage();

// const storage = multer.diskStorage({
//   destination: (_req, _file, cb) => {
//     cb(null, uploadDir); // Guardar en la carpeta de videos
//   },
//   filename: (_req, file, cb) => {
//     // Nombre único: timestamp + nombre original
//     cb(null, `${Date.now()}_${file.originalname}`);
//   },
// });

// Filtrar los archivos para asegurarse de que sea un video
const fileFilter = (_req: any, file: any, cb: any) => {
  if (file.mimetype.startsWith('video/')) {
    cb(null, true);
  } else {
    cb(new Error('Solo se permiten archivos de video'), false);
  }
};

// Límite opcional de tamaño de archivo (ej: 1GB)
const upload = multer({ 
  storage, 
  fileFilter,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
});

export default upload;
