import { type ReactNode } from 'react';
import { type IconType } from 'react-icons';

/**
 * Kopf eines Abschnitts im Konnektoren-Reiter — dieselbe Kachel-Optik wie der
 * Kopf der Dienste in McpSection, damit Wolke, Websites und Dienste als eine
 * Liste von Verbindungen lesen und nicht als drei Seiten.
 */
export function ConnectorHeader({
  icon: Icon,
  title,
  children,
}: {
  icon: IconType;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-md">
        <div className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-[14px] border border-primary-100 bg-primary-50 text-primary dark:border-primary-800 dark:bg-primary-950/30 dark:text-primary-400">
          <Icon className="h-6 w-6" aria-hidden />
        </div>
        <h2 className="m-0 text-2xl font-semibold tracking-tight text-foreground-heading">
          {title}
        </h2>
      </div>
      {children && (
        <p className="mt-sm mb-0 max-w-xl text-sm leading-relaxed text-grey-500">{children}</p>
      )}
    </div>
  );
}
