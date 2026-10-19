/**
 * PARTIDAS EN VIVO de los juegos de preguntas.
 *
 * El docente proyecta la partida; los alumnos entran desde el celular con el PIN y un apodo (sin cuenta).
 * Todos consultan el estado cada ~1 s (sondeo corto): funciona igual con el tiempo real embebido o
 * separado, detrás de cualquier red escolar, y no necesita sesión.
 *
 * Estados: LOBBY (sala de espera) → QUESTION (pregunta abierta) → REVEAL (se muestra la correcta)
 *          → QUESTION … → FINISHED (podio).
 * Una pregunta abierta pasa sola a REVEAL cuando se acaba el tiempo o respondieron todos.
 */
import { createHash, randomBytes, randomInt } from 'crypto';
import { Op } from 'sequelize';
import { LiveGame, LivePlayer, LiveAnswer, sequelize } from '../models';
import type { QuizQuestion } from '../models/school/teaching';
import { badRequest, conflict, HttpError, notFound } from '../lib/http';

/** Una partida que nadie terminó se da por cerrada a las 4 horas (libera el PIN). */
const GAME_TTL_MS = 4 * 3600_000;
/** Margen para la latencia del celular al responder. */
const ANSWER_GRACE_MS = 1500;
const MAX_PLAYERS = 300;

export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

const isExpired = (game: LiveGame) => Date.now() - new Date(game.createdAt).getTime() > GAME_TTL_MS;

/** PIN de 6 dígitos que no esté en uso por otra partida abierta (de cualquier colegio). */
export const newPin = async () => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const pin = String(randomInt(100000, 1000000));
    const inUse = await LiveGame.count({ where: { pin, status: { [Op.ne]: 'FINISHED' }, createdAt: { [Op.gt]: new Date(Date.now() - GAME_TTL_MS) } } });
    if (!inUse) return pin;
  }
  throw new HttpError(503, 'No pudimos generar un PIN. Probá de nuevo.');
};

const activePlayers = (gameId: number) => LivePlayer.count({ where: { gameId, kicked: false } });

/** Puntos: los de la pregunta si acierta, menos hasta la mitad según lo que tardó (como Kahoot). */
export const pointsFor = (question: QuizQuestion, correct: boolean, elapsedMs: number) => {
  if (!correct || !question.points) return 0;
  const fraction = Math.min(1, Math.max(0, elapsedMs / (question.timeLimit * 1000)));
  return Math.round(question.points * (1 - fraction / 2));
};

const questionEndsAt = (game: LiveGame) =>
  game.questionStartedAt ? new Date(game.questionStartedAt).getTime() + game.questions[game.currentIndex].timeLimit * 1000 : 0;

/** Avanza el estado si corresponde (tiempo cumplido o respondieron todos). Idempotente. */
export const syncGame = async (game: LiveGame) => {
  if (game.status !== 'FINISHED' && isExpired(game)) {
    await game.update({ status: 'FINISHED', finishedAt: new Date() });
    return game;
  }
  if (game.status !== 'QUESTION') return game;
  const timeUp = Date.now() >= questionEndsAt(game) + ANSWER_GRACE_MS;
  let everyoneAnswered = false;
  if (!timeUp) {
    const [players, answers] = await Promise.all([activePlayers(game.id), LiveAnswer.count({ where: { gameId: game.id, questionIndex: game.currentIndex } })]);
    everyoneAnswered = players > 0 && answers >= players;
  }
  if (timeUp || everyoneAnswered) {
    // Solo una consulta concurrente hace el cambio (las demás ven 0 filas actualizadas).
    await LiveGame.update({ status: 'REVEAL' }, { where: { id: game.id, status: 'QUESTION', currentIndex: game.currentIndex } });
    await game.reload();
  }
  return game;
};

// ---------------- Acciones del docente ----------------

export const startGame = async (game: LiveGame) => {
  if (game.status !== 'LOBBY') throw conflict('La partida ya empezó.');
  if (!game.questions.length) throw badRequest('El juego no tiene preguntas.');
  if (!(await activePlayers(game.id))) throw badRequest('Esperá a que entre al menos un jugador.');
  await game.update({ status: 'QUESTION', currentIndex: 0, questionStartedAt: new Date() });
};

/** Desde la pregunta: muestra la respuesta. Desde la respuesta: pasa a la siguiente o al podio. */
export const advanceGame = async (game: LiveGame) => {
  await syncGame(game);
  if (game.status === 'QUESTION') return game.update({ status: 'REVEAL' });
  if (game.status === 'REVEAL') {
    const next = game.currentIndex + 1;
    if (next >= game.questions.length) return game.update({ status: 'FINISHED', finishedAt: new Date() });
    return game.update({ status: 'QUESTION', currentIndex: next, questionStartedAt: new Date() });
  }
  throw conflict(game.status === 'LOBBY' ? 'Primero empezá la partida.' : 'La partida terminó.');
};

export const endGame = (game: LiveGame) => game.update({ status: 'FINISHED', finishedAt: game.finishedAt ?? new Date() });

const leaderboard = async (gameId: number, limit?: number) =>
  LivePlayer.findAll({ where: { gameId, kicked: false }, attributes: ['id', 'nickname', 'score'], order: [['score', 'DESC'], ['joinedAt', 'ASC']], ...(limit ? { limit } : {}) });

