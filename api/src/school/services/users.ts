import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { User, Role } from '../../models';
import { sendMail } from '../../config/mailer';
import { brandEmail } from '../../lib/emailTemplate';
import { env } from '../../config/env';
import { conflict } from '../../lib/http';

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  dni?: string | null;
  phone?: string | null;
}

/** Rol global asignado a personal y familias: solo acceso a su perfil (el resto lo dan los roles escolares). */
export const SCHOOL_GLOBAL_ROLE = 'escuela';

let schoolRoleId: number | null = null;
export const getSchoolGlobalRoleId = async () => {
  if (schoolRoleId) return schoolRoleId;
  const [role] = await Role.findOrCreate({
    where: { roleName: SCHOOL_GLOBAL_ROLE },
    defaults: { roleName: SCHOOL_GLOBAL_ROLE, description: 'Personal y familias de instituciones educativas' } as any,
  });
  schoolRoleId = role.id;
  return schoolRoleId;
};

/** Contraseña temporal legible (sin caracteres confusos como 0/O, 1/l) para dictar o imprimir. */
export const tempPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from(crypto.randomBytes(10), (b) => chars[b % chars.length]).join('');
};

const normDni = (dni?: string | null) => (dni ? dni.replace(/\D/g, '') || null : null);
const normEmail = (email?: string | null) => (email ? email.trim().toLowerCase() || null : null);

const uniqueUsername = async (base: string, transaction?: Transaction) => {
  const clean = base.toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20) || 'usuario';
  for (let i = 0; i < 20; i++) {
    const candidate = i ? `${clean}${crypto.randomInt(100, 9999)}` : clean;
    if (!(await User.count({ where: { username: candidate }, transaction }))) return candidate;
  }
  return `${clean}${Date.now()}`;
};

/**
 * Busca por DNI o email; si no existe lo crea con contraseña temporal y cambio obligatorio.
 * Devuelve la contraseña temporal SOLO si se creó (para enviarla o entregarla impresa).
 */
export const findOrCreatePerson = async (input: PersonInput, transaction?: Transaction) => {
  const dni = normDni(input.dni);
  const email = normEmail(input.email);
  const or = [...(dni ? [{ dni }] : []), ...(email ? [{ email }] : [])];
  if (!or.length) throw conflict(`${input.firstName} ${input.lastName}: se necesita DNI o email.`);

  const existing = await User.findOne({ where: { [Op.or]: or }, transaction });
  if (existing) {
    // Completa datos faltantes sin pisar los existentes.
    let changed = false;
    if (!existing.dni && dni) (existing.dni = dni), (changed = true);
    if (!existing.phone && input.phone) (existing.phone = input.phone), (changed = true);
    if (changed) await existing.save({ transaction });
    return { user: existing, tempPassword: null as string | null, created: false };
  }

  const password = tempPassword();
  const user = await User.create(
    {
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      // Familias sin email ingresan con DNI; el email técnico no recibe correos.
      email: email ?? `${dni}@sin-email.local`,
      dni,
      phone: input.phone ?? null,
      username: await uniqueUsername(email?.split('@')[0] ?? `${input.firstName}${input.lastName}`, transaction),
      password: await bcrypt.hash(password, 10),
      roleId: await getSchoolGlobalRoleId(),
      mustChangePassword: true,
      biography: null,
      avatar: null,
      lastLogin: null,
    },
    { transaction }
  );
  return { user, tempPassword: password, created: true };
};

export const sendWelcome = (user: User, password: string, schoolName: string) => {
  if (!user.email || user.email.endsWith('@sin-email.local')) return;
  sendMail({
    to: user.email,
    subject: `Tu acceso a ${schoolName} en Sentryx`,
    html: brandEmail({
      title: `¡Hola ${user.firstName}!`,
      paragraphs: [
        `${schoolName} te dio acceso a Sentryx: comunicados, mensajes, notas y asistencia en un solo lugar.`,
        'Podés ingresar con tu email o tu DNI. Al entrar por primera vez te vamos a pedir que cambies la contraseña.',
      ],
      box: [`Usuario: ${user.dni ?? user.email}`, `Contraseña temporal: ${password}`],
      cta: { label: 'Ingresar', url: `${env.FRONTEND_URL}/login` },
      footnote: 'Tip: desde el celular, abrí el sitio y elegí "Agregar a pantalla de inicio" para recibir avisos al instante.',
    }),
  });
};
