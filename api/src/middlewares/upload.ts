import multer from "multer";
import multerS3 from "multer-s3";
import s3 from "../config/s3";

export const uploadVideo = multer({
  storage: multerS3({
    s3,
    bucket: process.env.S3_VIDEO_BUCKET_NAME!,
    acl: "public-read",
    key: (_req, file, cb) => {
      cb(null, `videos/${Date.now()}-${file.originalname}`);
    },
  }),
  limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("video/")) cb(null, true);
    else cb(new Error("Solo se permiten archivos de video"));
  },
});
