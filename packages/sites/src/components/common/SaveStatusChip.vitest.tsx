import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { axe } from 'vitest-axe';

import { SaveStatusChip } from './SaveStatusChip';

describe('SaveStatusChip', () => {
  it.each([
    ['saved', 'Gespeichert'],
    ['saving', 'Wird gespeichert …'],
    ['offline', 'Offline – Änderungen bleiben auf diesem Gerät'],
  ] as const)('shows the %s state in a polite status region', (status, text) => {
    render(<SaveStatusChip status={status} />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
  });

  it('has no axe violations', async () => {
    const { container } = render(<SaveStatusChip status="offline" />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
