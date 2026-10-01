import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AdminUserTable, { type AdminUserRow } from './AdminUserTable';

import { axe } from '@/test-utils';

/**
 * Die Panda-Spalte ist die eine bewusste Ausnahme von den festen Spalten:
 * sie erscheint nur dort, wo ein Admin freischalten kann, und zeigt, ob eine
 * Person nur den Instanz-Standard hat.
 */
const users: AdminUserRow[] = [
  {
    id: 'u1',
    name: 'Alex',
    email: 'alex@example.org',
    joinedAt: null,
    pandaEnabled: null,
    pandaEffective: false,
  },
  {
    id: 'u2',
    name: 'Sam',
    email: 'sam@example.org',
    joinedAt: null,
    pandaEnabled: true,
    pandaEffective: true,
  },
];

describe('AdminUserTable — Panda-Spalte', () => {
  it('fehlt auf Oberflächen ohne Freischalt-Handler', () => {
    render(<AdminUserTable users={users} isLoading={false} />);
    expect(screen.queryByRole('columnheader', { name: 'Panda' })).toBeNull();
    expect(screen.queryByRole('switch')).toBeNull();
  });

  it('schaltet frei und markiert den Instanz-Standard', async () => {
    const onPandaChange = vi.fn();
    const { container } = render(
      <AdminUserTable users={users} isLoading={false} onPandaChange={onPandaChange} />
    );

    expect(screen.getByRole('columnheader', { name: 'Panda' })).toBeTruthy();
    expect(screen.getAllByText('Standard')).toHaveLength(1);

    fireEvent.click(screen.getByRole('switch', { name: 'Panda für Alex freischalten' }));
    expect(onPandaChange).toHaveBeenCalledWith('u1', true);

    fireEvent.click(screen.getByRole('switch', { name: 'Panda für Sam sperren' }));
    expect(onPandaChange).toHaveBeenCalledWith('u2', false);

    expect(await axe(container)).toHaveNoViolations();
  });

  it('sperrt den Schalter der Zeile, die gerade gespeichert wird', () => {
    render(
      <AdminUserTable
        users={users}
        isLoading={false}
        onPandaChange={vi.fn()}
        pandaPendingUserId="u2"
      />
    );
    expect(
      (screen.getByRole('switch', { name: 'Panda für Sam sperren' }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
