import { type ReactNode } from 'react';

import { type PublishedSiteSnapshot, type SiteSectionId } from '@gruenerator/contracts';

import { type siteCopy } from '../model/copy.js';
import { type SiteGround } from '../model/grounds.js';
import { type SiteRenderMode } from '../model/visibility.js';

export type SiteCopy = ReturnType<typeof siteCopy>;

export interface SectionContext {
  snapshot: PublishedSiteSnapshot;
  mode: SiteRenderMode;
  copy: SiteCopy;
  visible: readonly SiteSectionId[];
}

export const CONTAINER = 'site:mx-auto site:w-full site:max-w-page site:px-gutter';
export const PROSE = 'site:max-w-prose';
export const PILL_LINK =
  'site:inline-flex site:min-h-11 site:items-center site:rounded-pill site:px-4 site:underline-offset-4 site:hover:underline';

export function AccentBar({ center = false }: { center?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`site:mb-5 site:block site:h-1.5 site:w-16 site:bg-accent ${center ? 'site:mx-auto' : ''}`}
    />
  );
}

export function SectionHeading({
  id,
  children,
  field,
  center = false,
  className = '',
}: {
  id: string;
  children: ReactNode;
  field?: string;
  center?: boolean;
  className?: string;
}) {
  return (
    <>
      <AccentBar center={center} />
      <h2
        id={id}
        data-field={field}
        className={`site:text-h2 site:text-heading site:hyphens-manual site:break-words ${className}`}
      >
        {children}
      </h2>
    </>
  );
}

export function Section({
  section,
  anchor,
  ground,
  className = '',
  children,
}: {
  section: string;
  anchor: string;
  ground: SiteGround;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      data-section={section}
      id={anchor}
      aria-labelledby={`${anchor}-titel`}
      data-ground={ground}
      className={className}
    >
      {children}
    </section>
  );
}
