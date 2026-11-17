import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import SettingsDialog from './SettingsDialog';
import { useSettingsDialogStore } from './settingsDialogStore';

import { act, axe, renderWithProviders, screen, userEvent, waitFor, within } from '@/test-utils';

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

describe('Einstellungen Suche', () => {
  it('zeigt Treffer statt der Gruppen und wechselt per Klick den Bereich', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    const field = await screen.findByRole('searchbox', { name: 'Einstellungen durchsuchen' });
    await userEvent.type(field, 'wolke');

    const nav = screen.getByRole('navigation', { name: 'Bereiche' });
    expect(within(nav).queryByText('Präferenzen')).toBeNull();
    await userEvent.click(within(nav).getAllByRole('button', { name: /Wolke/ })[0]);

    expect(screen.getByRole('region', { name: 'Wolke' })).toBeInTheDocument();
    expect(field).toHaveValue('');
    expect(within(nav).getAllByRole('list').length).toBeGreaterThan(1);
  });

  it('lässt den Fokus nach einem Treffer nicht auf <body> fallen (breit)', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), 'wolke');
    await userEvent.click(screen.getAllByRole('button', { name: /Wolke/ })[0]);

    await waitFor(() => expect(document.activeElement).not.toBe(document.body));
    expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement);
  });

  it('leert die Suche, wenn der Dialog von außen schließt', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    const field = await screen.findByRole('searchbox');
    await userEvent.type(field, 'wolke');
    act(() => useSettingsDialogStore.getState().close());
    act(() => useSettingsDialogStore.getState().openSettings('allgemein'));
    expect(await screen.findByRole('searchbox')).toHaveValue('');
  });

  it('findet Umlaute auch ohne Umlaut', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), 'barriere');
    expect(screen.getAllByRole('button', { name: /Allgemein/ }).length).toBeGreaterThan(0);
  });

  it('meldet einen leeren Treffer', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), 'xyzzy');
    expect(screen.getByText('Keine Treffer für „xyzzy“')).toBeInTheDocument();
  });

  it('leert mit Escape zuerst das Feld und schließt erst beim zweiten', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    const field = await screen.findByRole('searchbox');
    await userEvent.type(field, 'wolke');
    await userEvent.keyboard('{Escape}');
    expect(field).toHaveValue('');
    expect(useSettingsDialogStore.getState().isOpen).toBe(true);

    await userEvent.keyboard('{Escape}');
    expect(useSettingsDialogStore.getState().isOpen).toBe(false);
  });

  it('schließt sofort, wenn im Feld nur Leerzeichen stehen', async () => {
    // Dann zeigt der Dialog keine Treffer, sondern die normale Navigation —
    // ein Escape, das erst das Feld leert, wäre für niemanden sichtbar.
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), '   ');
    await userEvent.keyboard('{Escape}');
    expect(useSettingsDialogStore.getState().isOpen).toBe(false);
  });

  it('öffnet schmal nach einem Treffer den Bereich', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings();
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), 'support');
    await userEvent.click(screen.getAllByRole('button', { name: /Support/ })[0]);
    expect(await screen.findByRole('region', { name: 'Support' })).toBeInTheDocument();
  });

  it('hat keine axe-Befunde mit Treffern', async () => {
    setWidth(1280);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);

    await userEvent.type(await screen.findByRole('searchbox'), 'dunkel');
    expect(await axe(await screen.findByRole('dialog'))).toHaveNoViolations();
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

    expect(screen.getByRole('button', { name: 'Zurück zu allen Bereichen' })).toHaveFocus();

    await userEvent.click(screen.getByRole('button', { name: 'Zurück zu allen Bereichen' }));
    expect(screen.getByRole('navigation', { name: 'Bereiche' })).toBeVisible();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Briefe' })).toHaveFocus();
  });

  it('führt den Fokus nach, wenn ein Reiter selbst den Bereich wechselt', async () => {
    // Wie „Einrichtung erneut starten" in Allgemein: setTab direkt, nicht
    // über die Navigation des Dialogs.
    setWidth(390);
    useSettingsDialogStore.getState().openSettings('allgemein');
    renderWithProviders(<SettingsDialog />);
    await screen.findByRole('region', { name: 'Allgemein' });
    // Sonst stünde der Fokus vom Öffnen schon auf „Zurück", und der Test
    // bewiese nichts.
    screen.getByRole('button', { name: 'Einstellungen schließen' }).focus();

    act(() => useSettingsDialogStore.getState().setTab('support'));

    expect(await screen.findByRole('region', { name: 'Support' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Zurück zu allen Bereichen' })).toHaveFocus();
  });

  it('hat keine axe-Befunde in der Liste', async () => {
    setWidth(390);
    useSettingsDialogStore.getState().openSettings();
    renderWithProviders(<SettingsDialog />);

    const dialog = await screen.findByRole('dialog');
    expect(await axe(dialog)).toHaveNoViolations();
  });
});
