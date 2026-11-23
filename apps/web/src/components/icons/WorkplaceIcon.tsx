import type { SVGProps } from 'react';

/**
 * Workplace: three panels of a dashboard and, in the fourth corner, the cog of
 * the Projekte icon (Lucide `folder-cog`). Same grid as Lucide: 24 × 24,
 * stroke 2, round caps. Drawn by hand because Lucide has no dashboard-cog, and
 * kept out of react-icons so it costs nothing on the boot path.
 */
const WorkplaceIcon = (props: SVGProps<SVGSVGElement>) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    width="1em"
    height="1em"
    {...props}
  >
    <rect x="3" y="3" width="7" height="9" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="16" width="7" height="5" rx="1" />
    <circle cx="18" cy="18" r="3" />
    <path d="m21.7 19.4-.9-.3" />
    <path d="m15.2 16.9-.9-.3" />
    <path d="m16.6 21.7.3-.9" />
    <path d="m19.1 15.2.3-.9" />
    <path d="m19.6 21.7-.4-1" />
    <path d="m16.8 15.3-.4-1" />
    <path d="m14.3 19.6 1-.4" />
    <path d="m20.7 16.8 1-.4" />
  </svg>
);

export default WorkplaceIcon;
