export const validators = {
  subdomain: (value: string): string | null => {
    if (!value) return 'Subdomain ist erforderlich';
    if (!/^[a-z0-9-]+$/.test(value)) return 'Nur Kleinbuchstaben, Zahlen und Bindestriche erlaubt';
    if (value.length < 3) return 'Mindestens 3 Zeichen';
    if (value.length > 50) return 'Maximal 50 Zeichen';
    if (value.startsWith('-') || value.endsWith('-'))
      return 'Darf nicht mit Bindestrich beginnen oder enden';
    if (value.includes('--')) return 'Doppelte Bindestriche sind nicht erlaubt';
    return null;
  },

  email: (value: string): string | null => {
    if (!value) return null; // Optional field
    // Length first, so the pattern never sees an unbounded string. The domain
    // labels also exclude '.', which is what makes the pattern unambiguous:
    // with `[^\s@]+\.[^\s@]+` the engine can split the same run at every dot,
    // which is quadratic in the input length (CodeQL js/polynomial-redos).
    if (value.length > 254) return 'E-Mail-Adresse zu lang';
    const emailRegex = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
    if (!emailRegex.test(value)) return 'Ungültige E-Mail-Adresse';
    return null;
  },

  description: (value: string): string | null => {
    if (!value) return 'Beschreibung ist erforderlich';
    if (value.length < 50) return 'Mindestens 50 Zeichen für gute KI-Ergebnisse empfohlen';
    if (value.length > 5000) return 'Maximal 5000 Zeichen';
    return null;
  },

  url: (value: string): string | null => {
    if (!value) return null; // Optional
    try {
      const url = new URL(value);
      if (!['http:', 'https:'].includes(url.protocol)) {
        return 'URL muss mit http:// oder https:// beginnen';
      }
      return null;
    } catch {
      return 'Ungültige URL';
    }
  },

  phone: (value: string): string | null => {
    if (!value) return null; // Optional
    const phoneRegex = /^[\d\s\-+()]+$/;
    if (!phoneRegex.test(value)) return 'Ungültige Telefonnummer';
    const digitsOnly = value.replace(/\D/g, '');
    if (digitsOnly.length < 5) return 'Telefonnummer zu kurz';
    if (digitsOnly.length > 20) return 'Telefonnummer zu lang';
    return null;
  },
};
