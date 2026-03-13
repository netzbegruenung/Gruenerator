import { cn } from '@/utils/cn';

interface CloudCardProps {
  className?: string;
  children: React.ReactNode;
  variant?: 'default' | 'accent';
}

const CLOUD_SVG_PATH =
  'M 20,28 C 20,22 26,18 32,18 C 32,10 42,6 50,10 C 54,4 64,4 68,10 C 76,10 82,16 82,24 C 88,24 92,30 90,36 L 90,40 L 10,40 L 10,36 C 8,30 12,24 18,24 C 18,24 20,24 20,28 Z';

const CloudCard = ({ className, children, variant = 'default' }: CloudCardProps) => {
  return (
    <div className={cn('relative', className)}>
      <svg
        viewBox="0 0 100 40"
        className="w-full h-auto block -mb-px"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          d={CLOUD_SVG_PATH}
          className="fill-background-pure stroke-grey-200 dark:stroke-grey-700"
          strokeWidth="1"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <div
        className={cn(
          'rounded-b-lg border border-t-0 border-grey-200 dark:border-grey-700 bg-background-pure',
          variant === 'accent' && 'border-l-4 border-l-primary-500'
        )}
      >
        {children}
      </div>
    </div>
  );
};

export default CloudCard;
