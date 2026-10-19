/**
 * Juegos de preguntas "tipo Kahoot" (plan Integral del docente): se crean con preguntas de opción
 * múltiple, se enlazan a una unidad del programa y se juegan EN VIVO (PIN) o como TAREA de un curso.
 * Los estudiantes participan sin importar su plan; las familias con plan Integral ven los resultados.
 * Rutas en routes/teaching.routes.ts (y /play en routes/play.routes.ts).
 */
import { z } from 'zod';
import { QueryTypes } from 'sequelize';
import { Quiz, QuizAssignment, QuizAttempt, LiveGame, LivePlayer, ProgramUnit, Subject, Division, Student, User, SubjectProgram, sequelize } from '../models';
import { asyncHandler, badRequest, conflict, forbidden, notFound } from '../lib/http';
import { Entity, Action } from '../constants/permissions';
import { PlanFeature } from '../constants/plans';
import { SchoolSession, assertStudentAccess } from '../services/schoolSession';
import { canPostInDivision } from './files.controller';
import { notify } from '../services/notifications';
import { audit } from '../services/audit';
import { planRequiredError } from '../middlewares/requireFeature';
import * as LiveGames from '../services/liveGames';
import type { AttemptAnswer, QuizQuestion } from '../models/school/teaching';
import * as Validator from '../validators/programs.validator';

const quizInclude = [
  { model: Subject, attributes: ['id', 'name'] },
  { model: ProgramUnit, attributes: ['id', 'title', 'order'] },
  { model: User, as: 'Author', attributes: ['id', 'firstName', 'lastName'] },
];

const canManage = (session: SchoolSession, quiz: Quiz) => quiz.authorId === session.userId;
const canView = (session: SchoolSession, quiz: Quiz) => canManage(session, quiz) || session.can(Entity.QUIZZES, Action.READ);

const findQuiz = async (session: SchoolSession, id: number, mode: 'view' | 'manage' = 'manage') => {
  const quiz = await Quiz.findOne({ where: { id, schoolId: session.schoolId }, include: quizInclude });
  if (!quiz) throw notFound();
  if (!(mode === 'view' ? canView(session, quiz) : canManage(session, quiz))) throw forbidden('Ese juego es de otro docente.');
  return quiz;
};

/** La unidad enlazada tiene que ser de un programa de este colegio. */
const assertUnit = async (session: SchoolSession, programUnitId?: number | null) => {
  if (!programUnitId) return;
  const unit = await ProgramUnit.findByPk(programUnitId, { include: [{ model: SubjectProgram, attributes: ['schoolId'] }] });
  if (!unit || (unit as unknown as { SubjectProgram: SubjectProgram }).SubjectProgram.schoolId !== session.schoolId) throw badRequest('Unidad del programa inválida.');
};

// GET /quizzes?scope=mine|school
export const listQuizzes = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const { scope } = req.query as { scope: 'mine' | 'school' };
  if (scope === 'school' && !session.can(Entity.QUIZZES, Action.READ)) throw forbidden();
  const quizzes = await Quiz.findAll({
    where: { schoolId: session.schoolId, ...(scope === 'mine' ? { authorId: session.userId } : {}) },
    include: quizInclude,
    order: [['updatedAt', 'DESC']],
    limit: 300,
  });
  res.json(quizzes.map((q) => ({ ...q.toJSON(), questions: undefined, questionCount: q.questions.length })));
});

// GET /quizzes/:id
export const getQuiz = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id), 'view');
  res.json({ ...quiz.toJSON(), canEdit: canManage(session, quiz) });
});

// POST /quizzes
export const createQuiz = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const body = req.body as z.infer<typeof Validator.createQuiz.body>;
  if (body.subjectId && !(await Subject.count({ where: { id: body.subjectId, schoolId: session.schoolId } }))) throw badRequest('Materia inválida.');
  await assertUnit(session, body.programUnitId);
  const quiz = await Quiz.create({ ...body, schoolId: session.schoolId, authorId: session.userId, subjectId: body.subjectId ?? null, programUnitId: body.programUnitId ?? null });
  res.status(201).json(quiz);
});

