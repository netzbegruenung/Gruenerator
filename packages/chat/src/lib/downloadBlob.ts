/**
 * Trigger a browser download for in-memory bytes (base64 or Blob) — the same
 * objectURL + synthetic <a download> pattern as apps/web's downloadFile util,
 * local to packages/chat so message components stay app-independent.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function base64ToBlob(base64: string, mimeType: string): Blob {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

export function downloadBase64(base64: string, filename: string, mimeType: string): void {
  downloadBlob(base64ToBlob(base64, mimeType), filename);
}
