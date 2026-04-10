export function getAuthErrorMessage(authError: string): string | null {
  if (authError.includes('deleted')) return 'Dieses Dokument wurde gelöscht.';
  if (authError.includes('denied')) return 'Du hast keinen Zugriff mehr auf dieses Dokument.';
  if (authError.includes('not publicly accessible'))
    return 'Dieses Dokument ist nicht öffentlich zugänglich.';
  console.warn('[Collab] Unhandled auth error reason:', authError);
  return null;
}
