import { Button } from '@gruenerator/ui';
import { HiArrowLeft } from 'react-icons/hi';

export interface BackButtonProps {
  onClick: () => void;
}

const BackButton = ({ onClick }: BackButtonProps) => (
  <Button variant="brand-outline" size="brand" onClick={onClick} aria-label="Zurück">
    <HiArrowLeft className="size-4 shrink-0" /> Zurück
  </Button>
);

export default BackButton;
