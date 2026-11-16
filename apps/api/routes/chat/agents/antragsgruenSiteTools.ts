/**
 * `antragsgruen_seite_anlegen`: eine eigene Antragsgrün-Seite auf
 * antragsgruen.de für die Person anlegen (Parteitag, KMV, Mitgliederversammlung).
 *
 * Das Werkzeug prüft nur die Adresse und zeigt eine Karte; angelegt wird erst
 * nach dem Klick (`confirmController` → `services/antragsgruen/hosting/`).
 * Eingeladen wird die Person selbst, mit der Adresse ihres Kontos — das
 * Werkzeug nimmt keine E-Mail-Adresse entgegen.
 */
import { tool, type Tool } from 'ai';
import { z } from 'zod';

import {
  SUBDOMAIN_RE,
  hostingConfigFromEnv,
  isSubdomainAvailable,
} from '../../../services/antragsgruen/hosting/createSite.js';
import { FormClient } from '../../../services/antragsgruen/hosting/formClient.js';
import {
  MAX_SITES_PER_USER,
  inviteeOf,
  sitesOrderedBy,
} from '../../../services/antragsgruen/hosting/sites.js';
import { createLogger } from '../../../utils/logger.js';
import { emitToolConfirmAction, newActionId } from '../services/confirmActionService.js';

import {
  NO_SESSION,
  groundNote,
  refuseForbiddenAction,
  requireUserId,
  type PersonalToolCtx,
} from './personalDataTools.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('antragsgruenSiteTools');

export const ANTRAGSGRUEN_SITE_TOOL = 'antragsgruen_seite_anlegen';

export interface SiteToolDeps {
  /** Host, unter dem die Seiten liegen (`antragsgruen.de`; lokal die Testinstanz). */
  host: string;
  isAvailable: (subdomain: string) => Promise<boolean>;
  sitesOrderedBy: (userId: string) => Promise<number>;
  hasInviteeEmail: (userId: string) => Promise<boolean>;
}

/** Ohne Zugangsdaten des Grünerator-Kontos wird das Werkzeug nicht montiert. */
export function siteCreationConfigured(): boolean {
  return hostingConfigFromEnv() !== null;
}

function defaultDeps(): SiteToolDeps {
  const config = hostingConfigFromEnv();
  return {
    host: config ? new URL(config.baseUrl).host : 'antragsgruen.de',
    isAvailable: (subdomain) =>
      config ? isSubdomainAvailable(new FormClient(), config, subdomain) : Promise.resolve(false),
    sitesOrderedBy,
    hasInviteeEmail: async (userId) => (await inviteeOf(userId)) !== null,
  };
}

export function makeAntragsgruenSiteTool(
  ctx: PersonalToolCtx,
  deps: SiteToolDeps = defaultDeps()
): Tool {
  const { state, sse, threadId, sourceRegistry } = ctx;
  return tool({
    description: `Legt eine eigene Antragsgrün-Seite auf antragsgruen.de an — für einen Parteitag, eine Kreismitgliederversammlung oder eine andere Versammlung, auf der Anträge und Änderungsanträge gestellt werden. Die Person wird mit der E-Mail-Adresse ihres Grünerator-Kontos als Seiten-Admin eingetragen; Antragsgrün schickt ihr die Zugangsdaten.

NUTZE NUR, wenn die Person ausdrücklich eine Antragsgrün-Seite (bzw. ein „Antragsgrün" oder Antragstool) für ihre Versammlung angelegt haben will. NICHT für Fragen zu bestehenden Anträgen (dafür 'antragsgruen').

Frage vorher nach, was fehlt: Titel der Versammlung, Name der Gliederung (z. B. „GRÜNE KV Köln") und die gewünschte Adresse. Die Adresse (subdomain) ist klein geschrieben, 3–40 Zeichen, nur a–z, 0–9 und Bindestrich, z. B. „kv-koeln-kmv27" — Umlaute umschreiben. Das Werkzeug zeigt eine Karte zur Bestätigung; kündige nichts als angelegt an, solange die Person nicht bestätigt hat.

Ablauf, Fehlerfälle und die nächsten Schritte danach: Rezept „antragsgruen-seite" (über rezept_laden).`,
    inputSchema: z.object({
      title: z.string().min(3).max(120).describe('Titel der Versammlung, z. B. „KMV Köln 2027"'),
      organization: z.string().min(2).max(120).describe('Gliederung, z. B. „GRÜNE KV Köln"'),
      subdomain: z.string().describe('Adresse: <subdomain>.antragsgruen.de'),
    }),
    execute: async (args) => {
      const userId = requireUserId(state);
      if (!userId) return { error: NO_SESSION };
      const forbidden = refuseForbiddenAction(state);
      if (forbidden) return forbidden;
      if (!threadId) return { error: 'Anlegen ist in diesem Kontext nicht möglich.' };

      const subdomain = args.subdomain.trim().toLowerCase();
      if (!SUBDOMAIN_RE.test(subdomain)) {
        return {
          error: `„${args.subdomain}" geht nicht als Adresse: 3–40 Zeichen, nur a–z, 0–9 und Bindestrich, vorne kein Bindestrich.`,
        };
      }
      if ((await deps.sitesOrderedBy(userId)) >= MAX_SITES_PER_USER) {
        return {
          error: `Die Person hat schon ${MAX_SITES_PER_USER} Antragsgrün-Seiten über den Grünerator angelegt; mehr gehen nicht.`,
        };
      }
      if (!(await deps.hasInviteeEmail(userId))) {
        return {
          error:
            'Das Konto der Person hat keine gültige E-Mail-Adresse, an die Antragsgrün einladen könnte.',
        };
      }
      let available: boolean;
      try {
        available = await deps.isAvailable(subdomain);
      } catch (err) {
        log.warn(`check-subdomain failed: ${err instanceof Error ? err.message : String(err)}`);
        return {
          error: 'antragsgruen.de ist gerade nicht erreichbar. Später noch einmal versuchen.',
        };
      }
      if (!available) {
        return {
          error: `Die Adresse „${subdomain}.${deps.host}" ist schon vergeben. Schlage eine andere vor.`,
        };
      }

      const payload = {
        title: args.title.trim(),
        organization: args.organization.trim(),
        subdomain,
      };
      const pending: PendingAction = {
        actionId: newActionId(),
        threadId,
        userId,
        title: 'Antragsgrün-Seite anlegen',
        preview: `„${payload.title}" unter ${subdomain}.${deps.host} anlegen`,
        createdAt: Date.now(),
        type: 'create_antragsgruen_site',
        payload,
      };
      await emitToolConfirmAction(sse, pending, [
        { key: 'Titel', value: payload.title },
        { key: 'Gliederung', value: payload.organization },
        { key: 'Adresse', value: `${subdomain}.${deps.host}` },
      ]);
      const note = `Bestätigung zum Anlegen der Antragsgrün-Seite „${payload.title}" (${subdomain}.${deps.host}) angefordert. Erst nach dem Klick auf „Anlegen" entsteht die Seite.`;
      groundNote(sourceRegistry, 'Antragsgrün-Seite anlegen', note);
      return { ok: true, note };
    },
  });
}
