import { useEffect, useRef } from 'react';
import { X, Inbox, Loader2 } from 'lucide-react';

// Shared UI kit — all styling flows from the semantic tokens in index.css.

const BUTTON_VARIANTS = {
  primary:
    'bg-primary text-white hover:bg-primary-deep focus-visible:outline-primary shadow-sm',
  secondary:
    'bg-surface text-ink border border-line hover:bg-mist focus-visible:outline-primary',
  ghost: 'text-soft hover:bg-mist hover:text-ink focus-visible:outline-primary',
  danger: 'bg-danger text-white hover:bg-red-700 focus-visible:outline-danger shadow-sm',
  accent: 'bg-accent text-white hover:bg-emerald-700 focus-visible:outline-accent shadow-sm',
};

export function Button({ variant = 'primary', className = '', loading = false, children, ...props }) {
  return (
    <button
      className={`inline-flex min-h-10 cursor-pointer items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
      disabled={loading || props.disabled}
      {...props}
    >
      {loading && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}

const BADGE_TONES = {
  blue: 'bg-primary-soft text-primary-deep',
  green: 'bg-accent-soft text-emerald-800',
  red: 'bg-danger-soft text-red-800',
  amber: 'bg-warn-soft text-amber-800',
  slate: 'bg-mist text-soft',
};

// Deterministic tone per status keyword so every module stays consistent.
export function statusTone(status = '') {
  const s = status.toLowerCase();
  if (/(closed|completed|approved|verified|operational|implemented|held|published|issued)/.test(s)) return 'green';
  if (/(overdue|out of service|suspended|cancelled|rejected|expired|critical)/.test(s)) return 'red';
  if (/(progress|investigation|review|monitoring|needs|pending|requested|action required)/.test(s)) return 'amber';
  if (/(open|active|in use|scheduled|planned|submitted|draft|new)/.test(s)) return 'blue';
  return 'slate';
}

export function Badge({ tone = 'slate', children, className = '' }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <Badge tone={statusTone(status)}>{status || '—'}</Badge>;
}

export function Card({ className = '', children }) {
  return (
    <div className={`rounded-xl border border-line bg-surface shadow-xs ${className}`}>{children}</div>
  );
}

export function StatCard({ label, value, icon: Icon, tone = 'blue', hint }) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold tracking-wide text-soft uppercase">{label}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
          {hint && <p className="mt-0.5 text-xs text-faint">{hint}</p>}
        </div>
        {Icon && (
          <span className={`rounded-lg p-2 ${BADGE_TONES[tone]}`} aria-hidden="true">
            <Icon className="size-5" />
          </span>
        )}
      </div>
    </Card>
  );
}

export function Field({ label, required, error, htmlFor, children, hint }) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-semibold text-ink">
        {label}
        {required && (
          <span className="text-danger" aria-hidden="true">
            {' '}
            *
          </span>
        )}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-faint">{hint}</p>}
      {error && (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const CONTROL_CLASS =
  'w-full min-h-10 rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink placeholder:text-faint focus:border-primary focus:outline-2 focus:outline-primary/30 disabled:bg-mist disabled:text-soft';

export function Input({ className = '', ...props }) {
  return <input className={`${CONTROL_CLASS} ${className}`} {...props} />;
}

export function Textarea({ className = '', rows = 3, ...props }) {
  return <textarea rows={rows} className={`${CONTROL_CLASS} ${className}`} {...props} />;
}

export function Select({ className = '', children, ...props }) {
  return (
    <select className={`${CONTROL_CLASS} cursor-pointer ${className}`} {...props}>
      {children}
    </select>
  );
}

export function Modal({ open, onClose, title, children, wide = false }) {
  const dialogRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    dialogRef.current?.querySelector('input, select, textarea, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50 p-0 sm:items-center sm:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-surface shadow-xl sm:rounded-2xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-xl'}`}
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-surface px-5 py-4">
          <h2 className="text-base font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="cursor-pointer rounded-lg p-1.5 text-soft transition-colors hover:bg-mist hover:text-ink"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="px-5 py-4">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-14 text-center">
      <span className="rounded-full bg-mist p-3 text-soft" aria-hidden="true">
        <Inbox className="size-6" />
      </span>
      <p className="text-sm font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-sm text-soft">{hint}</p>}
      {action}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }) {
  return (
    <div className="flex items-center justify-center gap-2 py-14 text-soft" role="status">
      <Loader2 className="size-5 animate-spin" aria-hidden="true" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-soft">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  );
}
