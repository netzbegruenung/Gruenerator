import type { ReactNode, ComponentType } from 'react';

interface IconComponentProps {
  size?: number;
  className?: string;
}

export interface EmptyStateProps {
  icon?: ComponentType<IconComponentProps>;
  iconSize?: number;
  title?: string;
  description?: string;
  children?: ReactNode;
  className?: string;
  centered?: boolean;
}

const EmptyState = ({
  icon: Icon,
  iconSize = 48,
  title,
  description,
  children,
  className = '',
  centered = true
}: EmptyStateProps) => {
  return (
    <div className={`knowledge-empty-state ${centered ? 'centered' : ''} ${className}`}>
      {Icon && <Icon size={iconSize} className="empty-state-icon" />}
      {title && <p>{title}</p>}
      {description && <p className="empty-state-description">{description}</p>}
      {children}
    </div>
  );
};

export default EmptyState;
