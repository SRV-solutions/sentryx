/**
 * Alta inicial en producción (se corre una sola vez por escuela):
 *
 *   node dist/scripts/bootstrap.js --school "Colegio San Martín" --slug colegio-san-martin \
 *     --levels INICIAL,PRIMARIO,SECUNDARIO --year 2027 \
 *     --admin-email directora@colegio.edu.ar --admin-first Ana --admin-last Pérez [--admin-dni 20111222] [--srv-admin]
 *
 * Crea la escuela (niveles, ciclo, períodos y reglas de alerta por defecto) y su Representante Legal con
 * contraseña temporal (se muestra una sola vez). Con --srv-admin, el usuario además es administrador global de SRV.
 */
import * as M from '../models';
import { createSchool } from '../school/services/setup';
import { findOrCreatePerson } from '../school/services/users';
import { ensureBaseData } from '../utils/seedDataBase';
import { LEVEL_TYPES, LevelType } from '../school/constants';

const arg = (name: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};

const run = async () => {
  const name = arg('school');
  const slug = arg('slug');
  const email = arg('admin-email');
  const firstName = arg('admin-first');
  const lastName = arg('admin-last');
  if (!name || !slug || !email || !firstName || !lastName) {
    console.error('Faltan parámetros. Ver el encabezado de src/scripts/bootstrap.ts');
    process.exit(1);
  }
  const levels = (arg('levels') ?? 'INICIAL,PRIMARIO,SECUNDARIO').split(',').map((l) => l.trim().toUpperCase()) as LevelType[];
  if (!levels.every((l) => (LEVEL_TYPES as readonly string[]).includes(l))) throw new Error(`Niveles válidos: ${LEVEL_TYPES.join(', ')}`);
  const year = Number(arg('year') ?? new Date().getFullYear());

  await M.sequelize.authenticate();
  await ensureBaseData();

  if (await M.School.findOne({ where: { slug } })) throw new Error(`Ya existe una escuela con slug "${slug}".`);
  const school = await createSchool({ name, slug, cue: arg('cue') ?? null, levels, year });
  const { user, tempPassword } = await findOrCreatePerson({ firstName, lastName, email, dni: arg('admin-dni') ?? null });
  await M.Membership.create({ userId: user.id, schoolId: school.id, role: 'REPRESENTANTE_LEGAL', levelId: null, title: null });

  if (process.argv.includes('--srv-admin')) {
    const admin = await M.Role.findOne({ where: { roleName: 'admin' } });
    await user.update({ roleId: admin!.id });
  }

  console.log(`\n✅ Escuela "${name}" creada (id ${school.id}) con niveles ${levels.join(', ')} y ciclo ${year}.`);
  console.log(`   Representante Legal: ${email}`);
  console.log(tempPassword ? `   Contraseña temporal (se muestra UNA vez): ${tempPassword}\n` : '   (el usuario ya existía: conserva su contraseña)\n');
  await M.sequelize.close();
};

run().catch((err) => {
  console.error('❌', err.message ?? err);
  process.exit(1);
});
