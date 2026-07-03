import { type ShareMode, type SharePermissionLevel } from './types.js';

export const SHARE_MODE_OPTIONS: { value: ShareMode; label: string; description: string }[] = [
  {
    value: 'private',
    label: 'Privat',
    description: 'Nur eingeladene Personen und Gruppen haben Zugriff',
  },
  {
    value: 'authenticated',
    label: 'Mit Anmeldung',
    description: 'Jeder angemeldete Nutzer mit dem Link kann zugreifen',
  },
  {
    value: 'public',
    label: 'Öffentlich',
    description: 'Jeder mit dem Link kann ohne Anmeldung zugreifen',
  },
];

export const PERMISSION_LEVEL_LABELS: Record<SharePermissionLevel, string> = {
  owner: 'Eigentümer*in',
  editor: 'Bearbeiter*in',
  viewer: 'Betrachter*in',
};
