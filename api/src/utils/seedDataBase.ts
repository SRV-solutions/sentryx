import { Role, Permission, RolePermission, Course, Module, Lesson } from '../models';
import { Action, Entity } from '../models/enums';
import { SCHOOL_GLOBAL_ROLE } from '../school/services/users';
import { PYTHON_COURSE, BACKEND_AVANZADO, INTRODUCCION_BACKEND } from './courses';

const ROLE_DEFAULTS: Record<string, { description: string; perms: Array<[Entity, Action]> }> = {
  admin: {
    description: 'Administrador de SRV con acceso total',
    perms: Object.values(Entity).flatMap((e) => Object.values(Action).map((a) => [e, a] as [Entity, Action])),
  },
  user: {
    description: 'Alumno de cursos SRV',
    perms: [
      ...Object.values(Entity).map((e) => [e, Action.READ] as [Entity, Action]),
      [Entity.CHATS, Action.CREATE],
    ],
  },
  [SCHOOL_GLOBAL_ROLE]: {
    description: 'Personal y familias de instituciones (permisos vía roles escolares)',
    perms: [[Entity.USERS, Action.READ]],
  },
};

/**
 * Idempotente: crea permisos y roles base si faltan. Se ejecuta en cada arranque sin riesgo
 * (reemplaza al viejo FORCE_SYNC + seed que podía borrar la base).
 */
export const ensureBaseData = async () => {
  const existing = await Permission.findAll();
  const key = (e: string, a: string) => `${e}:${a}`;
  const byKey = new Map(existing.map((p) => [key(p.entity, p.action), p]));
  for (const e of Object.values(Entity)) {
    for (const a of Object.values(Action)) {
      if (!byKey.has(key(e, a))) byKey.set(key(e, a), await Permission.create({ entity: e, action: a } as any));
    }
  }
  for (const [roleName, def] of Object.entries(ROLE_DEFAULTS)) {
    const [role, created] = await Role.findOrCreate({ where: { roleName }, defaults: { roleName, description: def.description } as any });
    if (!created) continue;
    await RolePermission.bulkCreate(def.perms.map(([e, a]) => ({ roleId: role.id, permissionId: byKey.get(key(e, a))!.id })) as any[]);
  }
};

type CourseData = Array<{ moduleTitle: string; lessons: Array<{ title: string; url: string; description?: string }> }>;

/** Carga los cursos de SRV (solo para entornos nuevos de desarrollo). */
export const seedCourses = async () => {
  if (await Course.count()) return;
  const courses: Array<{ title: string; description: string; thumbnailUrl: string; content: CourseData }> = [
    { title: 'Python desde Cero', description: 'APRENDÉ PYTHON DESDE CERO Y DESBLOQUEÁ UN MUNDO DE POSIBILIDADES', thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOPYTHONGRANDE.png', content: PYTHON_COURSE },
    { title: 'Fundamentos de Backend', description: '¡CONVERTITE EN DESARROLLADOR WEB EN 9 SEMANAS!', thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOFUNDAMENTOSBACKENDGRANDE.png', content: INTRODUCCION_BACKEND },
    { title: 'Backend Avanzado', description: 'Llevá tus habilidades al siguiente nivel: Dominá el Backend Profesional.', thumbnailUrl: 'https://imagenes-landing.s3.us-east-1.amazonaws.com/nuevaweb/LOGOBACKENDAVANZADOGRANDE.png', content: BACKEND_AVANZADO },
  ];
  for (const c of courses) {
    const course = await Course.create({ title: c.title, description: c.description, thumbnailUrl: c.thumbnailUrl } as any);
    for (const [i, mod] of c.content.entries()) {
      const m = await Module.create({ courseId: course.id, title: mod.moduleTitle, order: i + 1 } as any);
      await Lesson.bulkCreate(
        mod.lessons.map((l, j) => ({ moduleId: m.id, title: l.title, description: l.description ?? '', youtubeUrl: l.url, order: j + 1 })) as any[]
      );
    }
  }
};
