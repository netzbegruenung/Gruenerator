import { cn } from '@gruenerator/shared/utils';
import { Label } from '@gruenerator/ui';
import { type ReactNode } from 'react';

import { useEditorStore, type EditorPanel } from '../../../stores/editorStore';

interface FieldProps {
  panel: EditorPanel;
  /** Snapshot path of the field, the same string the preview marks with `data-field`. */
  path: string;
  htmlFor: string;
  label: ReactNode;
  children: ReactNode;
  hint?: ReactNode;
  className?: string;
}

export function Field({ panel, path, htmlFor, label, children, hint, className }: FieldProps) {
  const highlighted = useEditorStore(
    (s) => s.highlightedElement?.panel === panel && s.highlightedElement.path === path
  );
  return (
    <div className={cn('mb-md', highlighted && 'animate-[field-highlight_1s_ease]', className)}>
      <Label htmlFor={htmlFor} className="block text-sm font-medium text-foreground mb-1.5">
        {label}
      </Label>
      {children}
      {hint ? <p className="text-xs text-grey-500 dark:text-grey-400 mt-1">{hint}</p> : null}
    </div>
  );
}

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h3 className="flex items-center gap-2 m-0 mb-md text-lg font-semibold text-foreground">
      {children}
    </h3>
  );
}
