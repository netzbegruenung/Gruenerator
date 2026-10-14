'use client';

import { useEffect, useState } from 'react';
import { FiCornerDownRight } from 'react-icons/fi';

import type { FUniver } from '@gruenerator/sheets';

/**
 * Shows the range the assistant will read as "Markiert:" — the same
 * `getActiveRange()` serializeSheetContext sends, so the chip never promises a
 * reference the model does not get. Event-driven (selection + sheet switch),
 * unlike the docs chip, which has to poll BlockNote.
 */
export function SheetSelectionChip({ univerAPI }: { univerAPI: FUniver | null }) {
  const [range, setRange] = useState<string | null>(null);

  useEffect(() => {
    if (!univerAPI) return;
    const read = () =>
      setRange(
        univerAPI.getActiveWorkbook()?.getActiveSheet().getActiveRange()?.getA1Notation() ?? null
      );
    read();
    const subscriptions = [
      univerAPI.addEvent(univerAPI.Event.SelectionChanged, read),
      univerAPI.addEvent(univerAPI.Event.ActiveSheetChanged, read),
    ];
    return () => subscriptions.forEach((s) => s.dispose());
  }, [univerAPI]);

  if (!range) return null;

  return (
    <div className="mx-4 mt-3 flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-1.5 text-[12px] text-foreground-muted">
      <FiCornerDownRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary/70" />
      <span className="flex-1 italic">Auswahl: {range}</span>
    </div>
  );
}
