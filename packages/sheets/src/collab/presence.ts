import { type AwarenessLike } from './bridge.js';

import type { FWorkbook } from '@univerjs/preset-sheets-core';
import type { IRange } from '@univerjs/presets';

const THROTTLE_MS = 200;

/**
 * Publishes the local selection to awareness (V1: state only — presence
 * avatars come from useCollaborators; on-grid remote cursors would need
 * render-engine decorations and are deliberately out of scope).
 */
export function attachSelectionPresence(workbook: FWorkbook, awareness: AwarenessLike): () => void {
  let last = 0;
  let trailing: ReturnType<typeof setTimeout> | null = null;

  const publish = (selections: IRange[]) => {
    awareness.setLocalStateField('sheetSelection', {
      sheetId: workbook.getActiveSheet()?.getSheetId() ?? null,
      range: selections[0] ?? null,
    });
  };

  const disposable = workbook.onSelectionChange((selections) => {
    const now = Date.now();
    if (now - last >= THROTTLE_MS) {
      last = now;
      publish(selections);
    } else {
      if (trailing) clearTimeout(trailing);
      trailing = setTimeout(() => {
        last = Date.now();
        publish(selections);
      }, THROTTLE_MS);
    }
  });

  return () => {
    if (trailing) clearTimeout(trailing);
    disposable.dispose();
    awareness.setLocalStateField('sheetSelection', null);
  };
}
