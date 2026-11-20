import { Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { VoiceRedirect, TranskriptionRedirect } from './legacyRedirects';
import VertonenPage from './VertonenPage';

import { useAuthStore } from '@/stores/authStore';
import { fireEvent, renderWithProviders, screen } from '@/test-utils';

vi.mock('../voice/VoicePage', () => ({
  default: () => <div>VOICE-BODY</div>,
}));
vi.mock('../transkription/TranskriptionPage', () => ({
  default: () => <div>TRANSKRIPTION-BODY</div>,
}));

function Where() {
  const { pathname, search } = useLocation();
  return <output data-testid="where">{pathname + search}</output>;
}

function renderAt(url: string) {
  useAuthStore.setState({ user: { id: 'u1' } } as never);
  return renderWithProviders(
    <>
      <Routes>
        <Route path="/vertonen" element={<VertonenPage />} />
        <Route path="/voice" element={<VoiceRedirect />} />
        <Route path="/transkription" element={<TranskriptionRedirect />} />
      </Routes>
      <Where />
    </>,
    { route: url }
  );
}

describe('VertonenPage', () => {
  it('defaults to text → audio and switches mode, updating the URL', () => {
    renderAt('/vertonen');
    expect(screen.getByRole('button', { name: /Text vertonen/ })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('VOICE-BODY')).toBeVisible();
    expect(screen.queryByText('TRANSKRIPTION-BODY')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Audio transkribieren/ }));
    expect(screen.getByTestId('where')).toHaveTextContent('/vertonen?modus=audio-zu-text');
    expect(screen.getByText('TRANSKRIPTION-BODY')).toBeVisible();
    // The first mode stays mounted (state survives), only hidden.
    expect(screen.getByText('VOICE-BODY')).not.toBeVisible();
  });

  it('opens in the mode named by ?modus=', () => {
    renderAt('/vertonen?modus=audio-zu-text');
    expect(screen.getByText('TRANSKRIPTION-BODY')).toBeVisible();
    expect(screen.queryByText('VOICE-BODY')).toBeNull();
  });

  it('keeps the old routes working', () => {
    renderAt('/voice?x=1');
    expect(screen.getByTestId('where')).toHaveTextContent('/vertonen?x=1&modus=text-zu-audio');
  });

  it('redirects /transkription to audio → text', () => {
    renderAt('/transkription');
    expect(screen.getByTestId('where')).toHaveTextContent('/vertonen?modus=audio-zu-text');
    expect(screen.getByText('TRANSKRIPTION-BODY')).toBeVisible();
  });
});
