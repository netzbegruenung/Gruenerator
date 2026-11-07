import { type MonitorLocale } from '@gruenerator/contracts';
import { useAuth } from '@gruenerator/shared/hooks';

/** `de-AT` ist Österreich (`at`), alles andere `de` — auch solange das Profil lädt. */
export function toMonitorLocale(userLocale: string | null | undefined): MonitorLocale {
  return userLocale === 'de-AT' ? 'at' : 'de';
}

export function useMonitorLocale(): MonitorLocale {
  return toMonitorLocale(useAuth().locale);
}
