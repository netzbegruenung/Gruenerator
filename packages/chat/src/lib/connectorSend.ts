/**
 * Export in ein gewähltes Ziel eines Konnektors — Teams- oder Slack-Kanal.
 * Zwei Routen: `GET /api/connections/:provider/targets` liefert
 * eine Ebene der Zielwahl, `POST /api/connections/:provider/send` schickt.
 * Teams bekommt die Word-Datei, Slack den Text als Markdown.
 */
import {
  CLOUD_UPLOAD_FIELD,
  connectorSendResponseSchema,
  connectorTargetsResponseSchema,
  driveBrowseErrorSchema,
  type ConnectorSendResponse,
  type ConnectorTarget,
  type ConnectorTargetProvider,
} from '@gruenerator/contracts';

import { CloudExportError } from './cloudExport';
import { notifyError } from './notify';

type FetchFn = (url: string, options?: RequestInit) => Promise<Response>;

export const CONNECTOR_SEND_LABELS: Record<ConnectorTargetProvider, string> = {
  'microsoft-teams': 'In Teams ablegen …',
  slack: 'In Slack posten …',
};

const PROVIDER_NAMES: Record<ConnectorTargetProvider, string> = {
  'microsoft-teams': 'Microsoft Teams',
  slack: 'Slack',
};

const SUCCESS_TITLES: Record<ConnectorTargetProvider, string> = {
  'microsoft-teams': 'In Teams abgelegt',
  slack: 'In Slack gepostet',
};

export function connectorProviderName(provider: ConnectorTargetProvider): string {
  return PROVIDER_NAMES[provider];
}

async function failure(response: Response, json: unknown, fallback: string): Promise<never> {
  const parsed = driveBrowseErrorSchema.safeParse(json);
  throw new CloudExportError(
    parsed.success ? parsed.data.message : `${fallback} (HTTP ${response.status})`,
    parsed.success && parsed.data.reauth
  );
}

export async function fetchConnectorTargets(
  fetchFn: FetchFn,
  provider: ConnectorTargetProvider,
  parent?: string | null
): Promise<ConnectorTarget[]> {
  const qs = parent ? `?parent=${encodeURIComponent(parent)}` : '';
  const response = await fetchFn(`/api/connections/${provider}/targets${qs}`);
  // swallow-ok: a non-JSON body still ends in failure() with the HTTP status
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return connectorTargetsResponseSchema.parse(json).entries;
  return failure(response, json, 'Ziele konnten nicht geladen werden');
}

export interface ConnectorSendInput {
  targetId: string;
  title: string;
  text?: string;
  docx?: { blob: Blob; filename: string };
}

export function buildConnectorSendForm(input: ConnectorSendInput): FormData {
  const form = new FormData();
  form.append('targetId', input.targetId);
  form.append('title', input.title);
  if (input.text !== undefined) form.append('text', input.text);
  if (input.docx) form.append(CLOUD_UPLOAD_FIELD, input.docx.blob, input.docx.filename);
  return form;
}

export async function sendToConnector(
  fetchFn: FetchFn,
  provider: ConnectorTargetProvider,
  input: ConnectorSendInput
): Promise<ConnectorSendResponse> {
  // No Content-Type header: the browser sets the multipart boundary itself.
  const response = await fetchFn(`/api/connections/${provider}/send`, {
    method: 'POST',
    body: buildConnectorSendForm(input),
  });
  // swallow-ok: a non-JSON body still ends in failure() with the HTTP status
  const json: unknown = await response.json().catch(() => null);
  if (response.ok) return connectorSendResponseSchema.parse(json);
  return failure(response, json, 'Senden fehlgeschlagen');
}

/** Erfolg mit Link zum Ziel, Fehler mit dem Satz der Route. */
export function notifyConnectorSendResult(
  provider: ConnectorTargetProvider,
  outcome: { ok: true; result: ConnectorSendResponse } | { ok: false; error: unknown }
): void {
  const where = PROVIDER_NAMES[provider];
  if (!outcome.ok) {
    const { error } = outcome;
    const description =
      error instanceof CloudExportError
        ? error.reauth
          ? `${error.message} Einstellungen → Konnektoren → ${where}.`
          : error.message
        : 'Der Inhalt konnte nicht gesendet werden.';
    notifyError(`Senden an ${where} fehlgeschlagen`, description);
    return;
  }
  const { webUrl, name } = outcome.result;
  void import('sonner')
    .then(({ toast }) => {
      toast.success(SUCCESS_TITLES[provider], {
        description: name,
        action: {
          label: 'Öffnen',
          onClick: () => window.open(webUrl, '_blank', 'noopener,noreferrer'),
        },
      });
    })
    .catch(() => {
      // sonner not installed in this host — nothing else to show.
    });
}
