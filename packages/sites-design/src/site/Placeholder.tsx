import { type SiteRenderMode } from '../model/visibility.js';

export function Placeholder({
  field,
  text,
  mode,
  className = '',
}: {
  field: string;
  text: string;
  mode: SiteRenderMode;
  className?: string;
}) {
  if (mode !== 'preview') return null;
  return (
    <div
      data-field={field}
      data-empty=""
      className={`site:flex site:min-h-24 site:items-center site:justify-center site:rounded-card site:border-2 site:border-dashed site:border-current site:p-6 site:text-center site:text-small ${className}`}
    >
      {text}
    </div>
  );
}
