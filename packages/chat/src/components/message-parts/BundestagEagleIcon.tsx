/**
 * Stylised spread-wing eagle silhouette for the BundestagCard header. NOT the
 * official Bundesadler (heraldry / usage rights) — a generic parliamentary
 * eagle mark. Inherits `currentColor` so Tailwind text-colour classes drive it,
 * matching the lucide icons used by the other message-part cards.
 */
export function BundestagEagleIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      role="img"
    >
      <path d="M12 3.2c.62 0 1.12.5 1.12 1.12 0 .35-.16.66-.41.86.28.15.6.24.94.24h.02c.5-.02 1.02-.2 1.53-.5a.5.5 0 0 1 .68.66c-.24.5-.55.9-.9 1.2.72.06 1.5.3 2.3.72 1.02.53 1.96 1.02 2.86 1.02a.5.5 0 0 1 .28.92c-.9.6-1.86.9-2.8.94.62.5 1.16 1.16 1.6 1.98a.5.5 0 0 1-.6.71c-1.06-.4-1.98-.5-2.78-.36.5.56.9 1.26 1.18 2.1a.5.5 0 0 1-.66.62c-.86-.36-1.6-.46-2.24-.36.16.86.16 1.84 0 2.94l-.28 1.9a.4.4 0 0 1-.79 0l-.28-1.9c-.16-1.1-.16-2.08 0-2.94-.64-.1-1.38 0-2.24.36a.5.5 0 0 1-.66-.62c.28-.84.68-1.54 1.18-2.1-.8-.14-1.72-.04-2.78.36a.5.5 0 0 1-.6-.71c.44-.82.98-1.48 1.6-1.98-.94-.04-1.9-.34-2.8-.94a.5.5 0 0 1 .28-.92c.9 0 1.84-.49 2.86-1.02.8-.42 1.58-.66 2.3-.72-.35-.3-.66-.7-.9-1.2a.5.5 0 0 1 .68-.66c.51.3 1.03.48 1.53.5h.02c.34 0 .66-.09.94-.24a1.11 1.11 0 0 1-.41-.86c0-.62.5-1.12 1.12-1.12Z" />
    </svg>
  );
}
