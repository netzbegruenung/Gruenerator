const inputCls =
  'w-full min-w-0 rounded-[10px] border border-transparent bg-grey-100 px-3.5 text-[15px] text-foreground outline-none transition-colors placeholder:text-grey-400 focus:border-primary focus:bg-background-pure dark:bg-grey-800 dark:placeholder:text-grey-500';
const fieldCls = `${inputCls} h-11`;

// ── Form controls ──────────────────────────────────────────────────────────────

export function TextInput({
  id,
  value,
  onChange,
  type = 'text',
  placeholder,
  inputMode,
  autoComplete,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  placeholder?: string;
  inputMode?: 'numeric' | 'text' | 'tel' | 'email';
  autoComplete?: string;
  maxLength?: number;
}) {
  return (
    <input
      id={id}
      maxLength={maxLength}
      autoComplete={autoComplete}
      type={type}
      value={value}
      placeholder={placeholder}
      inputMode={inputMode}
      onChange={(e) => onChange(e.target.value)}
      className={fieldCls}
    />
  );
}

export function TextArea({
  id,
  value,
  onChange,
  placeholder,
  rows = 4,
  maxLength,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
  maxLength?: number;
}) {
  return (
    <textarea
      id={id}
      value={value}
      placeholder={placeholder}
      rows={rows}
      maxLength={maxLength}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} resize-y py-3 leading-normal`}
    />
  );
}

export function NumberInput({
  id,
  value,
  onChange,
  placeholder = '0,00',
  step = '0.01',
  einheit = '€',
}: {
  id?: string;
  value: number | null;
  onChange: (v: number | null) => void;
  placeholder?: string;
  step?: string;
  /** Unit shown inside the field on the right; '' for a plain count. */
  einheit?: string;
}) {
  return (
    <span className="relative flex">
      <input
        id={id}
        type="number"
        inputMode="decimal"
        min="0"
        step={step}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`${fieldCls} text-right tabular-nums ${einheit ? 'pr-10' : ''}`}
      />
      {einheit && (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 text-[15px] text-muted-foreground"
        >
          {einheit}
        </span>
      )}
    </span>
  );
}

export function Select({
  id,
  value,
  onChange,
  options,
}: {
  id?: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={fieldCls}>
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
