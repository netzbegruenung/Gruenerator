import { cn } from '../../../../utils/cn';

interface InfoBoxProps {
  title?: string;
  children?: React.ReactNode;
  items?: string[];
  variant?: 'default' | 'success' | 'warning' | 'info';
  className?: string;
}

const variantStyles = {
  success: 'border-l-4 border-l-primary-600 pl-lg',
  warning: 'border-l-4 border-l-[#f59e0b] pl-lg',
  error: 'border-l-4 border-l-[var(--error-red)] pl-lg',
} as const;

const InfoBox = ({
  title,
  children,
  items = [],
  variant = 'default',
  className = '',
}: InfoBoxProps) => {
  return (
    <div
      className={cn(
        'bg-transparent border-none py-xl px-0 my-xl w-full max-w-none min-[1025px]:py-2xl min-[1025px]:my-2xl max-md:py-lg',
        variant !== 'default' && variantStyles[variant as keyof typeof variantStyles],
        className
      )}
    >
      {title && <h3 className="text-[1.25rem] text-[var(--font-color-h3)] m-0 mb-md">{title}</h3>}
      <div className="text-foreground">
        {children}
        {items.length > 0 && (
          <ul className="list-none p-0 m-0">
            {items.map((item, index) => (
              <li
                key={index}
                className="py-xs pl-0 before:content-['\\2022\\20'] before:text-[var(--link-color)] before:font-normal"
              >
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};

export default InfoBox;
