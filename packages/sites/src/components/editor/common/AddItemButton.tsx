import { Button } from '@gruenerator/ui';

interface AddItemButtonProps {
  label: string;
  disabled: boolean;
  onAdd: () => void;
}

export function AddItemButton({ label, disabled, onAdd }: AddItemButtonProps) {
  return (
    <div>
      <Button
        type="button"
        variant="outline"
        className="w-full"
        disabled={disabled}
        onClick={onAdd}
      >
        + {label} hinzufügen
      </Button>
      {disabled && (
        <p className="text-xs text-grey-500 dark:text-grey-400 mt-1" role="status">
          Höchstens 6
        </p>
      )}
    </div>
  );
}
