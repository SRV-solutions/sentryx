/**
 * Links de ingreso de un solo uso (se guardan hasheados):
 *  - QR: "Llevar Sentryx al celular", vale 5 minutos.
 *  - EMAIL: botón de los mails de bienvenida y de contraseña blanqueada. Entra sin escribir la contraseña
 *    y pide elegir una nueva. Vale 7 días y deja de servir si la contraseña cambia (versión de sesión).
 */
import { randomBytes, createHash } from 'crypto';
import { LoginLinkToken } from '../models';
import { env } from '../config/env';

export const EMAIL_LINK_DAYS = 7;
export const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

/** Link del botón de un mail de acceso (reemplaza al anterior de esa persona). */
export const emailLoginLink = async (userId: number, tokenVersion: number) => {
  await LoginLinkToken.update({ usedAt: new Date() }, { where: { userId, purpose: 'EMAIL', usedAt: null } });
  const token = randomBytes(32).toString('hex');
  await LoginLinkToken.create({ userId, tokenHash: sha256(token), expiresAt: new Date(Date.now() + EMAIL_LINK_DAYS * 86_400_000), usedAt: null, purpose: 'EMAIL', ver: tokenVersion });
  return `${env.FRONTEND_URL}/login?link=${token}`;
};
