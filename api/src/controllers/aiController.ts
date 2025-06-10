import openai from '../utils/openai';

export const chatWithGPT = async (req:any, res:any) => {
    try {
        const { userId, message } = req.body;
        if (!message) {
            return res.status(400).json({ error: 'El campo "message" es requerido.' });
        }

        const completion = await openai.chat.completions.create({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: message }
            ],
            max_tokens: 512,
            temperature: 0.7
        });

        const respuesta = completion.choices[0].message.content;
        return res.json({ reply: respuesta });

    } catch (error) {
        console.error('Error en chatWithGPT:', error);
        return res.status(500).json({ error: 'Error al comunicarse con OpenAI' });
    }
};
