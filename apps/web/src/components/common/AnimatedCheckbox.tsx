import * as Checkbox from '@radix-ui/react-checkbox';
import { motion } from 'motion/react';
import { useRef, type ChangeEvent } from 'react';

import { cn } from '../../utils/cn';

export type CheckboxVariant = 'default' | 'simple';

interface SyntheticCheckboxEvent {
  target: {
    checked: boolean;
    type: 'checkbox';
    id: string;
  };
  currentTarget: {
    checked: boolean;
    type: 'checkbox';
    id: string;
  };
}

export interface AnimatedCheckboxProps {
  id?: string;
  checked: boolean;
  onChange: (event: SyntheticCheckboxEvent) => void;
  label: string;
  variant?: CheckboxVariant;
}

const AnimatedCheckbox = ({
  id,
  checked,
  onChange,
  label,
  variant = 'default',
}: AnimatedCheckboxProps) => {
  const checkboxId = id || `checkbox-${Math.random().toString(36).substr(2, 9)}`;
  const hasInteracted = useRef(false);

  const handleCheckedChange = (newChecked: boolean) => {
    hasInteracted.current = true;
    const syntheticEvent: SyntheticCheckboxEvent = {
      target: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId,
      },
      currentTarget: {
        checked: newChecked,
        type: 'checkbox',
        id: checkboxId,
      },
    };
    onChange(syntheticEvent);
  };

  const isSimple = variant === 'simple';

  return (
    <div
      className={cn(
        'relative inline-flex p-[clamp(0.15rem,0.5vw,0.3rem)] min-h-[2.75rem]',
        !isSimple && 'max-sm:m-0 max-sm:mb-2 max-sm:p-0 max-sm:w-full max-sm:max-w-full',
        isSimple && 'max-md:m-0 max-md:p-1 max-md:w-full max-md:max-w-full',
        isSimple && 'md:p-[0.5rem]'
      )}
    >
      <Checkbox.Root
        id={checkboxId}
        checked={checked}
        onCheckedChange={handleCheckedChange}
        className={cn(
          'absolute ml-3 top-[40%] -translate-y-1/2 w-[clamp(0.875rem,2.5vw,1rem)] h-[clamp(0.875rem,2.5vw,1rem)]',
          'border-2 border-[var(--font-color)] rounded-[0.25rem] bg-transparent',
          'transition-all duration-200 ease-in-out cursor-pointer z-[2]',
          'pointer-events-auto flex items-center justify-center',
          'min-w-[1.125rem] min-h-[1.125rem]',
          'focus-visible:outline-2 focus-visible:outline-[var(--button-background-color)] focus-visible:outline-offset-2',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          !isSimple && 'max-sm:min-w-4 max-sm:min-h-4',
          isSimple && 'max-md:min-w-4 max-md:min-h-4'
        )}
      >
        <Checkbox.Indicator className="flex items-center justify-center w-full h-full">
          <motion.svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-[calc(clamp(0.875rem,2.5vw,1rem)-0.375rem)] h-[calc(clamp(0.875rem,2.5vw,1rem)-0.375rem)] stroke-[var(--font-color)] stroke-[0.1875rem] fill-none pointer-events-none min-w-3 min-h-3"
            viewBox="0 0 24 24"
            width="100%"
            height="100%"
            initial={{ scale: 0.8, opacity: 0, rotate: 0 }}
            animate={{
              scale: 0.8,
              opacity: checked ? 1 : 0,
              rotate: checked ? 3 : 0,
            }}
            transition={{
              type: 'spring',
              stiffness: 300,
              damping: 20,
            }}
          >
            <motion.path
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M1.73 12.91l6.37 6.37L22.79 4.59"
              initial={{ pathLength: checked ? 1 : 0 }}
              animate={{ pathLength: checked ? 1 : 0 }}
              transition={{
                duration: hasInteracted.current ? 0.3 : 0,
                ease: 'easeOut',
                delay: checked && hasInteracted.current ? 0.1 : 0,
              }}
            />
          </motion.svg>
        </Checkbox.Indicator>
      </Checkbox.Root>
      <label
        htmlFor={checkboxId}
        className={cn(
          'text-foreground cursor-pointer relative flex items-center',
          'border-2 border-[var(--font-color-h)]! rounded-[0.5rem]',
          'transition-all duration-[250ms] ease-out whitespace-nowrap z-[1]',
          'min-h-[2.75rem] text-[clamp(0.875rem,2.5vw,1rem)]',
          'p-[clamp(0.5rem,2vw,0.75rem)_clamp(0.75rem,3vw,1rem)_clamp(0.5rem,2vw,0.75rem)_clamp(2.25rem,6vw,2.5rem)]',
          'hover:bg-hover-alt',
          !isSimple && 'max-sm:text-[0.875rem] max-sm:rounded-[0.375rem] max-sm:whitespace-normal max-sm:break-words max-sm:max-w-full max-sm:box-border',
          !isSimple && 'sm:max-md:text-[0.9375rem]',
          isSimple && 'max-md:py-2 max-md:pr-3 max-md:pl-8 max-md:text-[0.875rem] max-md:min-h-10 max-md:whitespace-normal max-md:break-words max-md:max-w-full max-md:box-border',
          isSimple && 'md:py-3 md:pr-4 md:pl-10 md:text-base'
        )}
      >
        <span className="text-foreground">{label}</span>
      </label>
    </div>
  );
};

export default AnimatedCheckbox;
