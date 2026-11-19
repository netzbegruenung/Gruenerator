import { type SiteDraft } from '@gruenerator/contracts';
import { render, type RenderResult } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { type ReactElement } from 'react';

import { SiteDraftProvider } from '../draft/SiteDraftContext';
import { seededDoc } from '../draft/testDoc';

import type * as Y from 'yjs';

export function renderWithDraft(
  ui: ReactElement,
  draft: Partial<SiteDraft> = {}
): RenderResult & { ydoc: Y.Doc; user: UserEvent } {
  const ydoc = seededDoc(draft);
  const user = userEvent.setup();
  const result = render(<SiteDraftProvider ydoc={ydoc}>{ui}</SiteDraftProvider>);
  return { ...result, ydoc, user };
}