// PUT /quizzes/:id
export const updateQuiz = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id));
  const body = req.body as z.infer<typeof Validator.updateQuiz.body>;
  if (body.subjectId && !(await Subject.count({ where: { id: body.subjectId, schoolId: session.schoolId } }))) throw badRequest('Materia inválida.');
  await assertUnit(session, body.programUnitId);
  await quiz.update({ ...body, subjectId: body.subjectId ?? null, programUnitId: body.programUnitId ?? null });
  res.json(quiz);
});

// DELETE /quizzes/:id
export const deleteQuiz = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id));
  await audit({ schoolId: session.schoolId, userId: session.userId, entity: 'Quiz', entityId: quiz.id, action: 'delete', before: { title: quiz.title } });
  await quiz.destroy();
  res.status(204).end();
});

// ---------------- Como tarea ----------------

/** Cuentas de estudiante activas de un curso (para avisarles). */
const studentAccountsIn = async (divisionId: number) =>
  (
    (await sequelize.query(
      `SELECT DISTINCT s."userId" FROM "Enrollment" e JOIN "Student" s ON s.id = e."studentId" AND s.active
         JOIN "UserRole" m ON m."userId" = s."userId" AND m."schoolId" = s."schoolId" AND m.role = 'ESTUDIANTE' AND m.active
        WHERE e."divisionId" = :divisionId AND e.status = 'ACTIVE' AND s."userId" IS NOT NULL`,
      { replacements: { divisionId }, type: QueryTypes.SELECT }
    )) as Array<{ userId: number }>
  ).map((r) => r.userId);

// POST /quizzes/:id/assignments
export const assignQuiz = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id));
  const { divisionId, closesAt, showAnswers } = req.body as z.infer<typeof Validator.assignQuiz.body>;
  if (!quiz.questions.length) throw badRequest('Agregá preguntas antes de asignarlo.');
  if (closesAt.getTime() <= Date.now()) throw badRequest('La fecha de cierre tiene que ser futura.');
  if (!(await Division.count({ where: { id: divisionId, schoolId: session.schoolId, academicYearId: session.academicYearId ?? 0 } }))) throw badRequest('Curso inválido.');
  if (!canPostInDivision(session, divisionId)) throw forbidden('Solo podés asignarlo a cursos donde dictás clase.');
  const assignment = await QuizAssignment.create({ schoolId: session.schoolId, quizId: quiz.id, divisionId, closesAt, showAnswers, createdById: session.userId });
  notify({
    userIds: await studentAccountsIn(divisionId),
    title: `Nuevo juego: ${quiz.title}`,
    message: `Respondelo antes del ${closesAt.toLocaleDateString('es-AR', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}.`,
    type: 'quiz',
    link: `/juegos/tarea/${assignment.id}`,
    email: 'never',
  });
  res.status(201).json(assignment);
});

