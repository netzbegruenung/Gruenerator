import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';

import { lightTheme } from '../../../theme/colors';

import { ToolApprovalCard } from './ToolApprovalCard';

jest.mock('@gruenerator/chat', () => ({
  REJECT_REASON_MAX_LENGTH: 500,
  REJECT_REASON_PLACEHOLDER: 'Was soll stattdessen passieren? (optional)',
  approvalDecidedLabel: (approval: { approved?: boolean; optionId?: string }) =>
    approval.approved === false
      ? 'Abgelehnt'
      : approval.optionId === 'allow-always'
        ? 'Immer erlaubt'
        : 'Erlaubt',
  formatNamespacedToolLabel: () => 'Datei teilen',
  isApprovalDecided: (approval: { approved?: boolean; resolution?: string }) =>
    approval.approved !== undefined || approval.resolution !== undefined,
  TOOL_APPROVAL_OPTIONS: [
    { id: 'allow-once', kind: 'allow-once', label: 'Einmal erlauben' },
    {
      id: 'allow-always',
      kind: 'allow-always',
      label: 'Immer erlauben',
      description: 'Dieses Werkzeug läuft künftig ohne Rückfrage.',
    },
    { id: 'reject-once', kind: 'reject-once', label: 'Ablehnen' },
  ],
}));

const renderCard = (
  respondToApproval: jest.Mock = jest.fn(),
  approval: { id: string; approved?: boolean; optionId?: string } = { id: 'call-1' }
) => {
  render(
    <ToolApprovalCard
      toolName="mcp__drive__share_file"
      args={{ path: '/Plan.pdf' }}
      approval={approval}
      title="Datei teilen"
      serverName="Google Drive"
      respondToApproval={respondToApproval}
      theme={lightTheme}
    />
  );
  return respondToApproval;
};

describe('ToolApprovalCard', () => {
  it('shows the service warning, all decisions, and expandable arguments', () => {
    renderCard();

    expect(screen.getByText('Datei teilen ausführen?')).toBeTruthy();
    expect(screen.getByText(/Google Drive ist ein verbundener Dienst/)).toBeTruthy();
    expect(screen.getByText('Einmal erlauben')).toBeTruthy();
    expect(screen.getByText('Immer erlauben')).toBeTruthy();
    expect(screen.getByText('Ablehnen')).toBeTruthy();

    fireEvent.press(screen.getByLabelText('Übergabewerte anzeigen'));
    expect(screen.getByText(/Plan\.pdf/)).toBeTruthy();
  });

  it.each([
    { label: 'Einmal erlauben', approved: true, optionId: 'allow-once' },
    { label: 'Immer erlauben', approved: true, optionId: 'allow-always' },
  ] as const)(
    'submits $label through the assistant-ui approval callback',
    ({ label, approved, optionId }) => {
      const respond = renderCard();

      fireEvent.press(screen.getByText(label));

      expect(respond).toHaveBeenCalledWith({ approved, optionId });
    }
  );

  it('asks for an optional reason before rejecting and passes it on', () => {
    const respond = renderCard();

    fireEvent.press(screen.getByText('Ablehnen'));
    expect(respond).not.toHaveBeenCalled();
    fireEvent.changeText(
      screen.getByLabelText('Begründung für die Ablehnung'),
      '  Lieber nur einen Entwurf  '
    );
    fireEvent.press(screen.getByLabelText('Ablehnen'));

    expect(respond).toHaveBeenCalledWith({
      approved: false,
      optionId: 'reject-once',
      reason: 'Lieber nur einen Entwurf',
    });
  });

  it('rejects without a reason when the field stays empty', () => {
    const respond = renderCard();

    fireEvent.press(screen.getByText('Ablehnen'));
    fireEvent.press(screen.getByLabelText('Ablehnen'));

    expect(respond).toHaveBeenCalledWith({ approved: false, optionId: 'reject-once' });
  });

  it('renders a terminal badge instead of controls after a decision', () => {
    renderCard(jest.fn(), { id: 'call-1', approved: true, optionId: 'allow-always' });

    expect(screen.getByText('Immer erlaubt')).toBeTruthy();
    expect(screen.queryByText('Einmal erlauben')).toBeNull();
  });
});
