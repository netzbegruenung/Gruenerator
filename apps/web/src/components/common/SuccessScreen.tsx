import type { ReactNode } from 'react';
import AnimatedCheckmark from './AnimatedCheckmark';
import '../../assets/styles/components/ui/success-screen.css';

export interface SuccessScreenProps {
  title?: string;
  message?: ReactNode;
  children?: ReactNode;
}

const SuccessScreen = ({ title, message, children }: SuccessScreenProps) => {
  return (
    <div className="success-screen-container">
      <div className="success-icon">
        <AnimatedCheckmark />
      </div>
      {title && <h3 className="success-title">{title}</h3>}
      {message && <div className="success-message-content">{message}</div>}
      {children && <div className="success-actions">{children}</div>}
    </div>
  );
};

export default SuccessScreen;
