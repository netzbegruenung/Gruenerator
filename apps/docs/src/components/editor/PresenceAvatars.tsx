import { WebsocketProvider } from 'y-websocket';
import { useCollaborators } from '../../hooks/useCollaboration';
import './PresenceAvatars.css';

interface PresenceAvatarsProps {
  provider: WebsocketProvider | null;
}

export const PresenceAvatars = ({ provider }: PresenceAvatarsProps) => {
  const collaborators = useCollaborators(provider);

  if (collaborators.length === 0) {
    return null;
  }

  return (
    <div className="presence-avatars">
      {collaborators.map((collaborator) => (
        <div
          key={collaborator.id}
          className="presence-avatar"
          style={{ backgroundColor: collaborator.color }}
          title={collaborator.name}
        >
          {collaborator.name.charAt(0).toUpperCase()}
        </div>
      ))}
      {collaborators.length > 1 && (
        <span className="collaborator-count">
          +{collaborators.length} {collaborators.length === 1 ? 'Person' : 'Personen'} bearbeiten
        </span>
      )}
    </div>
  );
};
