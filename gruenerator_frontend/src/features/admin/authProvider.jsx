// Einfacher Auth Provider mit Passwortschutz
export const authProvider = {
  login: ({ username, password }) => {
    // Hier könntest du später die Authentifizierung über Supabase implementieren
    // Für den Anfang verwenden wir eine einfache Passwortprüfung
    const validPassword = import.meta.env.VITE_ADMIN_PASSWORD || 'admin';
    if (password === validPassword) {
      localStorage.setItem('auth', 'true');
      return Promise.resolve();
    }
    return Promise.reject('Falsches Passwort');
  },
  logout: () => {
    localStorage.removeItem('auth');
    return Promise.resolve();
  },
  checkAuth: () => {
    return localStorage.getItem('auth') 
      ? Promise.resolve() 
      : Promise.reject();
  },
  checkError: (error) => {
    const status = error.status;
    if (status === 401 || status === 403) {
      localStorage.removeItem('auth');
      return Promise.reject();
    }
    return Promise.resolve();
  },
  getPermissions: () => Promise.resolve(),
  getIdentity: () => {
    return Promise.resolve({
      id: 'admin',
      fullName: 'Administrator',
    });
  },
}; 