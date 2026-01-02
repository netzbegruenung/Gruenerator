import type { JSX, ReactNode, MouseEvent } from 'react';
import './FloatingActionButton.css';

interface FloatingActionButtonProps {
  icon: ReactNode;
  onClick: (event: React.MouseEvent) => void;
  visible?: boolean;
  position?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  className?: string;
}

const FloatingActionButton = ({ icon,
  onClick,
  visible = true,
  position = 'top-left',
  className = '' }: FloatingActionButtonProps): JSX.Element => {
  if (!visible) return null;

  return (
    <button
      className={`floating-action-button floating-action-button--${position} ${className}`}
      onClick={onClick}
      type="button"
    >
      {icon}
    </button>
  );
};

export default FloatingActionButton;
