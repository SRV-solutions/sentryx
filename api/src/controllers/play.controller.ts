/**
 * Jugadores de partidas en vivo (públicas, sin cuenta): entran con PIN y apodo y se identifican con
 * un token secreto (header X-Player-Token). Rutas en routes/play.routes.ts.
 */
import { asyncHandler } from '../lib/http';
import * as LiveGames from '../services/liveGames';

const tokenOf = (header: unknown) => (typeof header === 'string' ? header : undefined);

// POST /play/join
export const join = asyncHandler(async (req, res) => {
  const { pin, nickname } = req.body as { pin: string; nickname: string };
  res.status(201).json(await LiveGames.joinGame(pin, nickname));
});

// GET /play/state
export const state = asyncHandler(async (req, res) => {
  const { player, game } = await LiveGames.playerFromToken(tokenOf(req.headers['x-player-token']));
  res.json(await LiveGames.playerState(player, game));
});

// POST /play/answer
export const answer = asyncHandler(async (req, res) => {
  const { player, game } = await LiveGames.playerFromToken(tokenOf(req.headers['x-player-token']));
  const { questionIndex, option } = req.body as { questionIndex: number; option: number };
  res.json(await LiveGames.answer(player, game, questionIndex, option));
});
