/** Perfil propio: datos, contraseña y foto (rutas autenticadas de routes/users.routes.ts). */
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { User, UserAvatar } from '../models';
import { signToken, invalidateAccountCache } from '../middlewares/authenticate';
import { asyncHandler, HttpError, notFound, badRequest, unauthorized } from '../lib/http';
import { accountPayload } from '../services/accounts';
import { AVATAR_MAX_BYTES } from '../validators/profile.validator';
import { audit } from '../services/audit';

/** Firma real del archivo (no alcanza con el tipo declarado). */
const IMAGE_SIGNATURES: Record<string, (data: Buffer) => boolean> = {
  'image/jpeg': (data) => data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff,
  'image/png': (data) => data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  'image/webp': (data) => data.subarray(0, 4).toString('ascii') === 'RIFF' && data.subarray(8, 12).toString('ascii') === 'WEBP',
};

// GET /users/me
export const getMyProfile = asyncHandler(async (req, res) => {
  res.json(await accountPayload(req.user!.id));
});

// PATCH /users/me
export const updateMyProfile = asyncHandler(async (req, res) => {
  const changes = req.body as { firstName?: string; lastName?: string; username?: string; phone?: string | null; biography?: string | null };
  if (changes.username && (await User.count({ where: { username: changes.username, id: { [Op.ne]: req.user!.id } } }))) {
    throw new HttpError(400, 'Ese nombre de usuario ya está en uso.', { username: 'Ese nombre de usuario ya está en uso' });
  }
  await User.update(changes, { where: { id: req.user!.id } });
  res.json(await accountPayload(req.user!.id));
});

// PUT /users/change-password — cierra las demás sesiones y devuelve un token nuevo para esta.
export const changeMyPassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body as { currentPassword: string; newPassword: string };
  const user = await User.scope('withPassword').findByPk(req.user!.id);
  if (!user) throw notFound('Usuario no encontrado');
  if (!(await bcrypt.compare(currentPassword, user.password))) throw unauthorized('Contraseña actual incorrecta');
  if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.');
  await user.update({ password: await bcrypt.hash(newPassword, 10), mustChangePassword: false, tokenVersion: user.tokenVersion + 1 });
  invalidateAccountCache(user.id);
  await audit({ schoolId: null, userId: user.id, entity: 'User', entityId: user.id, action: 'password-change' });
  res.json({ message: 'Contraseña cambiada con éxito', token: signToken(user) });
});

/**
 * PUT /users/me/avatar — el navegador la recorta y achica (≤ 384 px) antes de enviarla: pesa ~20–40 KB y
 * se guarda en la base (no depende del bucket). Se valida el tipo real por su firma.
 */
export const setMyAvatar = asyncHandler(async (req, res) => {
  const { image } = req.body as { image: string };
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(image);
  if (!match) throw badRequest('La foto debe ser una imagen JPG, PNG o WebP.');
  const [, mimeType, base64] = match;
  const data = Buffer.from(base64, 'base64');
  if (data.length > AVATAR_MAX_BYTES) throw badRequest('La foto es demasiado pesada (máx. 300 KB).');
  if (!IMAGE_SIGNATURES[mimeType](data)) throw badRequest('El archivo no es una imagen válida.');
  const token = crypto.randomBytes(16).toString('hex');
  await UserAvatar.upsert({ userId: req.user!.id, token, mimeType, data });
  await User.update({ avatar: `/avatars/${token}` }, { where: { id: req.user!.id } });
  res.json(await accountPayload(req.user!.id));
});

// DELETE /users/me/avatar
export const deleteMyAvatar = asyncHandler(async (req, res) => {
  await UserAvatar.destroy({ where: { userId: req.user!.id } });
  await User.update({ avatar: null }, { where: { id: req.user!.id } });
  res.json(await accountPayload(req.user!.id));
});

/** GET /avatars/:token — público pero imposible de adivinar (token aleatorio de 128 bits), con caché de 1 año. */
export const serveAvatar = asyncHandler(async (req, res) => {
  const token = String(req.params.token);
  if (!/^[a-f0-9]{32}$/.test(token)) throw notFound();
  const avatar = await UserAvatar.findOne({ where: { token } });
  if (!avatar) throw notFound();
  res.set({ 'Content-Type': avatar.mimeType, 'Cache-Control': 'public, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff' });
  res.send(avatar.data);
});
