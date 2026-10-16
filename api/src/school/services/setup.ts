import { Transaction } from 'sequelize';
import { School, Level, AcademicYear, GradingPeriod, AttendanceRule, sequelize } from '../../models';
import { DEFAULT_LEVEL_SETTINGS, DEFAULT_PERIODS, LevelType } from '../constants';

const LEVEL_NAMES: Record<LevelType, string> = { INICIAL: 'Inicial', PRIMARIO: 'Primario', SECUNDARIO: 'Secundario' };

/** Crea los períodos por defecto de un nivel para un ciclo (si todavía no tiene). */
export const ensurePeriods = async (level: Level, year: AcademicYear, transaction?: Transaction) => {
  const count = await GradingPeriod.count({ where: { levelId: level.id, academicYearId: year.id }, transaction });
  if (count) return;
  await GradingPeriod.bulkCreate(
    DEFAULT_PERIODS[level.type].map((p, i) => ({
      schoolId: level.schoolId,
      levelId: level.id,
      academicYearId: year.id,
      name: p.name,
      groupName: p.groupName,
      kind: p.kind,
      order: i + 1,
      startDate: null,
      endDate: null,
      closedAt: null,
    })),
    { transaction }
  );
};

/**
 * Reglas de ejemplo para arrancar. Son editables desde el panel de alertas:
 * cuando esté la normativa se ajustan umbrales sin tocar código.
 */
const DEFAULT_RULES = [
  { name: '3 inasistencias consecutivas', type: 'CONSECUTIVE', threshold: 3, severity: 'WARNING', notifyGuardians: true },
  { name: '10 inasistencias en el ciclo', type: 'TOTAL', threshold: 10, severity: 'WARNING', notifyGuardians: false },
  { name: '20 inasistencias en el ciclo', type: 'TOTAL', threshold: 20, severity: 'CRITICAL', notifyGuardians: true },
  { name: 'Más del 15% de inasistencia', type: 'PERCENT', threshold: 15, severity: 'CRITICAL', notifyGuardians: false },
] as const;

export const createSchool = async (input: {
  name: string;
  slug: string;
  cue?: string | null;
  levels: LevelType[];
  year: number;
}) =>
  sequelize.transaction(async (transaction) => {
    const school = await School.create(
      { name: input.name, slug: input.slug, cue: input.cue ?? null, address: null, phone: null, email: null, logoUrl: null },
      { transaction }
    );
    const year = await AcademicYear.create(
      { schoolId: school.id, year: input.year, startDate: `${input.year}-03-01`, endDate: `${input.year}-12-20`, isCurrent: true },
      { transaction }
    );
    for (const type of input.levels) {
      const level = await Level.create(
        { schoolId: school.id, type, name: LEVEL_NAMES[type], settings: DEFAULT_LEVEL_SETTINGS[type] },
        { transaction }
      );
      await ensurePeriods(level, year, transaction);
    }
    await AttendanceRule.bulkCreate(
      DEFAULT_RULES.map((r) => ({ ...r, schoolId: school.id, levelId: null, windowDays: null, countJustified: true })),
      { transaction }
    );
    return school;
  });
