import OpenAI from 'openai';
import { env } from '../config/env';

// Sin clave el servidor igual arranca; solo fallan las funciones de IA (Solvix) con un error controlado.
const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY || 'not-configured' });

export default openai;
