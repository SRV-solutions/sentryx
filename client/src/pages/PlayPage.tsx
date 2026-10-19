import { FormEvent, useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Trophy, Check, X, Hourglass, LogOut } from 'lucide-react';
import { api, ApiError } from '../lib/api';
import { OptionShape, formatSeconds } from '../school/quiz';

interface Joined { token: string; gameId: number; playerId: number; title: string; nickname: string }
interface PlayerState {
  status: 'LOBBY' | 'QUESTION' | 'REVEAL' | 'FINISHED';
  title: string;
  nickname: string;
  score: number;
  questionIndex: number;
  questionCount: number;
  question: { text: string; options: string[]; timeLimit: number; remainingMs: number } | null;
  answered: boolean;
  result: { answered: boolean; correct: boolean; points: number; correctOptions: number[]; options: string[]; rank: number } | null;
  podium: { top: Array<{ nickname: string; score: number }>; rank: number; players: number } | null;
}

const STORAGE_KEY = 'sentryx.player';
const loadPlayer = (): Joined | null => {
  try {
    return JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? 'null');
  } catch {
    return null;
  }
};
const savePlayer = (p: Joined | null) => {
  try {
    if (p) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* modo privado: se juega igual, solo no sobrevive a recargar */
  }
};

const JoinForm = ({ onJoined }: { onJoined: (p: Joined) => void }) => {
  const [pin, setPin] = useState(new URLSearchParams(window.location.search).get('pin') ?? '');
  const [nickname, setNickname] = useState('');
  const join = useMutation({
    mutationFn: () => api<Joined>('/play/join', { method: 'POST', json: { pin: pin.replace(/\D/g, ''), nickname } }),
    onSuccess: (p) => (savePlayer(p), onJoined(p)),
  });
  return (
    <form className="stack" style={{ marginTop: '12vh' }} onSubmit={(e: FormEvent) => (e.preventDefault(), join.mutate())}>
      <div style={{ textAlign: 'center' }}>
        <div className="h1">Sentryx<span className="accent">.</span> Juegos</div>
        <p className="small muted">Escribí el PIN que muestra tu docente.</p>
      </div>
      <input className="input" inputMode="numeric" autoComplete="off" maxLength={7} placeholder="PIN del juego" value={pin} onChange={(e) => setPin(e.target.value)} style={{ fontSize: 28, textAlign: 'center', fontWeight: 900, letterSpacing: '0.15em', minHeight: 64 }} required />
      <input className="input" maxLength={20} autoComplete="nickname" placeholder="Tu nombre" value={nickname} onChange={(e) => setNickname(e.target.value)} style={{ fontSize: 20, textAlign: 'center', minHeight: 56 }} required />
      {join.error && <div className="alert alert-danger small">{(join.error as Error).message}</div>}
      <button className="btn btn-accent btn-block" style={{ minHeight: 56, fontSize: 18 }} disabled={join.isPending || pin.replace(/\D/g, '').length !== 6 || !nickname.trim()}>{join.isPending ? 'Entrando…' : 'Entrar'}</button>
    </form>
  );
};