// GET /quizzes/:id/assignments
export const listAssignments = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id), 'view');
  const assignments = await QuizAssignment.findAll({
    where: { quizId: quiz.id },
    include: [{ model: Division, attributes: ['id', 'name'] }, { model: QuizAttempt, attributes: ['id'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(assignments.map((a) => ({ ...a.toJSON(), QuizAttempts: undefined, attempts: (a as unknown as { QuizAttempts: unknown[] }).QuizAttempts.length })));
});

// GET /quiz-assignments/:id/results — resultados por alumno y por pregunta
export const getAssignmentResults = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const assignment = await QuizAssignment.findOne({ where: { id: req.params.id, schoolId: session.schoolId }, include: [{ model: Quiz }, { model: Division, attributes: ['id', 'name'] }] });
  if (!assignment) throw notFound();
  if (!canView(session, assignment.Quiz!)) throw forbidden();
  const [attempts, students] = await Promise.all([
    QuizAttempt.findAll({ where: { assignmentId: assignment.id } }),
    sequelize.query(
      `SELECT s.id, s."firstName", s."lastName", (s."userId" IS NOT NULL) AS "hasAccount" FROM "Enrollment" e JOIN "Student" s ON s.id = e."studentId" AND s.active
        WHERE e."divisionId" = :divisionId AND e.status = 'ACTIVE' ORDER BY s."lastName", s."firstName"`,
      { replacements: { divisionId: assignment.divisionId }, type: QueryTypes.SELECT }
    ) as Promise<Array<{ id: number; firstName: string; lastName: string; hasAccount: boolean }>>,
  ]);
  const questions = assignment.Quiz!.questions;
  res.json({
    assignment: { id: assignment.id, closesAt: assignment.closesAt, division: assignment.Division, quiz: { id: assignment.Quiz!.id, title: assignment.Quiz!.title } },
    students: students.map((s) => {
      const attempt = attempts.find((a) => a.studentId === s.id);
      return { ...s, score: attempt?.score ?? null, correctCount: attempt?.correctCount ?? null, finishedAt: attempt?.finishedAt ?? null };
    }),
    questions: questions.map((q) => {
      const answered = attempts.map((a) => a.answers.find((x) => x.questionId === q.id)).filter(Boolean) as AttemptAnswer[];
      return { id: q.id, text: q.text, answered: answered.length, correct: answered.filter((a) => a.correct).length };
    }),
  });
});

// GET /quiz-assignments/mine — estudiante: juegos asignados a su curso
export const listMyAssignments = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  if (!session.self?.divisionId) return res.json([]);
  const assignments = await QuizAssignment.findAll({
    where: { divisionId: session.self.divisionId },
    include: [{ model: Quiz, attributes: ['id', 'title', 'questions'], include: [{ model: Subject, attributes: ['name'] }] }, { model: QuizAttempt, where: { studentId: session.self.studentId }, required: false }],
    order: [['closesAt', 'DESC']],
    limit: 100,
  });
  res.json(
    assignments.map((a) => {
      const attempt = (a as unknown as { QuizAttempts: QuizAttempt[] }).QuizAttempts[0];
      return {
        id: a.id,
        title: a.Quiz!.title,
        subject: a.Quiz!.Subject?.name ?? null,
        questionCount: a.Quiz!.questions.length,
        closesAt: a.closesAt,
        open: a.closesAt.getTime() > Date.now(),
        attempt: attempt ? { score: attempt.score, correctCount: attempt.correctCount, questionCount: attempt.questionCount } : null,
      };
    })
  );
});

const studentAssignment = async (session: SchoolSession, id: number) => {
  if (!session.self) throw forbidden('Los juegos los responden los estudiantes desde su cuenta.');
  const assignment = await QuizAssignment.findOne({ where: { id, schoolId: session.schoolId, divisionId: session.self.divisionId ?? 0 }, include: [{ model: Quiz }] });
  if (!assignment) throw notFound();
  return assignment;
};

const withoutAnswers = (questions: QuizQuestion[]) => questions.map((q) => ({ id: q.id, text: q.text, timeLimit: q.timeLimit, points: q.points, options: q.options.map((o) => o.text) }));

// GET /quiz-assignments/:id/play — preguntas para responder (sin las correctas)
export const getAssignmentToPlay = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const assignment = await studentAssignment(session, Number(req.params.id));
  const attempt = await QuizAttempt.findOne({ where: { assignmentId: assignment.id, studentId: session.self!.studentId } });
  const quiz = assignment.Quiz!;
  res.json({
    id: assignment.id,
    title: quiz.title,
    description: quiz.description,
    closesAt: assignment.closesAt,
    open: assignment.closesAt.getTime() > Date.now(),
    questions: attempt || assignment.closesAt.getTime() <= Date.now() ? [] : withoutAnswers(quiz.questions),
    attempt: attempt && {
      score: attempt.score,
      correctCount: attempt.correctCount,
      questionCount: attempt.questionCount,
      review: assignment.showAnswers ? quiz.questions.map((q) => ({ text: q.text, options: q.options, chosen: attempt.answers.find((a) => a.questionId === q.id)?.option ?? null })) : null,
    },
  });
});

