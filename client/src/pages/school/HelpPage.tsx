import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, ChevronRight, BookOpen } from 'lucide-react';
import { useSchool } from '../../school/SchoolContext';
import { useAuth } from '../../context/AuthContext';
import { PageHeader, Empty } from '../../ui';
import { searchHelp, visibleHelp } from '../../school/helpIndex';

/** Índice de todo lo que se puede hacer, por sección, con buscador. Solo muestra lo que esta persona puede usar. */
export default function HelpPage() {
  const { session, can } = useSchool();
  const { user } = useAuth();
  const [q, setQ] = useState('');
  const ctx = useMemo(() => ({ session, can, isSuperAdmin: !!user?.userData.isSuperAdmin }), [session, can, user]);
  const all = useMemo(() => visibleHelp(ctx), [ctx]);
  const hits = useMemo(() => (q.trim() ? searchHelp(ctx, q, 50) : null), [ctx, q]);
  const sections = useMemo(() => [...new Set(all.map((e) => e.section))], [all]);
  const list = hits ?? all;

  return (
    <div className="stack-lg">
      <PageHeader title="Ayuda e índice" subtitle="¿No te acordás dónde estaba algo? Escribilo como lo dirías: “notas”, “faltas”, “boletín”, “cuota”, “pasar de grado”. También funciona desde la barra de arriba (Ctrl+K)." />
      <div className="row" style={{ position: 'relative' }}>
        <Search size={18} className="muted" style={{ position: 'absolute', left: 12, pointerEvents: 'none' }} />
        <input className="input" style={{ paddingLeft: 40, minHeight: 48, fontSize: 16 }} placeholder="¿Qué querés hacer?" value={q} onChange={(e) => setQ(e.target.value)} autoFocus aria-label="Buscar en la ayuda" />
      </div>
      {hits && !hits.length && <Empty title="Nada coincide" text="Probá con otra palabra. Si creés que falta algo, usá “Reportar un problema” en el menú." icon={<BookOpen size={36} strokeWidth={1.5} />} />}
      {(hits ? ['Resultados'] : sections).map((section) => {
        const items = hits ? list : list.filter((e) => e.section === section);
        if (!items.length) return null;
        return (
          <section key={section} className="stack" style={{ gap: 8 }}>
            <h2 className="h2">{section}</h2>
            <div className="card list" style={{ overflow: 'hidden' }}>
              {items.map((e) => (
                <Link key={e.id} to={e.path} className="list-item" style={{ color: 'inherit' }}>
                  <div className="grow">
                    <div className="h3">{e.title}{hits && <span className="xs muted"> · {e.section}</span>}</div>
                    <div className="small muted">{e.description}</div>
                  </div>
                  <ChevronRight size={18} className="muted" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