const Game = ({ player, onLeave }: { player: Joined; onLeave: () => void }) => {
  const [chosen, setChosen] = useState<number | null>(null);
  const state = useQuery({
    queryKey: ['play', player.token],
    queryFn: () => api<PlayerState>('/play/state', { headers: { 'X-Player-Token': player.token } }),
    refetchInterval: (q) => (q.state.data?.status === 'FINISHED' || q.state.error ? false : 1000),
    retry: (count, err) => !(err instanceof ApiError && (err.status === 401 || err.status === 403)) && count < 3,
  });
  const s = state.data;
  const [deadline, setDeadline] = useState(0);
  const [, tick] = useState(0);
  useEffect(() => {
    if (s?.question) setDeadline(Date.now() + s.question.remainingMs);
  }, [s?.questionIndex, s?.question?.remainingMs]);
  useEffect(() => setChosen(null), [s?.questionIndex]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  const answer = useMutation({
    mutationFn: (option: number) => api('/play/answer', { method: 'POST', json: { questionIndex: s!.questionIndex, option }, headers: { 'X-Player-Token': player.token } }),
    onSuccess: () => state.refetch(),
  });
  const leave = () => (savePlayer(null), onLeave());

  if (state.error) {
    return (
      <div className="stack" style={{ marginTop: '20vh', textAlign: 'center' }}>
        <p>{(state.error as Error).message}</p>
        <button className="btn" onClick={leave}>Volver a entrar</button>
      </div>
    );
  }
  if (!s) return <p className="muted" style={{ textAlign: 'center', marginTop: '30vh' }}>Conectando…</p>;

  return (
    <>
      <div className="row-between">
        <span className="player-chip">{s.nickname}</span>
        <span className="player-chip"><Trophy size={14} /> {s.score}</span>
      </div>

      {s.status === 'LOBBY' && (
        <div className="stack" style={{ marginTop: '18vh', textAlign: 'center', alignItems: 'center' }}>
          <Check size={48} className="accent" />
          <div className="h2">¡Ya estás adentro!</div>
          <p className="muted">Mirá tu nombre en la pantalla. El juego empieza cuando tu docente lo diga.</p>
          <div className="small muted">{s.title}</div>
        </div>
      )}

      {s.status === 'QUESTION' && s.question && (
        s.answered || chosen !== null ? (
          <div className="stack" style={{ marginTop: '22vh', textAlign: 'center', alignItems: 'center' }}>
            <Hourglass size={44} className="accent" />
            <div className="h2">¡Respuesta enviada!</div>
            <p className="muted">Esperá a que se termine el tiempo…</p>
          </div>
        ) : (
          <div className="stack" style={{ flex: 1 }}>
            <div className="row-between">
              <span className="small muted">{s.questionIndex + 1} de {s.questionCount}</span>
              <span className="quiz-timer" style={{ width: 52, height: 52, fontSize: 22 }}>{formatSeconds(deadline - Date.now())}</span>
            </div>
            <div className="h2" style={{ textAlign: 'center' }}>{s.question.text}</div>
            <div className="quiz-grid" style={{ flex: 1, gridAutoRows: '1fr' }}>
              {s.question.options.map((text, i) => (
                <button key={i} className={`quiz-opt quiz-opt-${i}`} style={{ flexDirection: 'column', justifyContent: 'center', textAlign: 'center', minHeight: 110 }} disabled={answer.isPending} onClick={() => (setChosen(i), answer.mutate(i))}>
                  <OptionShape index={i} size={36} />
                  <span style={{ fontSize: 16 }}>{text}</span>
                </button>
              ))}
            </div>
            {answer.error && <div className="alert alert-danger small">{(answer.error as Error).message}</div>}
          </div>
        )
      )}

      {s.status === 'REVEAL' && s.result && (
        <div className="stack" style={{ marginTop: '12vh', textAlign: 'center', alignItems: 'center' }}>
          <div style={{ width: 96, height: 96, borderRadius: '50%', display: 'grid', placeItems: 'center', background: s.result.correct ? '#26890c' : '#e21b3c', color: '#fff' }}>
            {s.result.correct ? <Check size={56} strokeWidth={4} /> : <X size={56} strokeWidth={4} />}
          </div>
          <div className="h1">{!s.result.answered ? 'Se terminó el tiempo' : s.result.correct ? '¡Correcto!' : 'Incorrecto'}</div>
          {s.result.correct && <div className="h2">+{s.result.points}</div>}
          {!s.result.correct && <p className="small">La respuesta era: <b>{s.result.correctOptions.map((i) => s.result!.options[i]).join(' / ')}</b></p>}
          <p className="muted">Vas {s.result.rank}º</p>
        </div>
      )}

      {s.status === 'FINISHED' && s.podium && (
        <div className="stack" style={{ marginTop: '10vh', textAlign: 'center', alignItems: 'center' }}>
          <Trophy size={56} className="accent" />
          <div className="h1">{s.podium.rank ? `Quedaste ${s.podium.rank}º de ${s.podium.players}` : 'Terminó el juego'}</div>
          <div className="h2">{s.score} puntos</div>
          <div className="card stack" style={{ padding: 14, minWidth: 240, gap: 6 }}>
            {s.podium.top.map((p, i) => <div key={i} className="row-between"><span>{['🥇', '🥈', '🥉'][i]} {p.nickname}</span><b>{p.score}</b></div>)}
          </div>
          <button className="btn btn-ghost" onClick={leave}><LogOut size={16} /> Salir</button>
        </div>
      )}
    </>
  );
};

/** /jugar — los alumnos entran a una partida en vivo con el PIN y un nombre, sin cuenta. */
export default function PlayPage() {
  const [player, setPlayer] = useState<Joined | null>(loadPlayer);
  return <div className="play-screen">{player ? <Game player={player} onLeave={() => setPlayer(null)} /> : <JoinForm onJoined={setPlayer} />}</div>;
}
