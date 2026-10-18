/**
 * Crea (o promueve) un superadmin de la plataforma Sentryx: el equipo que da de alta colegios
 * y ve la facturación de todos. Es un rol de PLATAFORMA (UserRole sin colegio).
 *
 *   npm run superadmin -- --email equipo@sentryx.com --first Nombre --last Apellido
 *   npm run superadmin -- --email alguien@colegio.edu.ar --remove     (le quita el rol)
 *
 * Si la cuenta es nueva, la contraseña temporal se muestra UNA sola vez.
 */
import bcrypt from 'bcrypt';
import * as M from '../models';
import { RoleCode } from '../constants/roles';
import { syncRbacCatalog, grantPlatformRole, revokePlatformRole } from '../services/rbac';
import { tempPassword } from '../services/accounts';

const argument = (name: string) => {
  const index = process.argv.indexOf(`--${name}`);
  return index > -1 ? process.argv[index + 1] : undefined;
};

const run = async () => {
  const email = argument('email')?.toLowerCase();
  if (!email) throw new Error('Indicá --email');
  await M.sequelize.authenticate();
  await syncRbacCatalog();
  let user = await M.User.findOne({ where: { email } });

  if (process.argv.includes('--remove')) {
    if (!user) throw new Error('No existe esa cuenta.');
    await revokePlatformRole(user.id, RoleCode.SUPERADMIN);
    console.log(`✅ ${email} ya no es superadmin.`);
    return M.sequelize.close();
  }

  let temporaryPassword: string | null = null;
  if (!user) {
    temporaryPassword = tempPassword();
    user = await M.User.create({
      email,
      firstName: argument('first') ?? 'Equipo',
      lastName: argument('last') ?? 'Sentryx',
      username: email.split('@')[0].replace(/[^a-z0-9_-]/g, '').slice(0, 20) + Date.now().toString().slice(-4),
      password: await bcrypt.hash(temporaryPassword, 10),
      mustChangePassword: true,
      dni: null,
      phone: null,
      biography: null,
      avatar: null,
      lastLogin: null,
    });
  }
  await grantPlatformRole(user.id, RoleCode.SUPERADMIN);
  console.log(`\n✅ ${email} es superadmin de Sentryx.`);
  if (temporaryPassword) console.log(`   Contraseña temporal (se muestra UNA vez): ${temporaryPassword}\n`);
  await M.sequelize.close();
};

run().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
