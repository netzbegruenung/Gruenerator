import { cn } from '@/utils/cn';

interface CloudCardProps {
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'accent';
}

const CloudCard = ({ className, children, variant = 'default' }: CloudCardProps) => {
  return (
    <div
      className={cn(
        'relative rounded-lg',
        variant === 'accent' && 'border-l-4 border-l-primary-500',
        className
      )}
    >
      {children}
    </div>
  );
};

export default CloudCard;
