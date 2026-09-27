/**
 * Lets a surface that hides the floating feedback launcher (the mobile canvas
 * editor) offer "Feedback geben" in its own menu. The global feedback widget
 * registers itself as the handler; without one — embedded WebView, logged out,
 * or the launcher switched off in settings — there is nothing to offer.
 */
const handlers = new Set<() => void>();

export function registerFeedbackRequestHandler(handler: () => void): () => void {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
}

export function canRequestFeedback(): boolean {
  return handlers.size > 0;
}

export function requestFeedback(): void {
  handlers.forEach((handler) => handler());
}
