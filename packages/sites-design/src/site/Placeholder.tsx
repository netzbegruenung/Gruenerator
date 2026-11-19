export function Placeholder({
  field,
  text,
  className = '',
}: {
  field: string;
  text: string;
  className?: string;
}) {
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
