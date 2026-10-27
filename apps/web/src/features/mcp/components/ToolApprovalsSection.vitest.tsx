/**
 * Eigene Werkzeuge speichert der Server mit dem Katalognamen als `toolLabel`
 * (`tabelle_auswerten`) — in den Einstellungen soll trotzdem der deutsche Name
 * stehen. Konnektor-Labels bleiben, wie der Server sie liefert.
 */
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ToolApprovalsSection from './ToolApprovalsSection';

import { render } from '@/test-utils';

let approvals: Array<{ scopeKey: string; toolLabel: string | null }> = [];
vi.mock('../hooks/useToolApprovals', () => ({
  useToolApprovals: () => ({ data: approvals, isLoading: false }),
  useRevokeToolApproval: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('ToolApprovalsSection', () => {
  it('zeigt für tabelle_auswerten den deutschen Namen statt des gespeicherten Katalognamens', () => {
    approvals = [
      { scopeKey: 'internal/tabelle_auswerten', toolLabel: 'tabelle_auswerten' },
      { scopeKey: 'system-wetter/forecast', toolLabel: 'Wetter: Vorhersage' },
    ];
    render(<ToolApprovalsSection onSuccess={vi.fn()} onError={vi.fn()} />);
    expect(screen.getByText('Tabellen auswerten (Python im Browser)')).toBeInTheDocument();
    expect(screen.queryByText('tabelle_auswerten')).not.toBeInTheDocument();
    expect(screen.getByText('Wetter: Vorhersage')).toBeInTheDocument();
  });
});
