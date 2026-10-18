/** Ingreso y recupero de contraseña (rutas públicas de routes/users.routes.ts). */
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { User, PasswordResetToken } from '../models';
import { signToken, invalidateAccountCache } from '../middlewares/authenticate';
import { sendMailNow } from '../config/mailer';
import { brandEmail } from '../lib/emailTemplate';
import { env } from '../config/env';
import { asyncHandler, badRequest, unauthorized } from '../lib/http';
import { accountPayload, isTechEmail } from '../services/accounts';
import { audit } from '../services/audit';
import { setRequestUser } from '../lib/requestContext';

/** Oculta parte del usuario intentado en el registro de ingresos fallidos. */
const maskIdentifier = (identifier: string) => (identifier.length <= 4 ? '***' : `${identifier.slice(0, 3)}***${identifier.slice(-2)}`);

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

// POST /users/login
export const login = asyncHandler(async (req, res) => {
  const { email: identifier, password } = req.body as { email: string; password: string };
  const dni = identifier.replace(/\D/g, '');
  const where = identifier.includes('@') ? { email: identifier.toLowerCase() } : { dni: dni || identifier };
  const user = await User.scope('withPassword').findOne({ where });
  // Mismo mensaje para usuario inexistente o contraseña incorrecta: no revela qué cuentas existen.
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
    await audit({ schoolId: null, userId: user?.id ?? null, entity: 'Session', action: 'login-failed', after: { identifier: maskIdentifier(identifier) } });
    throw unauthorized('Usuario o contraseña incorrectos.');
  }
  setRequestUser(user.id);
  await User.update({ lastLogin: new Date() }, { where: { id: user.id } });
  await audit({ schoolId: null, userId: user.id, entity: 'Session', action: 'login' });
  res.json({ message: 'Login exitoso', token: signToken(user), userData: await accountPayload(user.id) });
});

// POST /users/request-password-reset — siempre responde lo mismo (no revela qué cuentas existen).
export const requestPasswordReset = asyncHandler(async (req, res) => {
  const { email: identifier } = req.body as { email: string };
  const generic = { message: 'Si el usuario existe, enviamos un email para restablecer la contraseña.' };
  const user = await User.findOne({ where: identifier.includes('@') ? { email: identifier.toLowerCase() } : { dni: identifier.replace(/\D/g, '') } });
  if (!user || isTechEmail(user.email)) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.destroy({ where: { userId: user.id } });
  // Se guarda el hash: si la base se filtrara, los tokens no sirven.
  await PasswordResetToken.create({ userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } as never);
  await sendMailNow({
    to: user.email,
    subject: 'Restablecé tu contraseña - Sentryx',
    html: brandEmail({
      title: `¡Hola ${user.firstName}!`,
      paragraphs: ['Recibimos un pedido para restablecer tu contraseña. El enlace vence en 1 hora.'],
      cta: { label: 'Restablecer contraseña', url: `${env.FRONTEND_URL}/reset-password?token=${token}` },
      footnote: 'Si no lo pediste, ignorá este correo.',
    }),
  });
  res.json(generic);
});

// POST /users/reset-password — además cierra todas las sesiones abiertas de la cuenta.
export const resetPassword = asyncHandler(async (req, res) => {
  const { token, password } = req.body as { token: string; password: string };
  const record = await PasswordResetToken.findOne({ where: { token: hashToken(token) } });
  if (!record || record.expiresAt < new Date()) {
    if (record) await record.destroy();
    throw badRequest('El enlace es inválido o venció. Pedí uno nuevo.');
  }
  const user = await User.findByPk(record.userId);
  if (!user) throw badRequest('El enlace es inválido o venció. Pedí uno nuevo.');
  await user.update({ password: await bcrypt.hash(password, 10), mustChangePassword: false, tokenVersion: user.tokenVersion + 1 });
  invalidateAccountCache(user.id);
  await audit({ schoolId: null, userId: user.id, entity: 'User', entityId: user.id, action: 'password-reset-by-email' });
  await record.destroy();
  res.json({ message: 'Contraseña reseteada correctamente' });
});
