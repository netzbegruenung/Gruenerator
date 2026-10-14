/**
 * Vision check after an applied AI edit: capture the page once the canvas has
 * painted, ask the API whether anything visibly broke, and turn the findings
 * into one status line. Non-blocking and fail-soft — no image, an offline API
 * or a newer edit all end in "no hint".
 */
import type { CanvasAiCheckResponse } from '@gruenerator/contracts';

export interface CheckEditedCanvasArgs {
  capture: () => Promise<string | null>;
  check: (image: string, instruction: string) => Promise<CanvasAiCheckResponse>;
  /** Resolves once the canvas has painted the applied ops. */
  waitForFrame: () => Promise<void>;
  /** True once a newer edit has arrived; the result is then dropped. */
  isStale: () => boolean;
  instruction: string;
}

export function formatCheckHint(issues: CanvasAiCheckResponse['issues']): string | null {
  if (issues.length === 0) return null;
  return `Hinweis: ${issues.map((i) => i.text).join(' ')}`;
}

export function nextPaint(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
  );
}

export async function checkEditedCanvas(args: CheckEditedCanvasArgs): Promise<string | null> {
  try {
    await args.waitForFrame();
    if (args.isStale()) return null;
    const image = await args.capture();
    if (!image || args.isStale()) return null;
    const result = await args.check(image, args.instruction);
    if (args.isStale()) return null;
    return formatCheckHint(result.issues);
  } catch {
    return null;
  }
}
