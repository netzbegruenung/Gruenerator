import { Tooltip, TooltipContent, TooltipTrigger } from '@gruenerator/ui';
import { type ReactElement } from 'react';

/** Tooltip mit dem Eintragsnamen — nur in der eingeklappten Leiste, wo das Label fehlt. */
export function NavTooltip({
  label,
  collapsed,
  children,
}: {
  label: string;
  collapsed: boolean;
  children: ReactElement;
}) {
  if (!collapsed) return children;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
