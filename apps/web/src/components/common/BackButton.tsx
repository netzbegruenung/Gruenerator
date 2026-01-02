import { HiArrowLeft } from 'react-icons/hi';

export interface BackButtonProps {
  onClick: () => void;
}

const BackButton = ({ onClick }: BackButtonProps) => (
  <button onClick={onClick} className="btn-secondary" aria-label="Zurück">
    <HiArrowLeft className="icon" /> Zurück
  </button>
);

export default BackButton;
