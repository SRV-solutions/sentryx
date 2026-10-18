import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { Op, Transaction } from 'sequelize';
import { User } from '../models';
import { RoleCode } from '../constants/roles';
import { platformRolesOf } from './rbac';
import { invalidateAccountCache } from '../middlewares/authenticate';
import { sendMail } from '../config/mailer';
import { brandEmail } from '../lib/emailTemplate';
import { env } from '../config/env';
import { conflict, badRequest, notFound } from '../lib/http';

export interface PersonInput {
  firstName: string;
  lastName: string;
  email?: string | null;
  dni?: string | null;
  phone?: string | null;
}

/** Datos de la cuenta propia que recibe la app al ingresar y en /users/me. */
export const accountPayload = async (userId: number) => {
  const user = await User.findByPk(userId);
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
    mustChangePassword: user.mustChangePassword,
    /** Equipo de Sentryx: ve la consola de la plataforma (colegios y facturación). */
    isSuperAdmin: (await platformRolesOf(user.id)).includes(RoleCode.SUPERADMIN),
  };
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

const TECH_EMAIL = '@sin-email.local';
export const isTechEmail = (email?: string | null) => !email || email.endsWith(TECH_EMAIL);

/** Compara nombres sin tildes ni mayúsculas: "José Pérez" ≈ "jose perez". */
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
const tokens = (s: string) => norm(s).split(/\s+/).filter(Boolean);
const samePerson = (u: { firstName: string; lastName: string }, input: { firstName: string; lastName: string }) => {
  const first = tokens(input.firstName)[0];
  const last = new Set(tokens(u.lastName));
  return tokens(u.firstName).includes(first) || tokens(input.lastName).some((t) => last.has(t));
};
const mask = (dni: string) => `***${dni.slice(-3)}`;

/**
 * Identifica a la persona por DNI (prioritario) o por email, y si no existe la crea con contraseña
 * temporal y cambio obligatorio. Devuelve la contraseña temporal SOLO si se creó.
 *
 * Antes se buscaba "DNI **o** email": si mamá y papá compartían el email de la familia, el segundo
 * familiar se resolvía al usuario del primero y no se guardaba. Ahora cualquier ambigüedad
 * (email de otra persona, DNI y email de usuarios distintos) se rechaza con un mensaje claro.
 */
export const findOrCreatePerson = async (input: PersonInput, transaction?: Transaction) => {
  const who = `${input.firstName} ${input.lastName}`.trim();
  const dni = normDni(input.dni);
  let email = normEmail(input.email);
  if (email && isTechEmail(email)) email = null;
  if (!dni && !email) throw badRequest(`${who}: cargá el DNI o el email (se usa para ingresar).`);
  if (dni && (dni.length < 7 || dni.length > 9)) throw badRequest(`${who}: el DNI debe tener 7 u 8 dígitos.`);

  const [byDni, byEmail] = await Promise.all([
    dni ? User.findOne({ where: { dni }, transaction }) : null,
    email ? User.findOne({ where: { email }, transaction }) : null,
  ]);

  if (byDni && byEmail && byDni.id !== byEmail.id) {
    throw conflict(
      `${who}: el DNI pertenece a ${byDni.firstName} ${byDni.lastName} pero el email ${email} está registrado a nombre de ${byEmail.firstName} ${byEmail.lastName}. Revisá los datos.`
    );
  }

  const existing = byDni ?? byEmail;
  if (existing) {
    if (!byDni && byEmail) {
      // Coincide solo el email: puede ser el email compartido de la familia.
      if (dni && byEmail.dni && byEmail.dni !== dni) {
        throw conflict(`${who}: el email ${email} ya lo usa otra persona (${byEmail.firstName} ${byEmail.lastName}, DNI ${mask(byEmail.dni)}). Cargá un email propio o dejalo vacío e ingresará con su DNI.`);
      }
      if (!samePerson(byEmail, input)) {
        throw conflict(`${who}: el email ${email} ya está registrado a nombre de ${byEmail.firstName} ${byEmail.lastName}. Si es otra persona, cargá su DNI y un email propio (o dejá el email vacío).`);
      }
    }
    if (byDni && !samePerson(byDni, input)) {
      throw conflict(`${who}: el DNI ${dni} ya está registrado a nombre de ${byDni.firstName} ${byDni.lastName}. Revisá que esté bien escrito.`);
    }
    // Completa datos faltantes sin pisar los existentes.
    let changed = false;
    if (!existing.dni && dni) (existing.dni = dni), (changed = true);
    if (isTechEmail(existing.email) && email && !byEmail) (existing.email = email), (changed = true);
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
      email: email ?? `${dni}${TECH_EMAIL}`,
      dni,
      phone: input.phone ?? null,
      username: await uniqueUsername(email?.split('@')[0] ?? `${input.firstName}${input.lastName}`, transaction),
      password: await bcrypt.hash(password, 10),
      mustChangePassword: true,
      biography: null,
      avatar: null,
      lastLogin: null,
    },
    { transaction }
  );
  return { user, tempPassword: password, created: true };
};

/**
 * Genera una contraseña temporal nueva, obliga a cambiarla al ingresar y la envía por email si tiene.
 * Cierra todas las sesiones abiertas de esa cuenta (sube tokenVersion).
 */
export const resetToTemporaryPassword = async (user: User, schoolName: string) => {
  const plain = tempPassword();
  await User.update(
    { password: await bcrypt.hash(plain, 10), mustChangePassword: true, tokenVersion: user.tokenVersion + 1 },
    { where: { id: user.id } }
  );
  invalidateAccountCache(user.id);
  const emailed = !isTechEmail(user.email);
  if (emailed) {
    sendMail({
      to: user.email,
      subject: `Tu nueva contraseña de ${schoolName} en Sentryx`,
      html: brandEmail({
        title: `¡Hola ${user.firstName}!`,
        paragraphs: [`${schoolName} restableció tu contraseña de Sentryx. Al ingresar te vamos a pedir que elijas una nueva.`],
        box: [`Usuario: ${user.dni ?? user.email}`, `Contraseña temporal: ${plain}`],
        cta: { label: 'Ingresar', url: `${env.FRONTEND_URL}/login` },
        footnote: 'Si no pediste este cambio, avisale a la institución.',
      }),
    });
  }
  return { tempPassword: plain, emailed, login: user.dni ?? user.email };
};

export const sendWelcome = (user: User, password: string, schoolName: string) => {
  if (isTechEmail(user.email)) return;
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
