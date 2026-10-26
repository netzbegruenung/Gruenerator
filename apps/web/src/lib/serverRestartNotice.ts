import { reportServerBack, subscribeServerRestart } from '@gruenerator/shared/api';
import { toast } from '@gruenerator/ui';

import apiClient from '../components/utils/apiClient';

import type { QueryClient } from '@tanstack/react-query';

const TOAST_ID = 'server-restart';
const POLL_INTERVAL_MS = 2_000;
/** Ein Neustart dauert gewöhnlich gut zehn Sekunden; danach sagen wir ehrlich, dass es länger dauert. */
const SLOW_AFTER_MS = 60_000;
/**
 * Im Dev-Bypass antwortet Vites Proxy bei jedem tsx-watch-Neustart (oder ganz
 * ohne laufende API) mit `502 text/plain` — für das Signal ein nginx-Neustart.
 * Dort bleibt der Hinweis stumm; Abfrage und Neuladen laufen weiter, sonst
 * bliebe das Signal auf „down" und schluckte jeden späteren Fehler-Toast.
 */
const SILENT = import.meta.env.VITE_E2E_AUTH_BYPASS === 'true';

/**
 * Zeigt während eines Backend-Neustarts einen einzigen Hinweis statt vieler
 * Fehler, fragt `/api/auth/health` ab, bis die API wieder antwortet, und lädt
 * dann alle Abfragen neu. Ausgelöst wird er von den Transporten über
 * `reportGatewayDown()` (siehe `serverRestartSignal.ts`).
 *
 * @returns Abmeldefunktion.
 */
export function startServerRestartNotice(queryClient: QueryClient): () => void {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let downSince = 0;
  let toldSlow = false;

  const poll = async (): Promise<void> => {
    try {
      await apiClient.get('/auth/health', { skipAuthRedirect: true, timeout: 5_000 });
      reportServerBack();
      return;
    } catch {
      // Noch nicht da — weiter warten.
    }
    if (!SILENT && !toldSlow && Date.now() - downSince > SLOW_AFTER_MS) {
      toldSlow = true;
      toast.loading('Der Grünerator startet gerade neu', {
        id: TOAST_ID,
        description: 'Das dauert länger als üblich. Wir versuchen es weiter.',
      });
    }
    timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
  };

  const unsubscribe = subscribeServerRestart((restarting) => {
    if (restarting) {
      downSince = Date.now();
      toldSlow = false;
      if (!SILENT) {
        toast.dismiss('api-error-5xx');
        toast.loading('Der Grünerator startet gerade neu', {
          id: TOAST_ID,
          description: 'Gleich ist alles wieder da – du musst nichts tun.',
        });
      }
      timer = setTimeout(() => void poll(), POLL_INTERVAL_MS);
      return;
    }
    if (timer) clearTimeout(timer);
    timer = null;
    if (!SILENT) {
      toast.success('Wieder da', {
        id: TOAST_ID,
        description: 'Alles wird neu geladen.',
        duration: 3_000,
      });
    }
    // Die Chatliste lädt ihr eigener Listener neu (`ThreadListReloadListener`).
    void queryClient.invalidateQueries();
  });

  return () => {
    unsubscribe();
    if (timer) clearTimeout(timer);
  };
}
