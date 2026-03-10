/**
 * Download canvas image to device
 * Pure client-side download using browser download API
 */
export function downloadCanvasImage(imageDataUrl: string, canvasType: string = 'canvas'): void {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
  const filename = `gruenerator-${canvasType}-${timestamp}.png`;

  const link = document.createElement('a');
  link.href = imageDataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
