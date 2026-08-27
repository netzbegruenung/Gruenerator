import { Button } from '@gruenerator/ui';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { authClient } from '../../../lib/authClient';

// OAuth consent for the MCP authorization server: authorize redirects here
// with consent_code/client_id/scope; the consent POST answers with the client
// redirect URI.

const SCOPE_LABELS: Record<string, string> = {
  search: 'Programme, Beschlüsse und Umfragen durchsuchen',
  'content:read': 'Eigene Inhalte lesen (Dokumente, Boards, Notebooks, Chats-Metadaten)',
  'content:write': 'Eigene Inhalte erstellen, bearbeiten und löschen',
  'groups:read': 'Eigene Gruppen sehen',
  'groups:write': 'Gruppen erstellen und beitreten',
  'media:read': 'Eigene Medien (Reels, Sharepics) sehen',
  'media:write': 'Eigene Medien löschen',
  'chat:completions': 'Sprachmodell für eigene Anwendungen nutzen',
};

const BASE_SCOPES = new Set(['openid', 'profile', 'email', 'offline_access']);

const OAuthConsentPage = () => {
  const [params] = useSearchParams();
  const [submitting, setSubmitting] = useState<'accept' | 'deny' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const consentCode = params.get('consent_code');
  const clientId = params.get('client_id');
  const scopes = useMemo(() => (params.get('scope') ?? '').split(' ').filter(Boolean), [params]);

  const scopeItems = scopes.filter((s) => !BASE_SCOPES.has(s)).map((s) => SCOPE_LABELS[s] ?? s);
  const hasBaseScopes = scopes.some((s) => BASE_SCOPES.has(s));

  const submit = async (accept: boolean) => {
    setSubmitting(accept ? 'accept' : 'deny');
    setError(null);
    try {
      const { data, error: apiError } = await authClient.$fetch<{ redirectURI: string }>(
        '/oauth2/consent',
        {
          method: 'POST',
          body: { accept, ...(consentCode ? { consent_code: consentCode } : {}) },
        }
      );
      if (apiError || !data?.redirectURI) {
        setError('Die Anfrage ist abgelaufen. Bitte starte die Verbindung in der App neu.');
        setSubmitting(null);
        return;
      }
      window.location.href = data.redirectURI;
    } catch {
      setError('Die Anfrage ist abgelaufen. Bitte starte die Verbindung in der App neu.');
      setSubmitting(null);
    }
  };

  if (!consentCode) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background p-4">
        <div className="w-full max-w-md rounded-2xl border border-grey-200 bg-background-pure p-8 text-center shadow-sm dark:border-grey-700">
          <h1 className="text-lg font-semibold text-foreground-heading">
            Keine Verbindungsanfrage
          </h1>
          <p className="mt-2 text-sm text-grey-600 dark:text-grey-400">
            Diese Seite wird von einer App geöffnet, die sich mit deinem Grünerator-Konto verbinden
            möchte. Starte die Verbindung dort erneut.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background p-4">
      <div className="w-full max-w-md rounded-2xl border border-grey-200 bg-background-pure p-8 shadow-sm dark:border-grey-700">
        <h1 className="text-lg font-semibold text-foreground-heading">Zugriff erlauben?</h1>
        <p className="mt-2 text-sm text-grey-600 dark:text-grey-400">
          Eine Anwendung{clientId ? ` (${clientId})` : ''} möchte sich mit deinem Grünerator-Konto
          verbinden und Folgendes dürfen:
        </p>

        <ul className="mt-4 space-y-2">
          {hasBaseScopes && (
            <li className="flex items-start gap-2 text-sm text-foreground">
              <span aria-hidden className="mt-0.5 text-primary-600">
                ✓
              </span>
              Grundlegende Kontoinformationen (Name, E-Mail)
            </li>
          )}
          {scopeItems.map((label) => (
            <li key={label} className="flex items-start gap-2 text-sm text-foreground">
              <span aria-hidden className="mt-0.5 text-primary-600">
                ✓
              </span>
              {label}
            </li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-error">{error}</p>}

        <div className="mt-6 flex gap-3">
          <Button
            type="button"
            variant="brand-outline"
            className="flex-1"
            onClick={() => void submit(false)}
            disabled={submitting !== null}
          >
            {submitting === 'deny' ? 'Ablehnen…' : 'Ablehnen'}
          </Button>
          <Button
            type="button"
            variant="brand"
            className="flex-1"
            onClick={() => void submit(true)}
            disabled={submitting !== null}
          >
            {submitting === 'accept' ? 'Verbinde…' : 'Zustimmen'}
          </Button>
        </div>

        <p className="mt-4 text-xs text-grey-600 dark:text-grey-400">
          Du kannst den Zugriff jederzeit beenden, indem du die Verbindung in der App trennst.
        </p>
      </div>
    </div>
  );
};

export default OAuthConsentPage;
