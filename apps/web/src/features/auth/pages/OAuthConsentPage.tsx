import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { authClient } from '../../../lib/authClient';

// OAuth consent for the MCP authorization server: authorize redirects here
// with consent_code/client_id/scope; the consent POST answers with the client
// redirect URI.

const SCOPE_LABELS: Record<string, string> = {
  search: 'Programme, Beschlüsse und Umfragen durchsuchen',
  'content:read': 'Eigene Inhalte lesen (Dokumente, Boards, Notizbücher, Chats-Metadaten)',
  'content:write': 'Eigene Inhalte erstellen, bearbeiten und löschen',
  'groups:read': 'Eigene Gruppen sehen',
  'groups:write': 'Gruppen erstellen und beitreten',
  'media:read': 'Eigene Medien (Reels, Sharepics) sehen',
  'media:write': 'Eigene Medien löschen',
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
      <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
        <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
          <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
            Keine Verbindungsanfrage
          </h1>
          <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
            Diese Seite wird von einer App geöffnet, die sich mit deinem Grünerator-Konto verbinden
            möchte. Starte die Verbindung dort erneut.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-50 p-4 dark:bg-neutral-950">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <h1 className="text-lg font-semibold text-neutral-900 dark:text-neutral-100">
          Zugriff erlauben?
        </h1>
        <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
          Eine Anwendung{clientId ? ` (${clientId})` : ''} möchte sich mit deinem Grünerator-Konto
          verbinden und Folgendes dürfen:
        </p>

        <ul className="mt-4 space-y-2">
          {hasBaseScopes && (
            <li className="flex items-start gap-2 text-sm text-neutral-800 dark:text-neutral-200">
              <span aria-hidden className="mt-0.5 text-green-600">
                ✓
              </span>
              Grundlegende Kontoinformationen (Name, E-Mail)
            </li>
          )}
          {scopeItems.map((label) => (
            <li
              key={label}
              className="flex items-start gap-2 text-sm text-neutral-800 dark:text-neutral-200"
            >
              <span aria-hidden className="mt-0.5 text-green-600">
                ✓
              </span>
              {label}
            </li>
          ))}
        </ul>

        {error && <p className="mt-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => void submit(false)}
            disabled={submitting !== null}
            className="flex-1 rounded-lg border border-neutral-300 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {submitting === 'deny' ? 'Ablehnen…' : 'Ablehnen'}
          </button>
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={submitting !== null}
            className="flex-1 rounded-lg bg-green-700 px-4 py-2.5 text-sm font-medium text-white hover:bg-green-800 disabled:opacity-50"
          >
            {submitting === 'accept' ? 'Verbinde…' : 'Zustimmen'}
          </button>
        </div>

        <p className="mt-4 text-xs text-neutral-500 dark:text-neutral-500">
          Du kannst den Zugriff jederzeit beenden, indem du die Verbindung in der App trennst.
        </p>
      </div>
    </div>
  );
};

export default OAuthConsentPage;
