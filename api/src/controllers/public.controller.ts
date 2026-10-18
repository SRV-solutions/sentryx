/** Datos públicos mínimos para el login con la identidad del colegio (/c/:slug). Sin datos personales. */
import { School } from '../models';
import { asyncHandler, notFound } from '../lib/http';
import { publicSchool } from '../services/branding';

// GET /schools/:slug
export const getPublicSchool = asyncHandler(async (req, res) => {
    const school = await School.findOne({ where: { slug: String(req.params.slug).toLowerCase(), active: true } });
    if (!school) throw notFound('Colegio inexistente.');
    res.set('Cache-Control', 'public, max-age=300');
    res.json(await publicSchool(school));
  });
