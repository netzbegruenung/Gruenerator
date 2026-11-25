import { cn } from '@gruenerator/shared/utils';
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  ToggleGroup,
  ToggleGroupItem,
} from '@gruenerator/ui';
import { useState, type ReactNode, type RefObject } from 'react';

type PreviewDevice = 'desktop' | 'tablet' | 'phone';

const DEVICES: ReadonlyArray<readonly [PreviewDevice, string]> = [
  ['desktop', 'Desktop'],
  ['tablet', 'Tablet'],
  ['phone', 'Handy'],
];

interface PreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  returnFocusRef?: RefObject<HTMLElement | null>;
}

export function PreviewDialog({
  open,
  onOpenChange,
  children,
  returnFocusRef,
}: PreviewDialogProps) {
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        aria-describedby={undefined}
        onCloseAutoFocus={(e) => {
          // No Trigger: Radix would drop focus on <body>.
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
        className="top-0 left-0 flex h-dvh max-h-none w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-hidden rounded-none border-0 p-0 sm:max-w-none"
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-sm border-b border-grey-200 bg-background-pure px-md py-sm text-foreground dark:border-grey-700 md:px-lg">
          <DialogTitle className="text-sm font-semibold md:text-base">Vorschau</DialogTitle>
          <ToggleGroup
            type="single"
            variant="outline"
            value={device}
            onValueChange={(value) => {
              if (value) setDevice(value as PreviewDevice);
            }}
            aria-label="Gerätegröße"
            className="max-md:hidden"
          >
            {DEVICES.map(([value, label]) => (
              <ToggleGroupItem key={value} value={value}>
                {label}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Schließen
          </Button>
        </div>
        <div className="flex min-h-0 flex-1 justify-center overflow-hidden bg-grey-200 dark:bg-grey-700">
          <div
            data-device={device}
            className={cn(
              'h-full min-h-0 overflow-hidden bg-background-pure transition-[width] duration-300 motion-reduce:transition-none',
              device === 'desktop' && 'w-full',
              device === 'tablet' && 'w-[768px] max-w-full shadow-lg',
              device === 'phone' && 'w-[375px] max-w-full shadow-lg'
            )}
          >
            {children}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
