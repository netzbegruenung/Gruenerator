import { Calendar } from '@gruenerator/ui';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { axe } from '../../../test-utils';
import { parseLocalDate } from '../utils/recurrence';

// The card's due-date picker (CardDetailPanel) is the shared Calendar with these props.
describe('due-date calendar', () => {
  it('opens on the due date in German, weeks starting Monday', async () => {
    const dueDay = parseLocalDate('2026-06-21');
    const { container } = render(
      <Calendar mode="single" selected={dueDay ?? undefined} defaultMonth={dueDay ?? undefined} />
    );

    expect(screen.getByText('Juni 2026')).toBeInTheDocument();
    expect(container.querySelector('th[scope="col"]')).toHaveAccessibleName('Montag');
    expect(screen.getByRole('button', { name: /21\. Juni 2026, ausgewählt/ })).toBeInTheDocument();
    expect(await axe(container)).toHaveNoViolations();
  });
});
