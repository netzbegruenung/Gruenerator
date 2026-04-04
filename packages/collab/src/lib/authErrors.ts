export function getAuthErrorMessage(authError: string): string | null {
  if (authError.includes('deleted')) return 'Dieses Dokument wurde gelöscht.';
  if (authError.includes('denied')) return 'Du hast keinen Zugriff mehr auf dieses Dokument.';
  return null;
}
