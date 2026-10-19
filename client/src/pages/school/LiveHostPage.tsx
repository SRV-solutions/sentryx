import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Users, Play, SkipForward, Square, Trophy, Maximize, X, Check } from 'lucide-react';
import { apiGet, apiSend } from '../../lib/api';
import { ErrorBox, Spinner, useToast } from '../../ui';
import { OptionShape, formatSeconds } from '../../school/quiz';

interface HostState {
  id: number;
  pin: string;
  title: string;
  status: 'LOBBY' | 'QUESTION' | 'REVEAL' | 'FINISHED';
  questionIndex: number;
  questionCount: number;
  remainingMs: number;
  question: { text: string; timeLimit: number; points: number; options: Array<{ text: string; correct?: boolean }> } | null;
  answered: number;
  optionCounts: number[];
  players: Array<{ id: number; nickname: string; score: number }>;
}

const COLORS = ['#e21b3c', '#1368ce', '#d89e00', '#26890c'];

/** Cuenta regresiva local entre consultas (el servidor manda cuánto falta). */
const useCountdown = (remainingMs: number, key: unknown) => {
  const [deadline, setDeadline] = useState(Date.now() + remainingMs);
  const [, tick] = useState(0);
  useEffect(() => setDeadline(Date.now() + remainingMs), [remainingMs, key]);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 250);
    return () => clearInterval(t);
  }, []);
  return Math.max(0, deadline - Date.now());
};

