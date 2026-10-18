/** Validaciones (zod) de ingreso y recupero de contraseña. */
import { z } from 'zod';

export const PASSWORD = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(100);

/** POST /users/login — acepta email o DNI (muchas familias no usan email). */
export const login = { body: z.object({ email: z.string().trim().min(3).max(120), password: z.string().min(1).max(100) }) };

/** POST /users/request-password-reset */
export const requestPasswordReset = { body: z.object({ email: z.string().trim().min(3).max(120) }) };

/** POST /users/reset-password */
export const resetPassword = { body: z.object({ token: z.string().min(10).max(200), password: PASSWORD }) };
