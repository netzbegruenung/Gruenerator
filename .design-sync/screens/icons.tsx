// Inline SVG icons for the workplace screen templates — dependency-free.
// IconButton sizes child SVGs via the label span's font-size, so use 1em.
import * as React from 'react';

const svg = (paths: React.ReactNode, extra?: React.SVGProps<SVGSVGElement>) => (
  <svg
    viewBox="0 0 24 24"
    width="1em"
    height="1em"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...extra}
  >
    {paths}
  </svg>
);

export const AgentIcon = () =>
  svg(
    <>
      <path d="M3 11h18" />
      <path d="M5 11V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v4" />
      <circle cx="8" cy="16" r="2" />
      <circle cx="16" cy="16" r="2" />
      <path d="M10 16h4" />
    </>
  );
export const ImageAiIcon = () =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="9" r="1.5" />
      <path d="m21 15-4-4-7 7" />
      <path d="M19 2v4M17 4h4" />
    </>
  );
export const ReelIcon = () =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 4v5M16 4v5" />
      <path d="m10 13 4 2-4 2z" fill="currentColor" />
    </>
  );
export const TemplateIcon = () =>
  svg(
    <>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M3 9h18M9 21V9" />
    </>
  );
export const ScanIcon = () =>
  svg(
    <>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </>
  );
export const MicIcon = () =>
  svg(
    <>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  );
export const PlugIcon = () =>
  svg(
    <>
      <path d="M9 2v6M15 2v6M6 8h12v3a6 6 0 0 1-12 0z" />
      <path d="M12 17v5" />
    </>
  );
export const MailIcon = () =>
  svg(
    <>
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 5L2 7" />
    </>
  );
export const LinkIcon = () =>
  svg(
    <>
      <path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1" />
      <path d="M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1" />
    </>
  );
export const CloudIcon = () =>
  svg(<path d="M17 18a4 4 0 0 0 0-8 6 6 0 0 0-11.6 2A3.5 3.5 0 0 0 6 18z" />);
export const HomeIcon = () =>
  svg(
    <>
      <path d="m3 10 9-7 9 7" />
      <path d="M5 9v11h14V9" />
    </>
  );
export const CalendarIcon = () =>
  svg(
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </>
  );
export const SunIcon = () =>
  svg(
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  );
export const NotebookIcon = () =>
  svg(
    <>
      <path d="M4 4a2 2 0 0 1 2-2h12v20H6a2 2 0 0 1-2-2z" />
      <path d="M9 2v20" />
    </>
  );
export const PlusIcon = () => svg(<path d="M12 5v14M5 12h14" />);
export const DotsIcon = () => (
  <svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);
