import type { AttachmentAddErrorEvent } from '@assistant-ui/core';
import { useAttachmentNoticeStore } from '../stores/attachmentNoticeStore';

const FRIENDLY_ACCEPTED_SUMMARY =
  'PDF, Word, Excel, PowerPoint, Bilder (JPG, PNG, WebP), Text- und Code-Dateien';

function pushNotice(title: string, description: string): void {
  useAttachmentNoticeStore.getState().setNotice({ title, description });
}

export function handleAttachmentError(error: unknown): void {
  const message = error instanceof Error ? error.message : 'Datei konnte nicht hinzugefügt werden.';
  console.warn('[Attachment]', error);
  pushNotice('Anhang nicht möglich', message);
}

// Extracts the rejected MIME type from AUI's English error message
// ("File type X is not accepted. ..."). Returns null for any other shape.
function extractRejectedContentType(message: string): string | null {
  const match = /^File type (.+?) is not accepted/.exec(message);
  return match ? match[1] : null;
}

// Subscribes to assistant-ui's `attachmentAddError` event and surfaces a
// clean German notice inline in the thread (rendered by
// InlineAttachmentNotice) in place of AUI's raw English message. The
// original rejection still bubbles to window.onunhandledrejection so
// GlitchTip keeps capturing rejected file types as telemetry.
export function handleAttachmentAddError(event: AttachmentAddErrorEvent): void {
  console.warn('[Attachment]', event);

  if (event.reason === 'not-accepted') {
    const contentType = extractRejectedContentType(event.message) ?? 'unbekannt';
    pushNotice(
      'Dateityp nicht unterstützt',
      `"${contentType}" kann nicht angehängt werden. Unterstützt: ${FRIENDLY_ACCEPTED_SUMMARY}.`
    );
    return;
  }

  if (event.reason === 'no-adapter') {
    pushNotice('Anhänge deaktiviert', 'In diesem Chat sind keine Anhänge möglich.');
    return;
  }

  pushNotice(
    'Anhang fehlgeschlagen',
    'Die Datei konnte nicht angehängt werden. Bitte erneut versuchen.'
  );
}
