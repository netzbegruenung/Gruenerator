import { cn } from '../../../utils/cn';

export type BadgeType = 'early-access' | 'beta' | 'coming-soon';
export type BadgeVariant = 'card' | 'inline' | 'sidebar';

interface StatusBadgeProps {
  type: BadgeType;
  variant?: BadgeVariant;
  className?: string;
}

const BADGE_LABELS: Record<BadgeType, string> = {
  'early-access': 'Early Access',
  beta: 'Beta',
  'coming-soon': 'Coming Soon',
};

const typeStyles: Record<BadgeType, string> = {
  'early-access': 'text-foreground shadow-md',
  beta: 'bg-primary-600 text-white shadow-md',
  'coming-soon': 'bg-black/50 text-white',
};

const variantStyles: Record<BadgeVariant, string> = {
  card: 'absolute top-3 right-3 py-1.5 px-3.5 rounded-[20px] text-[var(--font-size-xxs)]',
  inline: 'inline-flex py-1 px-3 rounded-[20px] text-[var(--font-size-xxs)] max-md:py-[3px] max-md:px-2.5',
  sidebar: 'inline-flex py-0.5 px-2 rounded-xl text-[0.6rem] tracking-[0.3px] max-md:text-[0.55rem] max-md:py-0.5 max-md:px-1.5',
};

const StatusBadge = ({ type, variant = 'inline', className = '' }: StatusBadgeProps) => {
  const label = BADGE_LABELS[type];

  return (
    <span
      className={cn(
        'font-semibold uppercase tracking-[0.5px] whitespace-nowrap z-[2]',
        typeStyles[type],
        variantStyles[variant],
        className
      )}
    >
      {label}
    </span>
  );
};

export default StatusBadge;
