const PDF_MAGIC = Buffer.from('%PDF-');
const PDF_MAGIC_WINDOW = 1024;

export function isPdfBuffer(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC_WINDOW).includes(PDF_MAGIC);
}
