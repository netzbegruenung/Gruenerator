import { create } from 'zustand';

interface User {
  id: string;
  email?: string;
  display_name?: string;
  avatar_url?: string;
}

interface AuthStore {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;

  setAuthState: (data: { user: User | null; isAuthenticated: boolean }) => void;
  clearAuth: () => void;
  login: (redirectTo?: string) => void;
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthStore>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  setAuthState: (data) => set({
    user: data.user,
    isAuthenticated: data.isAuthenticated,
    isLoading: false,
  }),

  clearAuth: () => set({
    user: null,
    isAuthenticated: false,
    isLoading: false,
  }),

  login: (redirectTo) => {
    const redirect = redirectTo || window.location.pathname;
    window.location.href = `/api/auth/login?source=gruenerator-login&redirectTo=${encodeURIComponent(redirect)}`;
  },

  logout: async () => {
    try {
      const { apiClient } = await import('../lib/apiClient');
      await apiClient.post('/auth/logout');
    } finally {
      set({
        user: null,
        isAuthenticated: false,
      });
      window.location.href = '/';
    }
  },
}));
