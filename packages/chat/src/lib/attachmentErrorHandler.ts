import type { AttachmentAddErrorEvent } from '@assistant-ui/core';
import { useAttachmentNoticeStore } from '../stores/attachmentNoticeStore';

const FRIENDLY_ACCEPTED_SUMMARY =
  'PDF, Word, Excel, PowerPoint, Bilder (JPG, PNG, WebP), Text- und Code-Dateien';

function pushNotice(title: string, description: string): void {
  useAttachmentNoticeStore.getState().setNotice({ title, description });
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

  // 'adapter-error': our adapter's validateFile()/fileToBase64() threw. Those
  // throw user-ready German messages (e.g. "Datei zu groß: x.pdf (26.0MB).
  // Maximum: 25.0MB"), so surface event.message directly instead of a generic
  // "try again" that hides the actual cause.
  if (event.reason === 'adapter-error') {
    pushNotice('Anhang nicht möglich', event.message);
    return;
  }

  pushNotice(
    'Anhang fehlgeschlagen',
    'Die Datei konnte nicht angehängt werden. Bitte erneut versuchen.'
  );
}
