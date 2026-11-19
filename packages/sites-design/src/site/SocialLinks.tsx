/** @jsxRuntime automatic @jsxImportSource react */
import { type ComponentType } from 'react';
import {
  FaFacebook,
  FaInstagram,
  FaLinkedin,
  FaMastodon,
  FaXTwitter,
  FaYoutube,
} from 'react-icons/fa6';

import { type SitesSocialPlatform, sitesSocialPlatformSchema } from '@gruenerator/contracts';

import { siteCopy } from '../model/copy.js';
import { safeHref } from '../model/links.js';

const ICONS: Record<
  SitesSocialPlatform,
  ComponentType<{ 'aria-hidden'?: boolean; className?: string }>
> = {
  instagram: FaInstagram,
  facebook: FaFacebook,
  twitter: FaXTwitter,
  linkedin: FaLinkedin,
  mastodon: FaMastodon,
  youtube: FaYoutube,
};

export function SocialLinks({
  links,
  copy,
  className = '',
}: {
  links: Readonly<Record<string, string>>;
  copy: ReturnType<typeof siteCopy>;
  className?: string;
}) {
  const entries = sitesSocialPlatformSchema.options.flatMap((platform) => {
    const href = links[platform] ? safeHref(links[platform]) : null;
    return href ? [{ platform, href }] : [];
  });
  if (entries.length === 0) return null;
  return (
    <ul
      aria-label={copy.socialList}
      data-field="social_links"
      className={`site:flex site:flex-wrap site:gap-3 ${className}`}
    >
      {entries.map(({ platform, href }) => {
        const Icon = ICONS[platform];
        return (
          <li key={platform}>
            <a
              href={href}
              aria-label={copy[platform]}
              data-field={`social_links.${platform}`}
              className="site:flex site:size-11 site:items-center site:justify-center site:rounded-pill site:bg-action site:text-action-ink site:motion-safe:transition-transform site:motion-safe:duration-[150ms] site:motion-safe:hover:-translate-y-0.5"
            >
              <Icon aria-hidden className="site:size-5" />
            </a>
          </li>
        );
      })}
    </ul>
  );
}
