import { describe, expect, it } from 'vitest';

import {
  loadCreatorSession,
  saveCreatorSession,
} from '../features/image-studio/freitext/creatorSession';

import { useAuthStore } from './authStore';

describe('authStore.clearAuth', () => {
  it('drops the sharepic creator chat, so it never reaches the next account', () => {
    saveCreatorSession({
      userId: 'u1',
      messages: [{ id: 1, role: 'user', text: 'Ein Sharepic zum Klimaschutz' }],
      spec: null,
      attributions: [],
      brief: '',
      photos: [],
    });
    expect(loadCreatorSession('u1')).not.toBeNull();

    useAuthStore.getState().clearAuth('logout');

    expect(loadCreatorSession('u1')).toBeNull();
  });
});
