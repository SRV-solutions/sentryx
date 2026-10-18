/** Validaciones (zod) del perfil propio. */
import { z } from 'zod';
import { PASSWORD } from './auth.validator';

export const AVATAR_MAX_BYTES = 300 * 1024;
const USERNAME = z.string().regex(/^[a-zA-Z0-9_-]{3,30}$/, 'Usuario: 3 a 30 letras, números, guiones o guiones bajos.');

/** PATCH /users/me — lista blanca: nadie puede cambiarse roles, email ni DNI desde su perfil. */
export const updateMyProfile = {
  body: z.object({
    firstName: z.string().trim().min(1).max(80).optional(),
    lastName: z.string().trim().min(1).max(80).optional(),
    username: USERNAME.optional(),
    phone: z.string().max(40).nullish(),
    biography: z.string().max(1000).nullish(),
  }),
};

/** PUT /users/change-password */
export const changeMyPassword = { body: z.object({ currentPassword: z.string().min(1).max(100), newPassword: PASSWORD }) };

/** PUT /users/me/avatar — imagen ya recortada en el navegador (data URL). */
export const setMyAvatar = {
  body: z.object({ image: z.string().max(Math.ceil((AVATAR_MAX_BYTES * 4) / 3) + 100, 'La foto es demasiado pesada.') }),
};
