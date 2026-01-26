import { WebsocketProvider } from 'y-websocket';
import { useCollaborators } from '../../hooks/useCollaboration';
import './PresenceAvatars.css';

interface PresenceAvatarsProps {
  provider: WebsocketProvider | null;
  compact?: boolean;
  maxVisible?: number;
}

export const PresenceAvatars = ({
  provider,
  compact = false,
  maxVisible = compact ? 2 : 5,
}: PresenceAvatarsProps) => {
  const collaborators = useCollaborators(provider);

  if (collaborators.length === 0) {
    return null;
  }

  const visibleCollaborators = collaborators.slice(0, maxVisible);
  const remainingCount = collaborators.length - maxVisible;
  const hasOverflow = remainingCount > 0;

  return (
    <div className={`presence-avatars ${compact ? 'presence-avatars--compact' : ''}`}>
      <div className="presence-avatars-stack">
        {visibleCollaborators.map((collaborator, index) => (
          <div
            key={collaborator.id}
            className="presence-avatar"
            style={{
              backgroundColor: collaborator.color,
              zIndex: visibleCollaborators.length - index,
            }}
            title={collaborator.name}
          >
            {collaborator.name.charAt(0).toUpperCase()}
          </div>
        ))}
        {hasOverflow && (
          <div
            className="presence-avatar presence-avatar--overflow"
            title={`${remainingCount} weitere Personen`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
      {!compact && collaborators.length > 1 && (
        <span className="collaborator-count">
          {collaborators.length} {collaborators.length === 1 ? 'Person' : 'Personen'} bearbeiten
        </span>
      )}
    </div>
  );
};
