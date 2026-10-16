import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import { Inbox } from 'lucide-react';

/* ---------------- Primitivos ---------------- */

export const Spinner = ({ center }: { center?: boolean }) =>
  center ? (
    <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
      <div className="spinner" />
    </div>
  ) : (
    <div className="spinner" />
  );

export const Skeleton = ({ h = 72, count = 3 }: { h?: number; count?: number }) => (
  <div className="stack">
    {Array.from({ length: count }, (_, i) => (
      <div key={i} className="skeleton" style={{ height: h }} />
    ))}
  </div>
);

export const Empty = ({ title, text, icon, action }: { title: string; text?: string; icon?: ReactNode; action?: ReactNode }) => (
  <div className="empty">
    {icon ?? <Inbox size={36} strokeWidth={1.5} />}
    <div className="h3">{title}</div>
    {text && <p className="small">{text}</p>}
    {action && <div style={{ marginTop: 16 }}>{action}</div>}
  </div>
);

export const ErrorBox = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div className="alert alert-danger">
    <div className="grow">{error instanceof Error ? error.message : 'Ocurrió un error.'}</div>
    {retry && (
      <button className="btn btn-sm btn-ghost" onClick={retry}>
        Reintentar
      </button>
    )}
  </div>
);

const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

export const Avatar = ({ name, src, size }: { name: string; src?: string | null; size?: 'sm' | 'lg' }) => (
  <span className={`avatar ${size ? `avatar-${size}` : ''}`} aria-hidden>
    {src ? <img src={src} alt="" loading="lazy" /> : initials(name)}
  </span>
);

export const Badge = ({ tone, children }: { tone?: 'ok' | 'warn' | 'danger' | 'info' | 'accent'; children: ReactNode }) => (
  <span className={`badge ${tone ? `badge-${tone}` : ''}`}>{children}</span>
);

export const Card = ({ children, pad = true, className = '' }: { children: ReactNode; pad?: boolean; className?: string }) => (
  <div className={`card ${pad ? 'card-pad' : ''} ${className}`}>{children}</div>
);

export const PageHeader = ({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) => (
  <div className="row-between wrap" style={{ marginBottom: 16 }}>
    <div className="grow">
      <h1 className="h1">{title}</h1>
      {subtitle && <p className="muted small" style={{ marginTop: 4 }}>{subtitle}</p>}
    </div>
    {actions && <div className="row wrap">{actions}</div>}
  </div>
);

export function Tabs<T extends string>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="tabs" role="tablist">
      {items.map((i) => (
        <button key={i.value} role="tab" aria-selected={value === i.value} className={`tab ${value === i.value ? 'active' : ''}`} onClick={() => onChange(i.value)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export function Chips<T extends string | number>({ value, onChange, items }: { value: T; onChange: (v: T) => void; items: Array<{ value: T; label: ReactNode }> }) {
  return (
    <div className="chips">
      {items.map((i) => (
        <button key={String(i.value)} className={`chip ${value === i.value ? 'active' : ''}`} onClick={() => onChange(i.value)}>
          {i.label}
        </button>
      ))}
    </div>
  );
}

export const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) => (
  <div className="field">
    <label>{label}</label>
    {children}
    {hint && <span className="xs muted">{hint}</span>}
  </div>
);

export const Sheet = ({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) => {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
};

/* ---------------- Toasts ---------------- */

type Toast = { id: number; text: string; error?: boolean };
const ToastCtx = createContext<(text: string, error?: boolean) => void>(() => {});

export const ToastProvider = ({ children }: { children: ReactNode }) => {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((text: string, error?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t, { id, text, error }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), error ? 5000 : 3000);
  }, []);
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-wrap" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.error ? 'toast-error' : ''}`}>
            {t.text}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
};

export const useToast = () => useContext(ToastCtx);

/* ---------------- Formato ---------------- */

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
export const timeAgo = (date: string | Date) => {
  const d = new Date(date);
  const diff = (d.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diff);
  if (abs < 60) return 'recién';
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' });
};

export const fmtDate = (date: string | Date, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) =>
  new Date(typeof date === 'string' && date.length === 10 ? `${date}T12:00:00` : date).toLocaleDateString('es-AR', opts);

export const fullName = (p?: { firstName: string; lastName: string } | null) => (p ? `${p.firstName} ${p.lastName}` : '');
