import { insertDocumentEmbedding } from '../embedding/pgClient';


export const uploadDocument = async (req: any, res: any) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Falta contenido.' });
  }

  await insertDocumentEmbedding(content);
  res.json({ success: true });
};
