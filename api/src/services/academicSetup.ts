import { Transaction } from 'sequelize';
import { Level, Division, Subject, GradingPeriod, Grade, ReportCardPublication, AcademicYear, TeachingAssignment, sequelize } from '../models';
import { LevelType, PeriodKind, gradingModeOf, kindsForMode } from '../constants/school';
import { badRequest, conflict } from '../lib/http';

/**
 * CONFIGURACIÓN ACADÉMICA
 *  - Estructura por defecto para un colegio nuevo (salas, grados, años y materias).
 *  - Esquema de evaluación (trimestral / bimestral) con fechas, aplicable a todos los niveles.
 *  - Copia de la estructura de un ciclo al siguiente (para la promoción anual).
 */

// ---------------- Estructura por defecto ----------------

export interface DefaultStructureOptions {
  /** Años de Primaria (6 en CABA/PBA, 7 en varias provincias). */
  primaryYears: 6 | 7;
  /** Años de Secundaria (6 en PBA, 5 en CABA y otras). */
  secondaryYears: 5 | 6;
  /** Secciones por grado, ej: ['A'] o ['A', 'B']. Una sola sección no agrega letra al nombre. */
  sections: string[];
  shift: string;
  createSubjects: boolean;
  /** Solo estos niveles (por defecto, todos los del colegio). */
  levelIds?: number[];
}

/** Cursos por nivel: [nombre base, año/grado]. El año ordena la promoción (Sala de 5 → 1º grado). */
const divisionTemplates = (type: LevelType, options: DefaultStructureOptions): Array<[string, number]> => {
  if (type === 'INICIAL') return [['Sala de 3', 3], ['Sala de 4', 4], ['Sala de 5', 5]];
  if (type === 'PRIMARIO') return Array.from({ length: options.primaryYears }, (_, i) => [`${i + 1}º grado`, i + 1]);
  return Array.from({ length: options.secondaryYears }, (_, i) => [`${i + 1}º año`, i + 1]);
};

export const DEFAULT_SUBJECTS: Record<LevelType, string[]> = {
  INICIAL: ['Sala'],
  PRIMARIO: ['Prácticas del Lenguaje', 'Matemática', 'Ciencias Naturales', 'Ciencias Sociales', 'Inglés', 'Educación Física', 'Educación Artística'],
  SECUNDARIO: ['Lengua y Literatura', 'Matemática', 'Historia', 'Geografía', 'Biología', 'Físico-Química', 'Inglés', 'Educación Física', 'Construcción de Ciudadanía'],
};

/** Crea las salas, grados y años que falten (no duplica ni toca los existentes). */
export const createDefaultStructure = async (schoolId: number, academicYearId: number, options: DefaultStructureOptions) =>
  sequelize.transaction(async (transaction) => {
    const levels = await Level.findAll({ where: { schoolId, ...(options.levelIds?.length ? { id: options.levelIds } : {}) }, transaction });
    const existing = new Set(
      (await Division.findAll({ where: { schoolId, academicYearId }, attributes: ['levelId', 'name'], raw: true, transaction })).map((d) => `${d.levelId}:${d.name.toLowerCase()}`)
    );
    const sections = options.sections.length ? options.sections : ['A'];
    const created: string[] = [];
    let subjectsCreated = 0;
    for (const level of levels) {
      for (const [baseName, gradeYear] of divisionTemplates(level.type, options)) {
        for (const section of sections) {
          const name = sections.length > 1 ? `${baseName} ${section}` : baseName;
          if (existing.has(`${level.id}:${name.toLowerCase()}`)) continue;
          await Division.create(
            { schoolId, levelId: level.id, academicYearId, name, gradeYear, section: sections.length > 1 ? section : null, shift: options.shift },
            { transaction }
          );
          created.push(`${level.name} · ${name}`);
        }
      }
      if (options.createSubjects) {
        const ownSubjects = new Set((await Subject.findAll({ where: { levelId: level.id }, attributes: ['name'], raw: true, transaction })).map((s) => s.name.toLowerCase()));
        for (const name of DEFAULT_SUBJECTS[level.type]) {
          if (ownSubjects.has(name.toLowerCase())) continue;
          await Subject.create({ schoolId, levelId: level.id, name, code: null, gradeYear: null } as never, { transaction });
          subjectsCreated++;
        }
      }
    }
    return { divisionsCreated: created.length, divisions: created, subjectsCreated };
  });

