import {
  getGroupInitials,
  buildGroupPath,
  GROUP_COLOR_STYLES,
  resolveGroupColor,
  type GroupSummary,
  useSetGroupArchived,
} from '@gruenerator/shared/groups';
import { DropdownMenuItem, toast } from '@gruenerator/ui';
import { HiOutlineArchive } from 'react-icons/hi';

import { getToolTheme } from '../../../config/toolTheme';
import { resolveApiAssetUrl } from '../../../utils/platform';

import { TileCard } from './TileCard';

/** Nur, was die Kachel unterscheidet: archiviert oder das System-Projekt. Keine Mitgliederzahl. */
function projektMeta(projekt: GroupSummary): string | null {
  if (projekt.archived_at) return 'Archiviert';
  if (projekt.is_system) return 'Für alle';
  return null;
}

/**
 * Projekt-Kachel (`TileCard`): Avatar oder Initialen, Name und Beschreibung; oben rechts das „…"-Menü. Eine gewählte
 * Projektfarbe tauscht den ganzen Tonsatz.
 */
export function ProjektTile({ projekt }: { projekt: GroupSummary }) {
  const base = getToolTheme('projekte');
  const colorKey = resolveGroupColor(projekt.color);
  const palette = colorKey ? GROUP_COLOR_STYLES[colorKey] : null;
  const setArchived = useSetGroupArchived(projekt.id);
  // A chosen colour swaps the whole tone set (background, title, description, icon) so the
  // contrast pairs stay the audited ones, in both modes.
  const tone = palette
    ? {
        tile: 'bg-(--tile-bg) dark:bg-(--tile-bg-dark)',
        icon: 'text-(--tile-title) dark:text-(--tile-title-dark)',
        title: 'text-(--tile-title) dark:text-(--tile-title-dark)',
        desc: 'text-(--tile-desc) dark:text-(--tile-desc-dark)',
      }
    : (base ?? {
        tile: 'bg-grey-50 dark:bg-grey-800/40',
        icon: 'text-secondary-600',
        title: 'text-foreground-heading',
        desc: 'text-muted-foreground',
      });
  const toneVars = palette
    ? ({
        '--tile-bg': palette.light.bg,
        '--tile-bg-dark': palette.dark.bg,
        '--tile-title': palette.light.title,
        '--tile-title-dark': palette.dark.title,
        '--tile-desc': palette.light.desc,
        '--tile-desc-dark': palette.dark.desc,
      } as React.CSSProperties)
    : undefined;

  const archived = !!projekt.archived_at;
  const toggleArchived = () =>
    setArchived.mutate(!archived, {
      onSuccess: () =>
        toast.success(archived ? 'Projekt wiederhergestellt.' : 'Projekt archiviert.'),
      onError: (err: Error) => toast.error(err.message || 'Projekt konnte nicht geändert werden.'),
    });

  return (
    <TileCard
      href={buildGroupPath(projekt)}
      title={projekt.name}
      tone={tone}
      style={toneVars}
      description={projekt.description}
      badge={
        projekt.avatar_url ? (
          // avatar_url is the stored filename, not a URL; it changes on every
          // upload, so it doubles as the cache-buster.
          <img
            src={resolveApiAssetUrl(
              `/api/auth/groups/${projekt.id}/avatar?v=${encodeURIComponent(projekt.avatar_url)}`
            )}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <span className="text-sm font-bold">{getGroupInitials(projekt.name)}</span>
        )
      }
      meta={[projektMeta(projekt)].filter((line): line is string => !!line)}
      // Archivieren wie im Projektmenü: nur Admins, nie das System-Projekt.
      // Löschen und Verlassen brauchen eine Rückfrage und bleiben dort.
      menu={
        projekt.isAdmin && !projekt.is_system ? (
          <DropdownMenuItem onClick={toggleArchived} disabled={setArchived.isPending}>
            <HiOutlineArchive />
            {archived ? 'Wiederherstellen' : 'Archivieren'}
          </DropdownMenuItem>
        ) : null
      }
    />
  );
}
