import type { ReactNode } from 'react';

import { cn } from '@/utils/cn';

interface IndexPageProps {
  title?: string;
  description?: ReactNode;
  headerContent?: ReactNode;
  children?: ReactNode;
  loading?: boolean;
  error?: string | null;
  emptyMessage?: string;
  className?: string;
  [key: string]: unknown;
}

const IndexPage = ({
  title,
  description = null,
  headerContent = null,
  children,
  loading = false,
  error = null,
  emptyMessage = 'Keine Inhalte verfügbar.',
  className = '',
  ...props
}: IndexPageProps) => {
  return (
    <div
      className={cn(
        'mx-auto mt-[60px] max-w-[1200px] flex-col px-lg box-border md:mt-0 md:px-md md:py-lg',
        className
      )}
      {...props}
    >
      <div className="text-center">
        {title && (
          <h1 className="mb-4 text-[2.5rem] font-semibold text-foreground-heading md:text-[1.75rem]">
            {title}
          </h1>
        )}
        {description && (
          <p className="mx-auto mb-xl max-w-[800px] text-center text-[1.1rem] leading-relaxed text-foreground">
            {description}
          </p>
        )}
        {headerContent && <div>{headerContent}</div>}
      </div>

      <div>
        {loading && (
          <div className="flex flex-col items-center justify-center py-xl">
            <div className="spinner" />
            <p>Lädt...</p>
          </div>
        )}

        {error && (
          <div className="py-md text-center text-red-600">
            <p>Fehler: {error}</p>
          </div>
        )}

        {!loading && !error && !children && (
          <div className="py-md text-center text-foreground">
            <p>{emptyMessage}</p>
          </div>
        )}

        {!loading && !error && children && (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-2xl max-lg:grid-cols-[repeat(auto-fill,minmax(280px,1fr))] max-md:grid-cols-[repeat(auto-fill,minmax(250px,1fr))] max-md:gap-4">
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default IndexPage;
