import AWS from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import multer from 'multer';

const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});
const upload = multer({ storage: multer.memoryStorage() });

export const uploadFileToS3 = [
    upload.single('file'),
    async (req: any, res: any) => {

        try {
            if (!req.file) {
                return res.status(400).json({ error: 'No file uploaded' });
            }
            const file = req.file;
            const key = `${uuidv4()}-${file.originalname}`;
            const params = {
                Bucket: process.env.S3_BUCKET_NAME!,
                Key: key,
                Body: file.buffer,
                ContentType: file.mimetype,
            };

            const data = await s3.upload(params).promise();
            res.json({ fileUrl: data.Location });
        } catch (error) {
            console.error('Error uploading file to S3:', error);
            res.status(500).json({ error: 'Error uploading file to S3' });
        }
    }
];
