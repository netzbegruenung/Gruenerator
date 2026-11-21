import { Button } from '@gruenerator/ui';
import { FiArrowDown, FiArrowUp, FiX } from 'react-icons/fi';

interface ItemControlsProps {
  /** Names the card in the button labels, e.g. its title or "Thema 2". */
  name: string;
  kind: 'Thema' | 'Aktion';
  canMoveUp: boolean;
  canMoveDown: boolean;
  canRemove: boolean;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
}

export function ItemControls({
  name,
  kind,
  canMoveUp,
  canMoveDown,
  canRemove,
  onMoveUp,
  onMoveDown,
  onRemove,
}: ItemControlsProps) {
  return (
    <div className="flex gap-1">
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canMoveUp}
        onClick={onMoveUp}
        aria-label={`Nach oben: ${name}`}
      >
        <FiArrowUp aria-hidden="true" />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        disabled={!canMoveDown}
        onClick={onMoveDown}
        aria-label={`Nach unten: ${name}`}
      >
        <FiArrowDown aria-hidden="true" />
      </Button>
      {canRemove && (
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={onRemove}
          aria-label={`${kind} entfernen: ${name}`}
        >
          <FiX aria-hidden="true" />
        </Button>
      )}
    </div>
  );
}
