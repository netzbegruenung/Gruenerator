import { Button } from '@gruenerator/ui';
import { FiArrowLeft } from 'react-icons/fi';

export function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <Button variant="ghost" size="icon" onClick={onBack} aria-label="Zurück" title="Zurück">
      <FiArrowLeft />
    </Button>
  );
}
