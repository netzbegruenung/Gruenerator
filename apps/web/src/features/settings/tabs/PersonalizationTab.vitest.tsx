import { createApiClient, setGlobalApiClient } from '@gruenerator/shared/api';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { server } from '../../../test/msw-server';

import PersonalizationTab from './PersonalizationTab';

import { useAuthStore } from '@/stores/authStore';
import { renderWithProviders, screen, waitFor } from '@/test-utils';

const PROFILE = 'http://localhost/api/auth/profile';

beforeAll(() => {
  setGlobalApiClient(createApiClient({ baseURL: 'http://localhost/api', authMode: 'cookie' }));
});

beforeEach(() => {
  useAuthStore.setState({ user: { id: 'u1' } as never });
  server.use(
    http.get(PROFILE, () => HttpResponse.json({ id: 'u1', custom_prompt: '' })),
    http.put(PROFILE, () =>
      HttpResponse.json({ success: true, profile: { id: 'u1', custom_prompt: 'Duze alle.' } })
    )
  );
});

afterEach(() => {
  server.resetHandlers();
});

describe('PersonalizationTab', () => {
  it('keeps the save button mounted so focus survives a save', async () => {
    const { user } = renderWithProviders(<PersonalizationTab />);
    const field = await screen.findByRole('textbox', { name: 'Anweisungen' });
    const button = screen.getByRole('button', { name: 'Speichern' });
    expect(button).toBeDisabled();

    await user.type(field, 'Duze alle.');
    expect(button).toBeEnabled();
    button.focus();
    await user.click(button);

    await waitFor(() => expect(screen.getByRole('button', { name: 'Gespeichert' })).toBeDisabled());
    expect(document.activeElement).not.toBe(document.body);

    await user.type(field, '!');
    expect(screen.getByRole('button', { name: 'Speichern' })).toBeEnabled();
  });
});
