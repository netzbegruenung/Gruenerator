import { IconButton } from '../../packages/ui/src/index';

import {
  AgentIcon,
  ImageAiIcon,
  ReelIcon,
  TemplateIcon,
  ScanIcon,
  MicIcon,
  PlugIcon,
} from './icons';

// Recreation of the workplace "Weitere Tools" section: an auto-fit grid of
// large IconButtons (icon circle + two-line label), exactly as ToolsSection
// renders them. Handlers are no-ops (navigation lives in the real app).
const TOOLS = [
  { label: 'Agentura', icon: <AgentIcon /> },
  { label: 'Bild mit KI begrünen', icon: <ImageAiIcon /> },
  { label: 'Reel untertiteln', icon: <ReelIcon /> },
  { label: 'Vorlagen', icon: <TemplateIcon /> },
  { label: 'Text digitalisieren', icon: <ScanIcon /> },
  { label: 'Audio mit KI transkribieren', icon: <MicIcon /> },
  { label: 'Mit ChatGPT & co verbinden', icon: <PlugIcon /> },
];

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))',
  justifyItems: 'center',
  gap: 32,
  padding: '0 16px',
  width: '100%',
};

export function WorkplaceTools() {
  return (
    <div style={grid}>
      {TOOLS.map((t) => (
        <IconButton
          key={t.label}
          size="lg"
          icon={t.icon}
          label={t.label}
          onClick={() => {}}
          className="[&>span]:line-clamp-2 [&>span]:min-h-[2.5rem] [&>span]:max-w-32"
        />
      ))}
    </div>
  );
}
