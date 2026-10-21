// Vercel Function untuk /api/ai (Cermat AI).
// GEMINI_API_KEY diisi di Vercel: Project > Settings > Environment Variables.
import { aiMiddleware } from '../server/ai.js';

export default aiMiddleware(process.env);
