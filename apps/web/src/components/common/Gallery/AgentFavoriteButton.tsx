import { useSkillFavoritesStore, agentsList } from '@gruenerator/chat';
import { Star } from 'lucide-react';

const identifierToMention = new Map(agentsList.map((a) => [a.identifier, a.mention.toLowerCase()]));

interface AgentFavoriteButtonProps {
  identifier: string;
}

export function AgentFavoriteButton({ identifier }: AgentFavoriteButtonProps) {
  const mention = identifierToMention.get(identifier);
  const isFavorite = useSkillFavoritesStore((s) =>
    mention ? s.favorites.includes(mention) : false
  );
  const toggleFavorite = useSkillFavoritesStore((s) => s.toggleFavorite);

  if (!mention) return null;

  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        toggleFavorite(mention);
      }}
      className="rounded-lg p-1.5 transition-colors hover:bg-grey-100 dark:hover:bg-grey-800"
      aria-label={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
      title={isFavorite ? 'Aus Favoriten entfernen' : 'Zu Favoriten hinzufügen'}
    >
      <Star
        className={`h-4 w-4 ${isFavorite ? 'fill-yellow-400 text-yellow-400' : 'text-foreground-muted'}`}
      />
    </button>
  );
}