/** Copia los cursos de un ciclo a otro (mismos nombres, niveles y turnos). Opcional: también los docentes asignados. */
export const copyDivisionsToYear = async (schoolId: number, fromYearId: number, toYearId: number, copyAssignments: boolean, transaction?: Transaction) => {
  const [source, target] = await Promise.all([
    Division.findAll({ where: { schoolId, academicYearId: fromYearId }, transaction }),
    Division.findAll({ where: { schoolId, academicYearId: toYearId }, attributes: ['levelId', 'name'], raw: true, transaction }),
  ]);
  const existing = new Set(target.map((d) => `${d.levelId}:${d.name.toLowerCase()}`));
  let created = 0;
  for (const division of source) {
    if (existing.has(`${division.levelId}:${division.name.toLowerCase()}`)) continue;
    const copy = await Division.create(
      { schoolId, levelId: division.levelId, academicYearId: toYearId, name: division.name, gradeYear: division.gradeYear, section: division.section, shift: division.shift },
      { transaction }
    );
    created++;
    if (copyAssignments) {
      const assignments = await TeachingAssignment.findAll({ where: { divisionId: division.id }, transaction });
      if (assignments.length) {
        await TeachingAssignment.bulkCreate(
          assignments.map((a) => ({ schoolId, divisionId: copy.id, subjectId: a.subjectId as number, teacherId: a.teacherId as number })),
          { transaction, ignoreDuplicates: true }
        );
      }
    }
  }
  return created;
};

// ---------------- Esquema de evaluación ----------------

export const GRADING_SCHEMES = ['TRIMESTRAL', 'BIMESTRAL'] as const;
export type GradingScheme = (typeof GRADING_SCHEMES)[number];

interface PeriodSpec {
  name: string;
  groupName: string | null;
  kind: PeriodKind;
}

/** Períodos de cada nivel según el esquema. Secundario bimestral: 1º bimestre de cada cuatrimestre conceptual, 2º numérico. */
/** Nombres según nivel/esquema; tipo de nota según el modo de calificación del nivel. */
export const periodsFor = (level: { type: LevelType; settings: Level['settings'] }, scheme: GradingScheme): PeriodSpec[] => {
  const count = scheme === 'TRIMESTRAL' ? 3 : 4;
  const kinds = kindsForMode(gradingModeOf(level), count);
  if (level.type === 'INICIAL') return kinds.map((kind, i) => ({ name: `${i + 1}º Informe`, groupName: null, kind }));
  if (level.type === 'PRIMARIO' || scheme === 'TRIMESTRAL') return kinds.map((kind, i) => ({ name: `${i + 1}º ${scheme === 'TRIMESTRAL' ? 'Trimestre' : 'Bimestre'}`, groupName: null, kind }));
  // Secundario bimestral: agrupado por cuatrimestre (habilita la nota de cuatrimestre).
  return kinds.map((kind, i) => ({ name: `${i + 1}º Bimestre`, groupName: i < 2 ? '1º Cuatrimestre' : '2º Cuatrimestre', kind }));
};

export interface DateRange {
  startDate: string;
  endDate: string;
}

const assertRanges = (ranges: DateRange[], expected: number) => {
  if (ranges.length !== expected) throw badRequest(`El esquema necesita ${expected} rangos de fechas (uno por período).`);
  ranges.forEach((range, i) => {
    if (range.startDate > range.endDate) throw badRequest(`Período ${i + 1}: la fecha "desde" es posterior a "hasta".`);
    if (i > 0 && range.startDate <= ranges[i - 1].endDate) throw badRequest(`Período ${i + 1}: se superpone con el anterior.`);
  });
};

