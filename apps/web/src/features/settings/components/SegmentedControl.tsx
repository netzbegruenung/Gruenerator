import { ToggleGroup, ToggleGroupItem } from '@gruenerator/ui';
import { type ReactNode } from 'react';

interface SegmentedControlOption<T extends string> {
  value: T;
  label: string;
  icon?: ReactNode;
  title?: string;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onChange: (value: T) => void;
  options: SegmentedControlOption<T>[];
  'aria-label': string;
}

// Single choice as a tinted track with a raised selected segment. Radix hands
// back '' when the active item is clicked again — that is not a choice.
function SegmentedControl<T extends string>({
  value,
  onChange,
  options,
  'aria-label': ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        if (next) onChange(next as T);
      }}
      aria-label={ariaLabel}
      className="max-w-full flex-wrap gap-0.5 rounded-[10px] bg-grey-100 p-[3px] dark:bg-grey-800"
    >
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          title={option.title}
          className="h-auto gap-1.5 rounded-[7px] px-[11px] py-1 text-sm font-normal text-grey-600 hover:bg-transparent hover:text-foreground data-[spacing=0]:rounded-[7px] data-[state=on]:bg-white data-[state=on]:font-medium data-[state=on]:text-foreground-heading data-[spacing=0]:data-[state=on]:shadow-sm dark:text-grey-400 dark:data-[state=on]:bg-grey-700"
        >
          {option.icon}
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

export default SegmentedControl;
