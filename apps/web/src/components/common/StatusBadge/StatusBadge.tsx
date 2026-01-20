import './StatusBadge.css';

export type BadgeType = 'early-access' | 'beta' | 'coming-soon';
export type BadgeVariant = 'card' | 'inline' | 'sidebar';

interface StatusBadgeProps {
  type: BadgeType;
  variant?: BadgeVariant;
  className?: string;
}

const BADGE_LABELS: Record<BadgeType, string> = {
  'early-access': 'Early Access',
  'beta': 'Beta',
  'coming-soon': 'Coming Soon'
};

const StatusBadge = ({ type, variant = 'inline', className = '' }: StatusBadgeProps) => {
  const label = BADGE_LABELS[type];

  return (
    <span
      className={`status-badge status-badge--${type} status-badge--${variant} ${className}`.trim()}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