/**
 * Aplica el esquema y las fechas a los niveles elegidos del ciclo.
 *  - Si un nivel ya tiene la misma cantidad de períodos, se actualizan nombres y fechas (las notas se conservan;
 *    el tipo de nota solo cambia si el período todavía no tiene notas cargadas).
 *  - Si la cantidad cambia, se rearma el esquema solo cuando el nivel no tiene notas ni boletines publicados.
 */
export const applyGradingScheme = async (schoolId: number, academicYearId: number, scheme: GradingScheme, ranges: DateRange[], levelIds?: number[]) => {
  const expected = scheme === 'TRIMESTRAL' ? 3 : 4;
  assertRanges(ranges, expected);
  const year = await AcademicYear.findOne({ where: { id: academicYearId, schoolId } });
  if (!year) throw badRequest('Ciclo lectivo inexistente.');
  const levels = await Level.findAll({ where: { schoolId, ...(levelIds?.length ? { id: levelIds } : {}) } });
  const summary: Array<{ level: string; result: 'actualizado' | 'rearmado' }> = [];

  await sequelize.transaction(async (transaction) => {
    for (const level of levels) {
      const specs = periodsFor(level, scheme);
      const periods = await GradingPeriod.findAll({ where: { levelId: level.id, academicYearId }, order: [['order', 'ASC']], transaction });
      const periodIds = periods.map((p) => p.id);
      const gradedPeriodIds = new Set(
        periodIds.length ? (await Grade.findAll({ where: { periodId: periodIds }, attributes: ['periodId'], group: ['periodId'], raw: true, transaction })).map((g) => g.periodId as number) : []
      );

      if (periods.length === specs.length) {
        for (const [i, period] of periods.entries()) {
          await period.update(
            {
              name: specs[i].name,
              groupName: specs[i].groupName,
              kind: gradedPeriodIds.has(period.id) ? period.kind : specs[i].kind,
              startDate: ranges[i].startDate,
              endDate: ranges[i].endDate,
            },
            { transaction }
          );
        }
        summary.push({ level: level.name, result: 'actualizado' });
        continue;
      }

      const published = periodIds.length ? await ReportCardPublication.count({ where: { periodId: periodIds }, transaction }) : 0;
      if (gradedPeriodIds.size || published) {
        throw conflict(`${level.name} ya tiene notas o boletines en el esquema actual (${periods.length} períodos). Solo se pueden cambiar las fechas, no la cantidad de períodos.`);
      }
      // Períodos vacíos (sin notas ni publicaciones): se reemplazan por los del esquema nuevo.
      if (periodIds.length) await GradingPeriod.destroy({ where: { id: periodIds }, transaction });
      await GradingPeriod.bulkCreate(
        specs.map((spec, i) => ({
          schoolId,
          levelId: level.id,
          academicYearId,
          name: spec.name,
          groupName: spec.groupName,
          kind: spec.kind,
          order: i + 1,
          startDate: ranges[i].startDate,
          endDate: ranges[i].endDate,
          closedAt: null,
        })),
        { transaction }
      );
      summary.push({ level: level.name, result: 'rearmado' });
    }
  });
  return summary;
};

/** Fechas sugeridas: reparte el ciclo lectivo en partes iguales. */
export const suggestRanges = (startDate: string, endDate: string, count: number): DateRange[] => {
  const start = new Date(`${startDate}T12:00:00Z`).getTime();
  const end = new Date(`${endDate}T12:00:00Z`).getTime();
  const step = (end - start) / count;
  const day = 86_400_000;
  return Array.from({ length: count }, (_, i) => ({
    startDate: new Date(start + step * i + (i ? day : 0)).toISOString().slice(0, 10),
    endDate: new Date(i === count - 1 ? end : start + step * (i + 1)).toISOString().slice(0, 10),
  }));
};

