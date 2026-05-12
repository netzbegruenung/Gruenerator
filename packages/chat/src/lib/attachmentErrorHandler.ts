export function handleAttachmentError(error: unknown): void {
  const message =
    error instanceof Error ? error.message : 'Datei konnte nicht hinzugefügt werden.';
  console.warn('[Attachment]', error);
  void import('sonner')
    .then(({ toast }) => {
      toast.error('Anhang nicht möglich', { description: message });
    })
    .catch(() => {
      // sonner not installed in host app — fall back to console only
    });
}
