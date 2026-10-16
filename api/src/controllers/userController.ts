import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Op } from 'sequelize';
import { z } from 'zod';
import { User, Role, Permission, UserCourse, Course, PasswordResetToken } from '../models';
import { signToken, invalidateRoleCache } from '../middlewares/auth';
import { sendMail, sendMailNow } from '../config/mailer';
import { brandEmail } from '../lib/emailTemplate';
import { env } from '../config/env';
import { HttpError, notFound, badRequest, unauthorized } from '../lib/http';
import { tempPassword } from '../school/services/users';

const PASSWORD = z.string().min(8, 'La contraseña debe tener al menos 8 caracteres.').max(100);
const USERNAME = z.string().regex(/^[a-zA-Z0-9_-]{3,30}$/, 'Usuario: 3 a 30 letras, números, guiones o guiones bajos.');

const userPayload = async (userId: number) => {
  const user = await User.findByPk(userId, {
    include: [{ model: Role, include: [Permission] }, { model: UserCourse, include: [Course] }],
  });
  if (!user) throw notFound('Usuario no encontrado.');
  return {
    id: user.id,
    username: user.username,
    phone: user.phone,
    biography: user.biography,
    avatar: user.avatar,
    email: user.email,
    dni: user.dni,
    firstName: user.firstName,
    lastName: user.lastName,
    roleId: user.roleId,
    roleName: user.Role?.roleName,
    mustChangePassword: user.mustChangePassword,
    courses: user.UserCourses,
    permissions: user.Role?.Permissions?.map((p) => ({ entity: p.entity, action: p.action })),
  };
};

export const getAllUsers = async (req: Request, res: Response) => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, parseInt(req.query.limit as string) || 10);
  const search = ((req.query.search as string) || '').trim();
  const where = search
    ? {
        [Op.or]: ['firstName', 'lastName', 'email', 'username', 'dni'].map((f) => ({ [f]: { [Op.iLike]: `%${search}%` } })),
      }
    : {};
  const { count, rows } = await User.findAndCountAll({
    where,
    include: [Role],
    attributes: ['id', 'username', 'email', 'dni', 'roleId', 'firstName', 'lastName', 'lastLogin', 'isActive'],
    limit,
    offset: (page - 1) * limit,
    order: [['id', 'ASC']],
  });
  res.json({ data: rows, pagination: { totalItems: count, totalPages: Math.ceil(count / limit), currentPage: page, itemsPerPage: limit } });
};

export const getPublicUser = async (req: Request, res: Response) => {
  const user = await User.findByPk(req.params.id, { attributes: ['id', 'firstName', 'lastName', 'username', 'biography', 'avatar'] });
  if (!user) throw notFound('Usuario no encontrado');
  res.json(user);
};

export const getUser = async (req: Request, res: Response) => {
  const user = await User.findByPk(req.params.id, { include: [{ model: Role, include: [Permission] }] });
  if (!user) throw notFound('Usuario no encontrado');
  res.json(user);
};

export const createUserSchema = z.object({
  username: USERNAME,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  email: z.string().email(),
  password: PASSWORD.optional(),
  roleId: z.number().int(),
});

export const createUser = async (req: Request, res: Response) => {
  const { username, firstName, lastName, email, password, roleId } = req.body as z.infer<typeof createUserSchema>;
  if (!(await Role.findByPk(roleId))) throw notFound('Rol no encontrado');
  const plain = password || tempPassword();
  const user = await User.create({
    username,
    email: email.toLowerCase(),
    password: await bcrypt.hash(plain, 10),
    roleId,
    firstName,
    lastName,
    dni: null,
    phone: null,
    biography: null,
    avatar: null,
    lastLogin: null,
    mustChangePassword: !password,
  });
  sendMail({
    to: user.email,
    subject: 'Tu acceso a Sentryx',
    html: brandEmail({
      title: `¡Hola ${firstName}!`,
      paragraphs: ['Tu usuario fue creado. Al ingresar te vamos a pedir que cambies la contraseña.'],
      box: [`Usuario: ${user.email}`, `Contraseña temporal: ${plain}`],
      cta: { label: 'Ingresar', url: `${env.FRONTEND_URL}/login` },
    }),
  });
  res.status(201).json({ message: 'Usuario creado y correo enviado.', user: { id: user.id, email: user.email, firstName, lastName, roleId } });
};

export const registerSchema = z.object({
  username: USERNAME,
  email: z.string().email(),
  password: PASSWORD,
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
});

