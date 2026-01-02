import { Suspense, type ReactNode } from 'react';

export interface SuspenseWrapperProps {
  children: ReactNode;
}

const SuspenseWrapper = ({ children }: SuspenseWrapperProps) => (
  <Suspense fallback={null}>{children}</Suspense>
);

export default SuspenseWrapper;
