/** Validaciones (zod) de programas de materias y juegos de preguntas. */
import { z } from 'zod';
import { idParam } from '../lib/http';

const text = (max = 20000) => z.string().trim().max(max).default('');

const programFields = {
  fundamentals: text(),
  objectives: text(),
  methodology: text(),
  evaluation: text(),
  bibliography: text(),
  fileIds: z.array(z.number().int().positive()).max(5).default([]),
};

const unit = z.object({
  /** Si viene, se actualiza esa unidad (así no se pierden los juegos enlazados). */
  id: z.number().int().positive().optional(),
  title: z.string().trim().min(1).max(160),
  contents: text(),
  learningGoals: text(),
  startDate: z.string().date().nullish(),
  endDate: z.string().date().nullish(),
});

/** GET /programs */
export const listPrograms = { query: z.object({ subjectId: z.coerce.number().int().optional() }) };
/** POST /programs */
export const createProgram = {
  body: z.object({ subjectId: z.number().int().positive(), divisionId: z.number().int().positive().nullish(), ...programFields, units: z.array(unit).max(30).default([]) }),
};
/** PUT /programs/:id */
export const updateProgram = { params: idParam, body: z.object({ ...programFields, units: z.array(unit).max(30) }) };
/** POST /programs/:id/publish */
export const publishProgram = { params: idParam, body: z.object({ published: z.boolean() }) };
export const programId = { params: idParam };

// ---------------- Juegos ----------------

const option = z.object({ text: z.string().trim().min(1, 'completá el texto de cada opción').max(120), correct: z.boolean() });
const question = z
  .object({
    id: z.string().trim().min(1).max(40),
    text: z.string().trim().min(1, 'escribí la pregunta').max(300),
    timeLimit: z.union([z.literal(5), z.literal(10), z.literal(20), z.literal(30), z.literal(60), z.literal(90), z.literal(120)]).default(20),
    points: z.union([z.literal(0), z.literal(1000), z.literal(2000)]).default(1000),
    options: z.array(option).min(2, 'cada pregunta necesita al menos 2 opciones').max(4),
  })
  .refine((q) => q.options.some((o) => o.correct), { message: 'marcá al menos una respuesta correcta', path: ['options'] });

const quizBody = z.object({
  title: z.string().trim().min(2).max(160),
  description: text(2000),
  subjectId: z.number().int().positive().nullish(),
  programUnitId: z.number().int().positive().nullish(),
  questions: z
    .array(question)
    .max(60)
    .refine((qs) => new Set(qs.map((q) => q.id)).size === qs.length, { message: 'hay preguntas repetidas: volvé a guardar' }),
});

/** GET /quizzes */
export const listQuizzes = { query: z.object({ scope: z.enum(['mine', 'school']).default('mine') }) };
/** POST /quizzes */
export const createQuiz = { body: quizBody };
/** PUT /quizzes/:id */
export const updateQuiz = { params: idParam, body: quizBody };
export const quizId = { params: idParam };

/** POST /quizzes/:id/assignments — como tarea para un curso. */
export const assignQuiz = {
  params: idParam,
  body: z.object({ divisionId: z.number().int().positive(), closesAt: z.coerce.date(), showAnswers: z.boolean().default(true) }),
};
export const assignmentId = { params: idParam };

/** POST /quiz-assignments/:id/attempt */
export const submitAttempt = {
  params: idParam,
  body: z.object({ answers: z.array(z.object({ questionId: z.string().max(40), option: z.number().int().min(0).max(3).nullable() })).max(60) }),
};

/** GET /quiz-results/student/:id */
export const studentResults = { params: idParam };

// ---------------- En vivo ----------------

export const gameId = { params: idParam };
export const kickPlayer = { params: z.object({ id: z.coerce.number().int().positive(), playerId: z.coerce.number().int().positive() }) };

/** POST /play/join (público) */
export const joinGame = {
  body: z.object({
    pin: z.string().trim().regex(/^\d{6}$/, 'el PIN tiene 6 números'),
    nickname: z.string().trim().min(1, 'escribí tu nombre').max(20, 'máximo 20 letras'),
  }),
};
/** POST /play/answer (público, con X-Player-Token) */
export const answerQuestion = { body: z.object({ questionIndex: z.number().int().min(0), option: z.number().int().min(0).max(3) }) };
