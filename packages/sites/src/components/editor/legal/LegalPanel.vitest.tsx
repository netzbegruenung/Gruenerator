import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  site: { current: {} as Record<string, unknown> },
  updateSite: vi.fn(),
  locale: { current: 'de-DE' },
  toastError: vi.fn(),
}));

vi.mock('../../../hooks/useSite', () => ({
  useSite: () => ({ site: hoisted.site.current, updateSite: hoisted.updateSite }),
}));
vi.mock('@gruenerator/ui', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  toast: { error: hoisted.toastError },
}));
vi.mock('../../../SitesContext', () => ({
  useAuth: () => ({ user: { id: 'u1', locale: hoisted.locale.current } }),
}));

import { LegalPanel } from './LegalPanel';

const client = new QueryClient();

function setup() {
  return render(
    <QueryClientProvider client={client}>
      <LegalPanel />
    </QueryClientProvider>
  );
}

const blur = (label: string) => fireEvent.blur(screen.getByLabelText(label));

const type = (label: string, value: string) =>
  fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe('LegalPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    hoisted.updateSite.mockReset().mockResolvedValue({});
    hoisted.toastError.mockReset();
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

  it('reopening before the refetch keeps the newest value and sends the merged object', async () => {
    hoisted.site.current = { id: 's-reopen', legal: null };
    let release: () => void = () => {};
    hoisted.updateSite.mockImplementationOnce(
      () => new Promise<object>((res) => (release = () => res({})))
    );
    const first = setup();
    type('Name', 'Anna');
    first.unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);

    setup();
    expect(screen.getByLabelText('Name')).toHaveValue('Anna');
    type('Ort', 'Wien');
    await act(() => vi.advanceTimersByTimeAsync(800));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.updateSite).toHaveBeenCalledTimes(2);
    expect(hoisted.updateSite).toHaveBeenLastCalledWith({
      id: 's-reopen',
      data: { legal: { name: 'Anna', city: 'Wien' } },
    });
  });

  it('a failed unmount save is surfaced, keeps the value and is retried from the reopened panel', async () => {
    hoisted.site.current = { id: 's-fail', legal: null };
    hoisted.updateSite.mockRejectedValueOnce(new Error('offline'));
    const first = setup();
    type('Name', 'Anna');
    first.unmount();
    await act(() => vi.advanceTimersByTimeAsync(0));
    const [title, options] = hoisted.toastError.mock.calls[0] as [string, { description: string }];
    expect(title).toBe('Impressum nicht gespeichert');
    expect(options.description).toContain('Impressum');

    setup();
    expect(screen.getByLabelText('Name')).toHaveValue('Anna');
    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen');
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(hoisted.updateSite).toHaveBeenLastCalledWith({
      id: 's-fail',
      data: { legal: { name: 'Anna' } },
    });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('does not carry a failed save over to another site', async () => {
    hoisted.site.current = { id: 's-other', legal: null };
    setup();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByLabelText('Name')).toHaveValue('');
  });
});
