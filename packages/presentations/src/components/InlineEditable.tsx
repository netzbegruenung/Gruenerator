import { useEffect, useRef } from 'react';

export interface InlineEditableProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
}

/**
 * A single-line inline-editable field (slide title). Plain text; Enter blurs
 * instead of inserting a newline. Kept uncontrolled and reconciled via an
 * effect so remote/AI updates land without clobbering the caret mid-edit.
 */
export function InlineEditable({ value, onChange, placeholder, className }: InlineEditableProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  return (
    <div
      ref={ref}
      className={className}
      contentEditable
      suppressContentEditableWarning
      role="textbox"
      tabIndex={0}
      data-placeholder={placeholder}
      onInput={(e) => onChange(e.currentTarget.textContent ?? '')}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}