/** Lo que ve el docente en el proyector. */
export const hostState = async (game: LiveGame) => {
  await syncGame(game);
  const question = game.currentIndex >= 0 ? game.questions[game.currentIndex] : null;
  const [players, answers] = await Promise.all([
    leaderboard(game.id),
    question ? LiveAnswer.findAll({ where: { gameId: game.id, questionIndex: game.currentIndex }, attributes: ['option', 'correct'], raw: true }) : Promise.resolve([]),
  ]);
  return {
    id: game.id,
    pin: game.pin,
    title: game.title,
    status: game.status,
    questionIndex: game.currentIndex,
    questionCount: game.questions.length,
    remainingMs: game.status === 'QUESTION' ? Math.max(0, questionEndsAt(game) - Date.now()) : 0,
    question: question && { text: question.text, timeLimit: question.timeLimit, points: question.points, options: question.options.map((o) => ({ text: o.text, correct: game.status === 'QUESTION' ? undefined : o.correct })) },
    answered: answers.length,
    optionCounts: question ? question.options.map((_o, index) => answers.filter((a) => a.option === index).length) : [],
    players: players.map((p) => ({ id: p.id, nickname: p.nickname, score: p.score })),
  };
};

// ---------------- Jugadores (sin cuenta) ----------------

export const joinGame = async (pin: string, nickname: string) => {
  const game = await LiveGame.findOne({ where: { pin, status: { [Op.ne]: 'FINISHED' }, createdAt: { [Op.gt]: new Date(Date.now() - GAME_TTL_MS) } }, order: [['id', 'DESC']] });
  if (!game) throw notFound('No hay ninguna partida abierta con ese PIN.');
  const name = nickname.replace(/\s+/g, ' ').trim();
  const taken = await LivePlayer.findOne({ where: { gameId: game.id, nickname: { [Op.iLike]: name } } });
  if (taken) throw conflict('Ese nombre ya está en uso en esta partida. Probá con otro.');
  if ((await activePlayers(game.id)) >= MAX_PLAYERS) throw conflict('La partida está completa.');
  const token = randomBytes(24).toString('base64url');
  const player = await LivePlayer.create({ gameId: game.id, nickname: name, tokenHash: hashToken(token) });
  return { token, gameId: game.id, playerId: player.id, title: game.title, nickname: player.nickname };
};

export const playerFromToken = async (token: string | undefined) => {
  if (!token || token.length > 64) throw new HttpError(401, 'Volvé a entrar con el PIN.');
  const player = await LivePlayer.findOne({ where: { tokenHash: hashToken(token) }, include: [{ model: LiveGame }] });
  if (!player) throw new HttpError(401, 'Volvé a entrar con el PIN.');
  if (player.kicked) throw new HttpError(403, 'El docente te sacó de la partida.');
  return { player, game: (player as unknown as { LiveGame: LiveGame }).LiveGame };
};

/** Lo que ve cada alumno en su celular (nunca incluye cuál es la correcta mientras la pregunta está abierta). */
export const playerState = async (player: LivePlayer, game: LiveGame) => {
  await syncGame(game);
  await player.reload();
  const question = game.currentIndex >= 0 ? game.questions[game.currentIndex] : null;
  const myAnswer = question ? await LiveAnswer.findOne({ where: { gameId: game.id, playerId: player.id, questionIndex: game.currentIndex } }) : null;
  const board = game.status === 'REVEAL' || game.status === 'FINISHED' ? await leaderboard(game.id) : [];
  const rank = board.findIndex((p) => p.id === player.id) + 1;
  return {
    status: game.status,
    title: game.title,
    nickname: player.nickname,
    score: player.score,
    questionIndex: game.currentIndex,
    questionCount: game.questions.length,
    question:
      question && game.status === 'QUESTION'
        ? { text: question.text, options: question.options.map((o) => o.text), timeLimit: question.timeLimit, remainingMs: Math.max(0, questionEndsAt(game) - Date.now()) }
        : null,
    answered: !!myAnswer,
    result:
      question && game.status === 'REVEAL'
        ? { answered: !!myAnswer, correct: myAnswer?.correct ?? false, points: myAnswer?.points ?? 0, correctOptions: question.options.map((o, i) => (o.correct ? i : -1)).filter((i) => i >= 0), options: question.options.map((o) => o.text), rank }
        : null,
    podium: game.status === 'FINISHED' ? { top: board.slice(0, 3).map((p) => ({ nickname: p.nickname, score: p.score })), rank, players: board.length } : null,
  };
};

export const answer = async (player: LivePlayer, game: LiveGame, questionIndex: number, option: number) => {
  await syncGame(game);
  if (game.status !== 'QUESTION' || game.currentIndex !== questionIndex) throw conflict('Esa pregunta ya se cerró.');
  const question = game.questions[questionIndex];
  if (option >= question.options.length) throw badRequest('Opción inválida.');
  const elapsedMs = Date.now() - new Date(game.questionStartedAt!).getTime();
  if (elapsedMs > question.timeLimit * 1000 + ANSWER_GRACE_MS) throw conflict('Se terminó el tiempo.');
  const correct = question.options[option].correct;
  const points = pointsFor(question, correct, elapsedMs);
  await sequelize.transaction(async (transaction) => {
    const [, created] = await LiveAnswer.findOrCreate({
      where: { gameId: game.id, playerId: player.id, questionIndex },
      defaults: { gameId: game.id, playerId: player.id, questionIndex, option, correct, points, elapsedMs },
      transaction,
    });
    if (!created) throw conflict('Ya respondiste esta pregunta.');
    if (points) await player.increment('score', { by: points, transaction });
  });
  return { received: true };
};