/** Registro abierto solo para alumnos de cursos SRV. Personal y familias de escuelas los da de alta la institución. */
export const register = async (req: Request, res: Response) => {
  const { username, email, password, firstName, lastName } = req.body as z.infer<typeof registerSchema>;
  if (await User.count({ where: { email: email.toLowerCase() } })) throw badRequest('El email ya está registrado');
  if (await User.count({ where: { username } })) throw badRequest('El nombre de usuario ya está en uso');
  const role = await Role.findOne({ where: { roleName: 'user' } });
  const user = await User.create({
    username,
    firstName,
    lastName,
    email: email.toLowerCase(),
    password: await bcrypt.hash(password, 10),
    roleId: role!.id,
    dni: null,
    phone: null,
    biography: null,
    avatar: null,
    lastLogin: null,
  });
  res.status(201).json({
    message: 'Usuario registrado correctamente',
    user: { id: user.id, username: user.username, firstName: user.firstName, lastName: user.lastName, email: user.email, roleId: user.roleId },
  });
};

export const loginSchema = z.object({
  // Acepta email o DNI (muchas familias no usan email).
  email: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(100),
});

export const login = async (req: Request, res: Response) => {
  const { email: identifier, password } = req.body as z.infer<typeof loginSchema>;
  const dni = identifier.replace(/\D/g, '');
  const where = identifier.includes('@') ? { email: identifier.toLowerCase() } : { dni: dni || identifier };
  const user = await User.scope('withPassword').findOne({ where });
  // Mismo mensaje para usuario inexistente o contraseña incorrecta: no revela qué cuentas existen.
  if (!user || !user.isActive || !(await bcrypt.compare(password, user.password))) {
    throw unauthorized('Usuario o contraseña incorrectos.');
  }
  await User.update({ lastLogin: new Date() }, { where: { id: user.id } });
  res.json({ message: 'Login exitoso', token: signToken(user), userData: await userPayload(user.id) });
};

export const getMyOwnUser = async (req: Request, res: Response) => {
  res.json(await userPayload(req.user!.id));
};

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: USERNAME.optional(),
  roleId: z.number().int().optional(),
  password: PASSWORD.optional(),
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  dni: z.string().regex(/^\d{6,10}$/).nullish(),
  isActive: z.boolean().optional(),
});

export const updateUser = async (req: Request, res: Response) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw notFound('Usuario inválido');
  const { password, ...data } = req.body as z.infer<typeof updateUserSchema>;
  await user.update({ ...data, ...(password ? { password: await bcrypt.hash(password, 10) } : {}) });
  if (data.roleId) invalidateRoleCache();
  res.json(await User.findByPk(user.id, { include: Role }));
};

/**
 * Perfil propio. Lista blanca de campos: antes cualquier usuario podía enviar `roleId`
 * y convertirse en administrador.
 */
export const updateMeSchema = z.object({
  firstName: z.string().min(1).max(80).optional(),
  lastName: z.string().min(1).max(80).optional(),
  username: USERNAME.optional(),
  phone: z.string().max(40).nullish(),
  biography: z.string().max(1000).nullish(),
  avatar: z.string().url().max(500).nullish(),
});

export const updateMyOwnUser = async (req: Request, res: Response) => {
  const data = req.body as z.infer<typeof updateMeSchema>;
  if (data.username && (await User.count({ where: { username: data.username, id: { [Op.ne]: req.user!.id } } }))) {
    throw new HttpError(400, 'Datos inválidos', { newUsername: 'Ese nombre de usuario ya está en uso' });
  }
  await User.update(data, { where: { id: req.user!.id } });
  res.json(await userPayload(req.user!.id));
};

export const changePasswordSchema = z.object({ currentPassword: z.string().min(1), newPassword: PASSWORD });

export const changeMyOwnPassword = async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as z.infer<typeof changePasswordSchema>;
  const user = await User.scope('withPassword').findByPk(req.user!.id);
  if (!user) throw notFound('Usuario no encontrado');
  if (!(await bcrypt.compare(currentPassword, user.password))) throw unauthorized('Contraseña actual incorrecta');
  if (currentPassword === newPassword) throw badRequest('La nueva contraseña debe ser distinta de la actual.');
  await user.update({ password: await bcrypt.hash(newPassword, 10), mustChangePassword: false });
  res.json({ message: 'Contraseña cambiada con éxito' });
};

/** Cambio de contraseña de otro usuario (admin). Ya no exige la contraseña actual del otro usuario. */
export const changePassword = async (req: Request, res: Response) => {
  const { newPassword } = req.body as { newPassword: string };
  PASSWORD.parse(newPassword);
  const user = await User.findByPk(req.params.id);
  if (!user) throw notFound('Usuario no encontrado');
  await user.update({ password: await bcrypt.hash(newPassword, 10) });
  res.json({ message: 'Contraseña cambiada con éxito' });
};

