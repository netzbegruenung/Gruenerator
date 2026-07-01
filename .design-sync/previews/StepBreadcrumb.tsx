import { StepBreadcrumb } from '@gruenerator/ui';

// StepBreadcrumb takes `steps` (label + optional suffix) and `activeIndex`.
// Steps before the active index render in primary green, the active step is
// bold primary, later steps stay muted — a lightweight wizard progress trail.
// Config pins cardMode:column for the wide row.
const wrap: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 24 };
const labelStyle: React.CSSProperties = { fontSize: 12, opacity: 0.6, marginBottom: 6 };

export function TranskriptionFortschritt() {
  return (
    <div style={wrap}>
      <div>
        <div style={labelStyle}>Video wird transkribiert</div>
        <StepBreadcrumb
          steps={[
            { label: 'Hochladen' },
            { label: 'Extrahieren' },
            { label: 'Transkribieren', suffix: '(läuft)' },
          ]}
          activeIndex={2}
        />
      </div>
      <div>
        <div style={labelStyle}>Kampagne anlegen</div>
        <StepBreadcrumb
          steps={[
            { label: 'Zielgruppe' },
            { label: 'Botschaft', suffix: '· aktiv' },
            { label: 'Kanäle' },
            { label: 'Veröffentlichen' },
          ]}
          activeIndex={1}
        />
      </div>
    </div>
  );
}
