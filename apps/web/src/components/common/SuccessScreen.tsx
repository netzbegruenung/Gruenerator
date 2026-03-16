import AnimatedCheckmark from './AnimatedCheckmark';

import type { ReactNode } from 'react';

export interface SuccessScreenProps {
  title?: string;
  message?: ReactNode;
  children?: ReactNode;
}

const SuccessScreen = ({ title, message, children }: SuccessScreenProps) => {
  return (
    <div className="flex flex-col items-center border border-[var(--klee)] rounded-lg p-lg mx-auto my-lg max-w-[600px] text-center bg-[rgba(var(--klee-rgb),0.1)] animate-[fadeIn_0.5s_ease-out]">
      <div className="text-[2.5rem] text-[var(--klee)] mb-md">
        <AnimatedCheckmark />
      </div>
      {title && <h3 className="text-foreground-heading mb-sm font-semibold">{title}</h3>}
      {message && (
        <div className="text-foreground mb-lg whitespace-pre-wrap break-words w-full bg-background p-md rounded-md border border-[var(--border-subtle)]">
          {message}
        </div>
      )}
      {children && <div className="flex justify-center gap-md mt-md">{children}</div>}
    </div>
  );
};

export default SuccessScreen;
