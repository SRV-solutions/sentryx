/** Mi perfil → Tutoriales: la guía de SOLVIX para volver a ver cada tutorial cuando quieras. */
import { useEffect, useMemo, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { PlayCircle, RotateCcw } from 'lucide-react';
import { Card } from '../ui';
import { useSchool } from '../school/SchoolContext';
import { useAuth } from '../context/AuthContext';
import { Solvix } from './Solvix';
import { tutorialsFor } from './catalog';
import { startTutorial, useTutorialProgress } from './TutorialHost';

export const TutorialsCard = () => {
  const { session, can } = useSchool();
  const { isSuperAdmin } = useAuth();
  const list = useMemo(() => tutorialsFor({ session, can, isSuperAdmin }), [session, can, isSuperAdmin]);
  const { data, resetAll } = useTutorialProgress();
  const location = useLocation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (location.hash === '#tutoriales') setTimeout(() => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 300);
  }, [location.hash]);
  if (!session || !list.length) return null;
  const done = list.filter((t) => data.done.includes(t.id)).length;
  return (
    <div ref={ref} id="tutoriales">
      <Card>
        <div className="stack">
          <div className="row" style={{ gap: 12 }}>
            <Solvix pose="wave" size={64} />
            <div className="grow">
              <h2 className="h3">Tutoriales con SOLVIX</h2>
              <p className="small muted" style={{ margin: 0 }}>Te muestro dónde tocar para hacer cada cosa. Hiciste {done} de {list.length}.</p>
              <div className="progress" style={{ marginTop: 6 }}><span style={{ width: `${(done / list.length) * 100}%` }} /></div>
            </div>
          </div>
          <div className="card list" style={{ overflow: 'hidden' }}>
            {list.map((t) => {
              const status = data.done.includes(t.id) ? 'done' : data.skipped.includes(t.id) ? 'skipped' : 'new';
              return (
                <div key={t.id} className="list-item">
                  <div className="grow" style={{ minWidth: 0 }}>
                    <div className="h3 row" style={{ gap: 6 }}>
                      {t.title}
                      {status === 'done' && <span className="badge badge-ok">Hecho</span>}
                      {status === 'skipped' && <span className="badge">Omitido</span>}
                      {status === 'new' && <span className="badge badge-info">Nuevo</span>}
                    </div>
                    <div className="xs muted">{t.description}</div>
                  </div>
                  <button className="btn btn-sm" onClick={() => startTutorial(t.id)}><PlayCircle size={14} /> {status === 'done' ? 'Repasar' : 'Ver'}</button>
                </div>
              );
            })}
          </div>
          {(data.done.length > 0 || data.skipped.length > 0) && (
            <button className="btn btn-sm btn-ghost" style={{ alignSelf: 'flex-start' }} onClick={resetAll}><RotateCcw size={14} /> Empezar de cero (SOLVIX vuelve a presentarse al entrar)</button>
          )}
          <p className="xs muted" style={{ margin: 0 }}>También los encontrás en el buscador escribiendo "tutorial" o "ayuda".</p>
        </div>
      </Card>
    </div>
  );
};
