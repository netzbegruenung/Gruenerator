import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsDialog from './SettingsDialog';
import { useSettingsDialogStore } from './settingsDialogStore';

import { axe, renderWithProviders, screen, userEvent, within } from '@/test-utils';

/**
 * Die Hülle des Dialogs: Titelzeile, Navigation in Gruppen, aktive Pille und
 * auf schmaler Breite Liste → Bereich. Die Reiter selbst sind weggemockt —
 * hier geht es um den Rahmen, nicht um fünfzehn Inhalte.
 */

vi.mock('./settingsTabs', () => {
  const bodies = new Map<string, () => React.ReactElement>();
  return {
    getSettingsTabComponent: (tab: string) => {
      if (!bodies.has(tab)) bodies.set(tab, () => <p>Inhalt {tab}</p>);
      return bodies.get(tab);
    },
    preloadSettingsTab: () => {},
    preloadRemainingSettingsTabs: () => () => {},
    preloadSettingsTabOnHover: () => {},
    cancelSettingsHoverPreload: () => {},
  };
});

vi.mock('./useOnboarding', () => ({
  useOnboarding: () => ({ isActive: false, complete: () => {} }),
}));

vi.mock('./hooks/useAntragsgruenSites', () => ({
  useAntragsgruenSites: () => ({ data: { enabled: false, sites: [] } }),
}));

const initialWidth = window.innerWidth;

function setWidth(width: number) {
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
}

beforeEach(() => {
  useSettingsDialogStore.setState({
    isOpen: false,
    tab: 'allgemein',
    tabWasNamed: false,
    paneOpen: false,
  });
});

afterEach(() => setWidth(initialWidth));

describe('Einstellungen breit', () => {
  it('ordnet die Bereiche in vier Gruppen und markiert den offenen', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('wolke');
    renderWithProviders(<SettingsDialog />);

    const nav = await screen.findByRole('navigation', { name: 'Bereiche' });
    const groups = within(nav).getAllByRole('list');
    expect(groups.map((g) => g.getAttribute('aria-labelledby'))).toEqual([
      'settings-nav-praeferenzen',
      'settings-nav-gruenerator',
      'settings-nav-verbindungen',
      'settings-nav-uebersicht',
    ]);
    expect(within(nav).getByRole('button', { name: 'Wolke' })).toHaveAttribute(
      'aria-current',
      'page'
    );
    expect(screen.getByRole('region', { name: 'Wolke' })).toHaveTextContent('Inhalt wolke');
  });

  it('wechselt den Bereich per Klick', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.click(await screen.findByRole('button', { name: 'Nutzung' }));
    expect(screen.getByRole('region', { name: 'Nutzung' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Nutzung' })).toHaveAttribute('aria-current', 'page');
  });

  it('schließt über den Knopf in der Titelzeile', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.click(await screen.findByRole('button', { name: 'Einstellungen schließen' }));
    expect(useSettingsDialogStore.getState().isOpen).toBe(false);
  });

  it('hat keine axe-Befunde', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    const dialog = await screen.findByRole('dialog');
    expect(await axe(dialog)).toHaveNoViolations();
  });
});

describe('Einstellungen schmal', () => {
  it('öffnet ohne Ziel in der Liste', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings();
    renderWithProviders(<SettingsDialog />);

    expect(await screen.findByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zurück zu allen Bereichen' })).toBeNull();
  });

  it('öffnet mit Ziel direkt im Bereich', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings('support');
    renderWithProviders(<SettingsDialog />);

    expect(await screen.findByRole('region', { name: 'Support' })).toBeInTheDocument();
    expect(screen.queryByRole('navigation', { name: 'Bereiche' })).toBeNull();
  });

  it('geht von der Liste in den Bereich und zurück', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings();
    renderWithProviders(<SettingsDialog />);

    await userEvent.click(await screen.findByRole('button', { name: 'Briefe' }));
    expect(screen.getByRole('region', { name: 'Briefe' })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu allen Bereichen' }));
    expect(screen.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
  });

  it('hat keine axe-Befunde in der Liste', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings();
    renderWithProviders(<SettingsDialog />);

    const dialog = await screen.findByRole('dialog');
    expect(await axe(dialog)).toHaveNoViolations();
  });
});
