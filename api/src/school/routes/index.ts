import { Router } from 'express';
import { z } from 'zod';
import { isAuth } from '../../middlewares/auth';
import { schoolContext } from '../context';
import { asyncHandler, validate } from '../../lib/http';
import { DeviceToken } from '../../models';
import { env } from '../../config/env';
import structure, { schoolsRouter } from './structure';
import people from './people';
import grades from './grades';
import attendance from './attendance';
import communication from './communication';
import dashboard from './dashboard';
import files from './files';
import classrooms from './classrooms';

const router = Router();
router.use(isAuth);

// --- Push: no dependen de la escuela activa ---
router.get('/push/public-key', (_req, res) => res.json({ publicKey: env.VAPID_PUBLIC_KEY ?? null }));

router.post(
  '/push/subscribe',
  validate({
    body: z.object({
      kind: z.enum(['WEBPUSH', 'EXPO']).default('WEBPUSH'),
      endpoint: z.string().url().max(1000).optional(),
      keys: z.object({ p256dh: z.string(), auth: z.string() }).optional(),
      token: z.string().max(500).optional(),
    }),
  }),
  asyncHandler(async (req, res) => {
    const { kind, endpoint, keys, token } = req.body;
    const value = kind === 'WEBPUSH' ? endpoint : token;
    if (!value) return res.status(400).json({ message: 'Suscripción inválida.' });
    const [row, created] = await DeviceToken.findOrCreate({
      where: { token: value },
      defaults: { userId: req.user!.id, kind, token: value, data: keys ? { keys } : null },
    });
    if (!created) await row.update({ userId: req.user!.id, data: keys ? { keys } : row.data, lastSeenAt: new Date() });
    res.status(201).json({ ok: true });
  })
);

router.post(
  '/push/unsubscribe',
  validate({ body: z.object({ endpoint: z.string().max(1000) }) }),
  asyncHandler(async (req, res) => {
    await DeviceToken.destroy({ where: { token: req.body.endpoint, userId: req.user!.id } });
    res.json({ ok: true });
  })
);

router.use(schoolsRouter);

// Todo lo siguiente requiere escuela activa + contexto de permisos/alcance.
router.use(schoolContext);
router.use(structure);
router.use(people);
router.use('/grades', grades);
router.use(attendance);
router.use(communication);
router.use(dashboard);
router.use(files);
router.use(classrooms);

export default router;
