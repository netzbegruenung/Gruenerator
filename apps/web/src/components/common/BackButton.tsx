import { HiArrowLeft } from 'react-icons/hi';

import { btn } from '../../utils/buttonStyles';

export interface BackButtonProps {
  onClick: () => void;
}

const BackButton = ({ onClick }: BackButtonProps) => (
  <button onClick={onClick} className={btn.secondary} aria-label="Zurück">
    <HiArrowLeft className="size-4 shrink-0" /> Zurück
  </button>
);

export default BackButton;