/** Pantalla para proyectar la partida en vivo. */
export default function LiveHostPage() {
  const id = Number(useParams().id);
  const qc = useQueryClient();
  const toast = useToast();
  const state = useQuery({ queryKey: ['live-game', id], queryFn: () => apiGet<HostState>(`/school/live-games/${id}`), refetchInterval: (q) => (q.state.data?.status === 'FINISHED' ? false : 1000) });
  const s = state.data;
  const left = useCountdown(s?.remainingMs ?? 0, `${s?.questionIndex}-${s?.status}`);
  const control = useMutation({
    mutationFn: (action: 'start' | 'next' | 'end') => apiSend<HostState>('POST', `/school/live-games/${id}/${action}`),
    onSuccess: (data) => qc.setQueryData(['live-game', id], data),
    onError: (e: Error) => toast(e.message, true),
  });
  const kick = useMutation({
    mutationFn: (playerId: number) => apiSend('DELETE', `/school/live-games/${id}/players/${playerId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['live-game', id] }),
  });
  const joinUrl = `${window.location.host}/jugar`;

  if (state.error) return <ErrorBox error={state.error} />;
  if (!s) return <Spinner center />;
  const maxCount = Math.max(1, ...s.optionCounts);

  return (
    <div className="quiz-stage">
      <div className="row-between wrap no-print">
        <Link to="/juegos" className="row small muted"><ArrowLeft size={16} /> Juegos</Link>
        <div className="row" style={{ gap: 6 }}>
          <span className="player-chip small"><Users size={14} /> {s.players.length}</span>
          <button className="icon-btn" aria-label="Pantalla completa" onClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}><Maximize size={18} /></button>
          {s.status !== 'FINISHED' && <button className="btn btn-sm btn-ghost" onClick={() => control.mutate('end')}><Square size={14} /> Terminar</button>}
        </div>
      </div>

      {s.status === 'LOBBY' && (
        <div className="stack-lg" style={{ alignItems: 'center', textAlign: 'center' }}>
          <div className="h2">{s.title}</div>
          <div className="card" style={{ padding: '18px 28px' }}>
            <div className="small muted">Entrá a <b>{joinUrl}</b> y escribí el PIN</div>
            <div className="quiz-pin">{s.pin}</div>
          </div>
          <div className="row wrap" style={{ gap: 8, justifyContent: 'center', maxWidth: 900 }}>
            {s.players.map((p) => (
              <button key={p.id} className="player-chip" title="Sacar de la partida" style={{ border: 0, cursor: 'pointer' }} onClick={() => kick.mutate(p.id)}>{p.nickname} <X size={12} /></button>
            ))}
            {!s.players.length && <span className="muted">Esperando jugadores…</span>}
          </div>
          <button className="btn btn-accent" style={{ minWidth: 'min(220px, 100%)', minHeight: 52, fontSize: 18 }} disabled={!s.players.length || control.isPending} onClick={() => control.mutate('start')}><Play size={20} /> Empezar</button>
        </div>
      )}

      {(s.status === 'QUESTION' || s.status === 'REVEAL') && s.question && (
        <>
          <div className="row" style={{ gap: 12, minWidth: 0 }}>
            <span className="small muted" style={{ flexShrink: 0 }}>{s.questionIndex + 1} de {s.questionCount}</span>
            <div className="h1 grow" style={{ textAlign: 'center', fontSize: 'clamp(22px, 4vw, 40px)' }}>{s.question.text}</div>
          </div>
          {s.status === 'QUESTION' ? (
            <div className="row-between">
              <div className="quiz-timer">{formatSeconds(left)}</div>
              <div style={{ textAlign: 'center' }}><div className="h1">{s.answered}</div><div className="xs muted">respuestas</div></div>
            </div>
          ) : (
            <div className="quiz-bar">
              {s.question.options.map((o, i) => (
                <div key={i}>
                  <span style={{ fontSize: 22, color: COLORS[i] }}>{s.optionCounts[i]} {o.correct && <Check size={20} />}</span>
                  <span style={{ height: `${(s.optionCounts[i] / maxCount) * 100}%`, background: COLORS[i], opacity: o.correct ? 1 : 0.35 }} />
                </div>
              ))}
            </div>
          )}
          <div className="quiz-grid">
            {s.question.options.map((o, i) => (
              <div key={i} className={`quiz-opt quiz-opt-${i} ${s.status === 'REVEAL' && !o.correct ? 'dim' : ''}`} style={{ fontSize: 'clamp(16px, 2.4vw, 24px)' }}>
                <OptionShape index={i} size={28} /> <span className="grow">{o.text}</span> {s.status === 'REVEAL' && o.correct && <Check size={26} strokeWidth={4} />}
              </div>
            ))}
          </div>
          {s.status === 'REVEAL' && (
            <div className="card" style={{ padding: 14 }}>
              <div className="h3 row" style={{ marginBottom: 6 }}><Trophy size={16} /> Ranking</div>
              {s.players.slice(0, 5).map((p, i) => (
                <div key={p.id} className="row-between small"><span><b>{i + 1}.</b> {p.nickname}</span><b>{p.score}</b></div>
              ))}
            </div>
          )}
          <button className="btn btn-accent" style={{ alignSelf: 'flex-end', minWidth: 'min(200px, 100%)', minHeight: 48 }} disabled={control.isPending} onClick={() => control.mutate('next')}>
            {s.status === 'QUESTION' ? 'Mostrar respuesta' : s.questionIndex + 1 >= s.questionCount ? 'Ver podio' : 'Siguiente'} <SkipForward size={18} />
          </button>
        </>
      )}

      {s.status === 'FINISHED' && (
        <div className="stack-lg" style={{ alignItems: 'center', textAlign: 'center' }}>
          <Trophy size={56} className="accent" />
          <div className="h1">{s.title}</div>
          <div className="row" style={{ gap: 'clamp(6px, 3vw, 16px)', alignItems: 'flex-end' }}>
            {[1, 0, 2].map((rank) => {
              const p = s.players[rank];
              if (!p) return null;
              return (
                <div key={p.id} className="stack" style={{ gap: 6, alignItems: 'center' }}>
                  <b>{p.nickname}</b>
                  <div style={{ width: 'clamp(70px, 22vw, 96px)', height: [140, 100, 70][rank], borderRadius: '12px 12px 0 0', background: ['#d89e00', '#9aa5b1', '#b5651d'][rank], display: 'grid', placeItems: 'center', color: '#fff', fontSize: 28, fontWeight: 900 }}>{rank + 1}</div>
                  <span className="small">{p.score} pts</span>
                </div>
              );
            })}
          </div>
          {s.players.length > 3 && <div className="small muted">{s.players.slice(3).map((p, i) => `${i + 4}. ${p.nickname} (${p.score})`).join(' · ')}</div>}
          <Link to="/juegos" className="btn">Volver a mis juegos</Link>
        </div>
      )}
    </div>
  );
}
