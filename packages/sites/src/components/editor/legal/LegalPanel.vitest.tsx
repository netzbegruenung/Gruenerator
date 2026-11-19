import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  site: { current: {} as Record<string, unknown> },
  updateSite: vi.fn(),
  locale: { current: 'de-DE' },
}));

vi.mock('../../../hooks/useSite', () => ({
  useSite: () => ({ site: hoisted.site.current, updateSite: hoisted.updateSite }),
}));
vi.mock('../../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: hoisted.locale.current } }),
}));

import { LegalPanel } from './LegalPanel';

function setup() {
  return render(<LegalPanel />);
}

const blur = (label: string) => fireEvent.blur(screen.getByLabelText(label));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LegalPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.updateSite.mockReset().mockResolvedValue({});
    hoisted.locale.current = 'de-DE';
    hoisted.site.current = { id: 's1', legal: null };
  });
  afterEach(() => vi.useRealTimers());

  it('typing three fields sends one PUT with all three', async () => {
    setup();
    type('Name', 'Anna');
    type('Ort', 'Wien');
    type('E-Mail', 'a@b.de');
    expect(hoisted.updateSite).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);
    expect(hoisted.updateSite).toHaveBeenCalledWith({
      id: 's1',
      data: { legal: { name: 'Anna', city: 'Wien', email: 'a@b.de' } },
    });
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
  });

  it('unmounting 300 ms after typing flushes exactly one PUT with the typed value', async () => {
    const view = setup();
    type('Name', 'Anna');
    await act(() => vi.advanceTimersByTimeAsync(300));
    expect(hoisted.updateSite).not.toHaveBeenCalled();
    view.unmount();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);
    expect(hoisted.updateSite).toHaveBeenCalledWith({
      id: 's1',
      data: { legal: { name: 'Anna' } },
    });
  });

  it('pagehide flushes a pending save', async () => {
    setup();
    type('Name', 'Anna');
    window.dispatchEvent(new Event('pagehide'));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);
  });

  it('does not save on mount and waits the full 800 ms', async () => {
    setup();
    await act(() => vi.advanceTimersByTimeAsync(2000));
    expect(hoisted.updateSite).not.toHaveBeenCalled();
    type('Name', 'A');
    await act(() => vi.advanceTimersByTimeAsync(799));
    expect(hoisted.updateSite).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);
  });

  it('an invalid e-mail shows "E-Mail-Adresse ist ungültig" on blur', async () => {
    setup();
    type('E-Mail', 'kein-mail');
    expect(screen.queryByText('E-Mail-Adresse ist ungültig')).toBeNull();
    blur('E-Mail');
    expect(screen.getByText('E-Mail-Adresse ist ungültig')).toBeInTheDocument();
    expect(screen.getByLabelText('E-Mail')).toHaveAttribute('aria-invalid', 'true');
  });

  it('an empty required field shows its message on blur, phone never does', async () => {
    setup();
    blur('Name');
    expect(screen.getByText('Name fehlt')).toBeInTheDocument();
    blur('Telefon (freiwillig)');
    expect(screen.queryByText(/Telefon.*fehlt/)).toBeNull();
  });

  it('shows the German hint for de-DE and the Austrian one for de-AT', () => {
    setup();
    expect(
      screen.getByText('Pflichtangaben nach § 5 DDG. Sie stehen im Impressum deiner Website.')
    ).toBeInTheDocument();
  });

  it('the Austrian hint names § 25 MedienG', () => {
    hoisted.locale.current = 'de-AT';
    setup();
    expect(
      screen.getByText(
        'Pflichtangaben nach § 5 ECG und § 25 MedienG. Sie stehen im Impressum deiner Website.'
      )
    ).toBeInTheDocument();
    expect(screen.queryByText(/DDG/)).toBeNull();
  });

  it('enforces the field limits and loads saved values', () => {
    hoisted.site.current = { id: 's1', legal: { name: 'Berta', phone: '123' } };
    setup();
    expect(screen.getByLabelText('Name')).toHaveValue('Berta');
    expect(screen.getByLabelText('Name')).toHaveAttribute('maxlength', '120');
    expect(screen.getByLabelText('Straße und Hausnummer')).toHaveAttribute('maxlength', '160');
    expect(screen.getByLabelText('Postleitzahl')).toHaveAttribute('maxlength', '12');
    expect(screen.getByLabelText('Ort')).toHaveAttribute('maxlength', '80');
    expect(screen.getByLabelText('E-Mail')).toHaveAttribute('maxlength', '254');
    expect(screen.getByLabelText('Telefon (freiwillig)')).toHaveAttribute('maxlength', '40');
  });

  it('shows an error with a retry that sends again and recovers', async () => {
    hoisted.updateSite.mockRejectedValueOnce(new Error('boom'));
    setup();
    type('Name', 'Anna');
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen');
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByText('Gespeichert')).toBeInTheDocument();
  });
});
