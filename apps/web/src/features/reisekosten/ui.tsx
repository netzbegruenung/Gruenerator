import { type ReactNode } from 'react';

const inputCls =
  'w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-primary/20';

// ── Card family ────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card shadow-sm ${className}`}>{children}</div>
  );
}

export function CardHeader({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-1 p-6 pb-3">{children}</div>;
}

export function CardTitle({ children }: { children: ReactNode }) {
  return <h2 className="text-lg font-semibold leading-tight text-foreground">{children}</h2>;
}

export function CardDescription({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}

export function CardContent({ children }: { children: ReactNode }) {
  return <div className="p-6 pt-3">{children}</div>;
}

export function CardFooter({ children }: { children: ReactNode }) {
  return <div className="flex flex-wrap gap-sm p-6 pt-3">{children}</div>;
}

// ── Form controls ──────────────────────────────────────────────────────────────

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-xs">
      <span className="text-sm font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}

export function TextInput({
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'text' | 'tel' | 'email';
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={inputCls}
    />
  );
}

export function NumberInput({
  value,
  onChange,
  placeholder = '0,00',
  step = '0.01',
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <input
      type="number"
      inputMode="decimal"
      min="0"
      step={step}
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
      className={inputCls}
    />
  );
}

export function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} className={inputCls}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-sm text-sm text-foreground">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="size-4 accent-primary"
      />
      {label}
    </label>
  );
}

export function Switch({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 flex-none items-center rounded-full transition-colors ${
        checked ? 'bg-primary' : 'bg-grey-300 dark:bg-grey-600'
      }`}
    >
      <span
        className={`inline-block size-4 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

// ── Button ─────────────────────────────────────────────────────────────────────

type ButtonVariant = 'brand' | 'brand-outline' | 'outline';

const buttonVariants: Record<ButtonVariant, string> = {
  brand: 'bg-primary text-white hover:opacity-90',
  'brand-outline': 'border border-primary text-primary hover:bg-primary-50 dark:hover:bg-primary-900',
  outline: 'border border-border text-foreground hover:border-primary hover:bg-background-alt',
};

export function Button({
  children,
  onClick,
  variant = 'brand',
  disabled,
  type = 'button',
}: {
  children: ReactNode;
  onClick?: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  type?: 'button' | 'submit';
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-sm rounded-lg px-lg py-sm text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]}`}
    >
      {children}
    </button>
  );
}

export const eur = (n: number) =>
  `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
