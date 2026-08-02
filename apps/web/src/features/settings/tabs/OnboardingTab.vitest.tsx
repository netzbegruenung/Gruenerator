import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import OnboardingTab from './OnboardingTab';

import { axe } from '@/test-utils';

/**
 * Geprüft wird die Schrittfolge, nicht das, was in den Schritten steht: Die drei
 * Bereiche sind hier durch Platzhalter ersetzt, weil sie ihre eigenen Tests
 * haben und ihre Abhängigkeiten (Profil, Wolke, User-Defaults) für diese Frage
 * nichts beitragen.
 *
 * Der Kern ist, dass Überspringen kein Sonderweg ist: Jeder Schritt lässt sich
 * mit „Weiter" ODER „Überspringen" verlassen, und beide enden nach dem letzten
 * Schritt im selben `complete()`.
 */

const complete = vi.fn();

vi.mock('../useOnboarding', () => ({
  useOnboarding: () => ({ isActive: true, complete, restart: vi.fn() }),
}));

vi.mock('./RolesSection', () => ({ default: () => <div data-testid="step-body">Rollen</div> }));
vi.mock('./FriendsTab', () => ({
  default: () => <div data-testid="step-body">Friends</div>,
  prefetch: vi.fn(),
}));
vi.mock('./BackgroundTab', () => ({
  default: () => <div data-testid="step-body">Hintergrund</div>,
}));

const stepBody = () => screen.getByTestId('step-body').textContent;

beforeEach(() => {
  complete.mockClear();
});

describe('OnboardingTab', () => {
  it('starts on the role step with no way back', () => {
    render(<OnboardingTab />);

    expect(stepBody()).toBe('Rollen');
    expect(screen.getByRole('button', { name: 'Zurück' })).toBeDisabled();
  });

  it('walks forward through all three steps', async () => {
    const user = userEvent.setup();
    render(<OnboardingTab />);

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(stepBody()).toBe('Friends');

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    expect(stepBody()).toBe('Hintergrund');
    expect(screen.queryByRole('button', { name: 'Weiter' })).toBeNull();
  });

  it('walks back to the previous step', async () => {
    const user = userEvent.setup();
    render(<OnboardingTab />);

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('button', { name: 'Zurück' }));
    expect(stepBody()).toBe('Rollen');
  });

  it('advances on skip just like on continue', async () => {
    const user = userEvent.setup();
    render(<OnboardingTab />);

    await user.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(stepBody()).toBe('Friends');
    expect(complete).not.toHaveBeenCalled();
  });

  it('completes once the last step is finished', async () => {
    const user = userEvent.setup();
    render(<OnboardingTab />);

    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('button', { name: 'Weiter' }));
    await user.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('completes when the last step is skipped', async () => {
    const user = userEvent.setup();
    render(<OnboardingTab />);

    await user.click(screen.getByRole('button', { name: 'Überspringen' }));
    await user.click(screen.getByRole('button', { name: 'Überspringen' }));
    await user.click(screen.getByRole('button', { name: 'Überspringen' }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('completes straight away on "Alles überspringen"', async () => {
    await userEvent
      .setup()
      .click(render(<OnboardingTab />).getByRole('button', { name: 'Alles überspringen' }));
    expect(complete).toHaveBeenCalledTimes(1);
  });

  it('has no axe violations', async () => {
    const { container } = render(<OnboardingTab />);
    expect(await axe(container)).toHaveNoViolations();
  });
});
