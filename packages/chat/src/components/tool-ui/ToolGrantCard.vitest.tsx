/**
 * Freigabe-Karte für neue oder geänderte Werkzeuge: drei Umfänge, danach eine
 * Plakette. Die Antwort geht über den einen geteilten POST (answerToolGrant).
 */
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { axe } from '../../test-utils';

import { ToolGrantCard } from './ToolGrantCard';

const answerToolGrant = vi.hoisted(() => vi.fn());
vi.mock('../../lib/toolGrant', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  answerToolGrant,
}));

const grant = {
  serverId: 's1',
  serverName: 'Demo',
  added: ['themes-get_theme'],
  changed: [],
  threadId: 't1',
};

describe('ToolGrantCard', () => {
  beforeEach(() => {
    answerToolGrant.mockReset().mockResolvedValue({ status: 'resolved', scope: 'session' });
  });

  it('zeigt Dienst, Werkzeuge und die drei Umfänge', () => {
    render(<ToolGrantCard grant={grant} />);
    expect(screen.getByText('Demo bietet neue Werkzeuge an')).toBeTruthy();
    expect(screen.getByText('themes-get_theme')).toBeTruthy();
    for (const label of ['Ablehnen', 'Nur dieses Gespräch', 'Immer']) {
      expect(screen.getByRole('button', { name: label })).toBeTruthy();
    }
  });

  it('beantwortet „Nur dieses Gespräch" und zeigt danach die Plakette', async () => {
    const user = userEvent.setup();
    render(<ToolGrantCard grant={grant} />);

    await user.click(screen.getByRole('button', { name: 'Nur dieses Gespräch' }));

    expect(answerToolGrant).toHaveBeenCalledWith(grant, 't1', 'session');
    expect(await screen.findByText(/Für dieses Gespräch freigegeben/)).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Immer' })).toBeNull();
  });

  it('meldet einen Fehler und lässt die Knöpfe stehen', async () => {
    answerToolGrant.mockResolvedValue({ status: 'error', message: 'Kaputt' });
    const user = userEvent.setup();
    render(<ToolGrantCard grant={grant} />);

    await user.click(screen.getByRole('button', { name: 'Immer' }));

    expect((await screen.findByRole('alert')).textContent).toBe('Kaputt');
    expect(screen.getByRole('button', { name: 'Immer' })).toBeTruthy();
  });

  it('zeigt eine schon beantwortete Karte nach dem Reload als Plakette', () => {
    render(<ToolGrantCard grant={{ ...grant, resolved: 'denied' }} />);
    expect(screen.getByText('Abgeschaltet')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('hat keine a11y-Verstösse', async () => {
    const { container } = render(<ToolGrantCard grant={{ ...grant, changed: ['search'] }} />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