// POST /quiz-assignments/:id/attempt — una sola vez; el puntaje se calcula en el servidor
export const submitAttempt = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const assignment = await studentAssignment(session, Number(req.params.id));
  if (assignment.closesAt.getTime() <= Date.now()) throw conflict('El juego ya cerró.');
  const quiz = assignment.Quiz!;
  const { answers } = req.body as z.infer<typeof Validator.submitAttempt.body>;
  const graded: AttemptAnswer[] = quiz.questions.map((q) => {
    const given = answers.find((a) => a.questionId === q.id);
    const option = given?.option ?? null;
    const correct = option !== null && !!q.options[option]?.correct;
    return { questionId: q.id, option, correct, points: correct ? q.points : 0 };
  });
  const [attempt, created] = await QuizAttempt.findOrCreate({
    where: { assignmentId: assignment.id, studentId: session.self!.studentId },
    defaults: {
      assignmentId: assignment.id,
      studentId: session.self!.studentId,
      userId: session.userId,
      answers: graded,
      score: graded.reduce((sum, a) => sum + a.points, 0),
      correctCount: graded.filter((a) => a.correct).length,
      questionCount: quiz.questions.length,
      finishedAt: new Date(),
    },
  });
  if (!created) throw conflict('Ya respondiste este juego.');
  res.status(201).json({
    score: attempt.score,
    correctCount: attempt.correctCount,
    questionCount: attempt.questionCount,
    review: assignment.showAnswers ? quiz.questions.map((q) => ({ text: q.text, options: q.options, chosen: graded.find((a) => a.questionId === q.id)?.option ?? null })) : null,
  });
});

// GET /quiz-results/student/:id — resultados de un alumno (personal, o su familia con plan Integral)
export const getStudentResults = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const studentId = Number(req.params.id);
  const { asGuardian } = await assertStudentAccess(session, studentId);
  if (asGuardian && !session.self && !session.hasFeature(PlanFeature.QUIZZES)) throw planRequiredError(PlanFeature.QUIZZES);
  const attempts = await QuizAttempt.findAll({
    where: { studentId },
    include: [{ model: QuizAssignment, attributes: ['id', 'closesAt'], include: [{ model: Quiz, attributes: ['id', 'title'], include: [{ model: Subject, attributes: ['name'] }] }] }],
    order: [['finishedAt', 'DESC']],
    limit: 100,
  });
  const student = await Student.findByPk(studentId, { attributes: ['firstName'] });
  res.json({
    student: student?.firstName,
    results: attempts.map((a) => ({
      id: a.id,
      title: a.QuizAssignment?.Quiz?.title,
      subject: a.QuizAssignment?.Quiz?.Subject?.name ?? null,
      score: a.score,
      correctCount: a.correctCount,
      questionCount: a.questionCount,
      finishedAt: a.finishedAt,
    })),
  });
});

// ---------------- En vivo (docente) ----------------

// POST /quizzes/:id/live — abre una partida y devuelve el PIN
export const createLiveGame = asyncHandler(async (req, res) => {
  const session = req.schoolSession!;
  const quiz = await findQuiz(session, Number(req.params.id));
  if (!quiz.questions.length) throw badRequest('Agregá preguntas antes de jugarlo.');
  const game = await LiveGame.create({ schoolId: session.schoolId, quizId: quiz.id, hostId: session.userId, pin: await LiveGames.newPin(), questions: quiz.questions, title: quiz.title, questionStartedAt: null, finishedAt: null });
  res.status(201).json({ id: game.id, pin: game.pin });
});

const findHostedGame = async (session: SchoolSession, id: number) => {
  const game = await LiveGame.findOne({ where: { id, schoolId: session.schoolId, hostId: session.userId } });
  if (!game) throw notFound();
  return game;
};

// GET /live-games/:id
export const getLiveGame = asyncHandler(async (req, res) => {
  res.json(await LiveGames.hostState(await findHostedGame(req.schoolSession!, Number(req.params.id))));
});

// POST /live-games/:id/start | /next | /end
export const controlLiveGame = (action: 'start' | 'next' | 'end') =>
  asyncHandler(async (req, res) => {
    const game = await findHostedGame(req.schoolSession!, Number(req.params.id));
    if (action === 'start') await LiveGames.startGame(game);
    else if (action === 'next') await LiveGames.advanceGame(game);
    else await LiveGames.endGame(game);
    res.json(await LiveGames.hostState(game));
  });

// DELETE /live-games/:id/players/:playerId — sacar a un jugador (ej: nombre inapropiado)
export const kickPlayer = asyncHandler(async (req, res) => {
  const game = await findHostedGame(req.schoolSession!, Number(req.params.id));
  const [updated] = await LivePlayer.update({ kicked: true }, { where: { id: Number(req.params.playerId), gameId: game.id } });
  if (!updated) throw notFound();
  res.status(204).end();
});
