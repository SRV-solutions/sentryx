import { createContext, ReactNode, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, Eye, EyeOff } from 'lucide-react';
import { mediaUrl } from '../lib/api';

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

export const Avatar = ({ name, src, size }: { name: string; src?: string | null; size?: 'sm' | 'lg' | 'xl' }) => {
  const [broken, setBroken] = useState(false);
  const url = mediaUrl(src);
  return (
    <span className={`avatar ${size ? `avatar-${size}` : ''}`} aria-hidden>
      {url && !broken ? <img src={url} alt="" loading="lazy" onError={() => setBroken(true)} /> : initials(name)}
    </span>
  );
};

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

/** Pila de hojas abiertas: Escape cierra solo la de arriba. */
const sheetStack: Array<() => void> = [];
const onSheetKey = (e: KeyboardEvent) => e.key === 'Escape' && sheetStack[sheetStack.length - 1]?.();

/** Hoja deslizable (abajo en el celular, centrada en escritorio). Se monta en <body> para poder apilar varias. */
/** size: lg (formularios con varias columnas) o xl (tablas anchas, ej: credenciales). */
export const Sheet = ({ open, onClose, title, children, size }: { open: boolean; onClose: () => void; title: string; children: ReactNode; size?: 'lg' | 'xl' }) => {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const close = () => closeRef.current();
    if (!sheetStack.length) document.addEventListener('keydown', onSheetKey);
    sheetStack.push(close);
    document.body.style.overflow = 'hidden';
    return () => {
      sheetStack.splice(sheetStack.indexOf(close), 1);
      if (!sheetStack.length) {
        document.removeEventListener('keydown', onSheetKey);
        document.body.style.overflow = '';
      }
    };
  }, [open]);
  if (!open) return null;
  return createPortal(
    <div className="sheet-backdrop" onClick={onClose}>
      <div className={`sheet${size ? ` sheet-${size}` : ''}`} role="dialog" aria-modal aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="row-between" style={{ marginBottom: 16 }}>
          <h2 className="h2">{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Cerrar">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
};

/* ---------------- Contraseña ---------------- */

/**
 * Campo de contraseña con botón para verla/ocultarla. Se usa en el ingreso, el cambio obligatorio,
 * "Mi perfil" y el recupero por email.
 */
export const PasswordInput = ({
  id,
  value,
  onChange,
  autoComplete = 'current-password',
  required,
  invalid,
  placeholder,
  autoFocus,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: 'current-password' | 'new-password';
  required?: boolean;
  invalid?: boolean;
  placeholder?: string;
  autoFocus?: boolean;
}) => {
  const [visible, setVisible] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <input
        id={id}
        className={`input ${invalid ? 'invalid' : ''}`}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        placeholder={placeholder}
        autoFocus={autoFocus}
        style={{ paddingRight: 48 }}
        aria-invalid={invalid || undefined}
      />
      <button
        type="button"
        className="icon-btn"
        style={{ position: 'absolute', right: 3, top: 3 }}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        aria-pressed={visible}
        tabIndex={-1}
      >
        {visible ? <EyeOff size={18} /> : <Eye size={18} />}
      </button>
    </div>
  );
};

/** Validación de contraseña nueva en el navegador (la API vuelve a validar). */
export const newPasswordProblem = (next: string, confirm: string, current?: string) => {
  if (next.length < 8) return 'La nueva contraseña debe tener al menos 8 caracteres.';
  if (next.length > 100) return 'La contraseña es demasiado larga (máximo 100 caracteres).';
  if (current !== undefined && next === current) return 'La nueva contraseña tiene que ser distinta de la actual.';
  if (confirm && next !== confirm) return 'Las contraseñas no coinciden.';
  if (!confirm) return 'Repetí la nueva contraseña.';
  return null;
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
