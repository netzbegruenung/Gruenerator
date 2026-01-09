interface TemplateAttributionProps {
  creatorName?: string;
  show: boolean;
}

export function TemplateAttribution({ creatorName, show }: TemplateAttributionProps) {
  if (!show || !creatorName) return null;

  return (
    <div className="template-attribution">
      <span className="template-attribution__label">Vorlage von:</span>
      <span className="template-attribution__creator">{creatorName}</span>
    </div>
  );
}