export const resetPasswordByAdmin = async (req: Request, res: Response) => {
  const user = await User.findByPk(req.params.id);
  if (!user) throw notFound('Usuario no encontrado');
  const plain = tempPassword();
  await user.update({ password: await bcrypt.hash(plain, 10), mustChangePassword: true });
  const hasEmail = !user.email.endsWith('@sin-email.local');
  if (hasEmail) {
    sendMail({
      to: user.email,
      subject: 'Tu nueva contraseña - Sentryx',
      html: brandEmail({
        title: `¡Hola ${user.firstName}!`,
        paragraphs: ['Tu contraseña fue restablecida por un administrador.'],
        box: [`Usuario: ${user.dni ?? user.email}`, `Contraseña temporal: ${plain}`],
        cta: { label: 'Ingresar', url: `${env.FRONTEND_URL}/login` },
      }),
    });
  }
  // Si no tiene email, se devuelve una única vez para entregarla en mano.
  res.json({ message: hasEmail ? 'Contraseña reseteada y correo enviado' : 'Contraseña reseteada', tempPassword: hasEmail ? undefined : plain });
};

export const getUserCourses = async (req: Request, res: Response) => {
  const user = await User.findByPk(req.params.id, { include: [{ model: UserCourse, include: [Course] }] });
  if (!user) throw notFound('Usuario no encontrado');
  res.json(user.UserCourses);
};

export const addUserToCourse = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const courseId = Number(req.params.courseId);
  if (!(await User.count({ where: { id: userId } }))) throw notFound('Usuario no encontrado');
  if (!(await Course.count({ where: { id: courseId } }))) throw notFound('Curso no encontrado');
  const [userCourse, created] = await UserCourse.findOrCreate({ where: { userId, courseId }, defaults: { userId, courseId, grantedAt: new Date() } as any });
  if (!created) throw badRequest('El usuario ya tiene este curso asignado');
  res.status(201).json({ message: 'Curso asignado correctamente', userCourse });
};

export const syncUserCourses = async (req: Request, res: Response) => {
  const userId = Number(req.params.id);
  const courseIds = z.array(z.number().int()).parse(req.body.courseIds ?? []);
  if (!(await User.count({ where: { id: userId } }))) throw notFound('Usuario no encontrado');
  if (courseIds.length && (await Course.count({ where: { id: courseIds } })) !== courseIds.length) {
    throw notFound('Algunos cursos no fueron encontrados');
  }
  const existingIds = (await UserCourse.findAll({ where: { userId }, attributes: ['courseId'], raw: true })).map((a) => a.courseId);
  const toAdd = courseIds.filter((id) => !existingIds.includes(id));
  const toRemove = existingIds.filter((id) => !courseIds.includes(id));
  if (toAdd.length) await UserCourse.bulkCreate(toAdd.map((courseId) => ({ userId, courseId })) as any[]);
  if (toRemove.length) await UserCourse.destroy({ where: { userId, courseId: toRemove } });
  res.json({ message: 'Cursos sincronizados correctamente', added: toAdd.length, removed: toRemove.length });
};

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

export const requestPasswordReset = async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().trim().min(3) }).parse(req.body);
  const generic = { message: 'Si el usuario existe, enviamos un email para restablecer la contraseña.' };
  const user = await User.findOne({ where: email.includes('@') ? { email: email.toLowerCase() } : { dni: email.replace(/\D/g, '') } });
  if (!user || user.email.endsWith('@sin-email.local')) return res.json(generic);

  const token = crypto.randomBytes(32).toString('hex');
  await PasswordResetToken.destroy({ where: { userId: user.id } });
  // Se guarda el hash: si la base se filtrara, los tokens no sirven.
  await PasswordResetToken.create({ userId: user.id, token: hashToken(token), expiresAt: new Date(Date.now() + 3600_000) } as any);
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
};

export const resetPassword = async (req: Request, res: Response) => {
  const { token, password } = z.object({ token: z.string().min(10), password: PASSWORD }).parse(req.body);
  const record = await PasswordResetToken.findOne({ where: { token: hashToken(token) } });
  if (!record || record.expiresAt < new Date()) {
    if (record) await record.destroy();
    throw badRequest('El enlace es inválido o venció. Pedí uno nuevo.');
  }
  await User.update({ password: await bcrypt.hash(password, 10), mustChangePassword: false }, { where: { id: record.userId } });
  await record.destroy();
  res.json({ message: 'Contraseña reseteada correctamente' });
};

/** Búsqueda de la comunidad SRV (cursos). No expone email ni datos de familias/escuelas. */
export const searchUsers = async (req: Request, res: Response) => {
  const q = z.string().trim().min(2).max(60).parse(req.query.q);
  const users = await User.findAll({
    where: {
      isActive: true,
      [Op.or]: ['firstName', 'lastName', 'username'].map((f) => ({ [f]: { [Op.iLike]: `%${q}%` } })),
    },
    attributes: ['id', 'username', 'firstName', 'lastName', 'avatar', 'biography'],
    include: [{ model: Role, attributes: ['roleName'], where: { roleName: { [Op.in]: ['user', 'admin'] } } }],
    limit: 30,
  });
  res.json(users);
};
