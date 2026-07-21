import { IconButton } from '../../packages/ui/src/index';

import { MailIcon, LinkIcon, SunIcon, CloudIcon, CalendarIcon, HomeIcon } from './icons';

// Recreation of the workplace "Grünerators Favoriten" section: the same
// IconButton grid as FavoritesSection, linking out to ecosystem tools.
const FAVORITES = [
  { label: 'Newsletter', icon: <MailIcon /> },
  { label: 'Verdigado', icon: <LinkIcon /> },
  { label: 'Sunflower-Theme', icon: <SunIcon /> },
  { label: 'Grüne Wolke', icon: <CloudIcon /> },
  { label: 'Grünes Doodle', icon: <CalendarIcon /> },
  { label: 'Netzbegrünung', icon: <HomeIcon /> },
];

const grid: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit, minmax(7rem, 1fr))',
  justifyItems: 'center',
  gap: 32,
  padding: '0 16px',
  width: '100%',
};

export function WorkplaceFavorites() {
  return (
    <div style={grid}>
      {FAVORITES.map((f) => (
        <IconButton
          key={f.label}
          size="lg"
          icon={f.icon}
          label={f.label}
          onClick={() => {}}
          className="[&>span]:line-clamp-2 [&>span]:min-h-[2.5rem] [&>span]:max-w-32"
        />
      ))}
    </div>
  );
}
