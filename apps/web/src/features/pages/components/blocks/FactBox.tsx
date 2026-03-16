import { cn } from '../../../../utils/cn';

interface Fact {
  number: string;
  label: string;
}

interface FactBoxProps {
  facts?: Fact[];
  className?: string;
}

const FactBox = ({ facts = [], className = '' }: FactBoxProps) => {
  if (!facts || facts.length === 0) {
    return null;
  }

  return (
    <div
      className={cn(
        'bg-background border border-grey-200 dark:border-grey-700 rounded-lg p-xl my-xl shadow-md w-full max-w-none min-[1025px]:p-2xl min-[1025px]:my-2xl max-md:p-lg',
        className
      )}
    >
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-lg min-[1025px]:grid-cols-[repeat(auto-fit,minmax(200px,1fr))] min-[1025px]:gap-xl max-md:grid-cols-1 max-md:gap-md">
        {facts.map((fact, index) => (
          <div key={index} className="text-center p-md min-[1025px]:p-lg">
            <div className="text-[clamp(2rem,4vw,3rem)] text-secondary-600 font-normal leading-none m-0 mb-xs">
              {fact.number}
            </div>
            <div className="font-['PT_Sans',Arial,sans-serif] text-[0.9rem] text-foreground font-semibold uppercase tracking-[0.05em]">
              {fact.label}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FactBox;
