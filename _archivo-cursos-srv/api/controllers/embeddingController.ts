import { insertDocumentEmbedding } from '../embedding/pgClient';


export const uploadDocument = async (req: any, res: any) => {
  const { content } = req.body;

  if (!content) {
    return res.status(400).json({ error: 'Falta contenido.' });
  }

  try {
    await insertDocumentEmbedding(content);
    res.json({ success: true });
  } catch (err) {
    console.error('[embedding]', err);
    res.status(500).json({ error: 'No se pudo procesar el documento.' });
  }
};
