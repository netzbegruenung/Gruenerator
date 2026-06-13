/**
 * Public Site Controller - Renders public-facing site HTML pages
 */

import { renderRichTextToHTMLString } from '@gruenerator/contracts/sites-richtext';
import express, { type Response, type Router, type RequestHandler } from 'express';

import {
  THEME_STYLES,
  THEME_STYLES_DARK,
  type SitesRequest,
  type UserSite,
  type ThemeColors,
} from './types.js';

import type { SiteSections } from '@gruenerator/contracts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SitesHandler = RequestHandler<any, any, any, any>;
const router: Router = express.Router();

const SOCIAL_ICONS: Record<string, string> = {
  twitter: '𝕏',
  facebook: 'f',
  instagram: '📷',
  linkedin: 'in',
  github: 'gh',
  website: '🌐',
};

function renderNotFoundPage(): string {
  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Site nicht gefunden</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          display: flex;
          justify-content: center;
          align-items: center;
          height: 100vh;
          margin: 0;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        .container {
          text-align: center;
          padding: 2rem;
        }
        h1 { font-size: 3rem; margin: 0; }
        p { font-size: 1.2rem; opacity: 0.9; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>404</h1>
        <p>Diese Site existiert nicht oder ist nicht veröffentlicht.</p>
      </div>
    </body>
    </html>
  `;
}

function renderSocialLinks(socialLinks: Record<string, string>, _primaryColor: string): string {
  return Object.entries(socialLinks)
    .filter(([, url]) => url)
    .map(([platform, url]) => {
      const icon = SOCIAL_ICONS[platform] || platform;
      return `<a href="${url}" target="_blank" rel="noopener noreferrer" class="social-link">${icon}</a>`;
    })
    .join('');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderSections(sections: SiteSections, contactEmail?: string): string {
  const parts: string[] = [];

  if (sections.about) {
    parts.push(`<section class="content-section">
          ${sections.about.title ? `<h2>${escapeHtml(sections.about.title)}</h2>` : ''}
          ${renderRichTextToHTMLString(sections.about.content)}
        </section>`);
  }

  if (sections.themes?.length) {
    const cards = sections.themes
      .map(
        (theme) => `<article class="theme-card">
            <h3>${escapeHtml(theme.title)}</h3>
            ${renderRichTextToHTMLString(theme.content)}
          </article>`
      )
      .join('');
    parts.push(`<section class="content-section">
          <h2>Meine Themen</h2>
          ${cards}
        </section>`);
  }

  if (contactEmail) {
    parts.push(`<section class="content-section contact-section">
          <h2>Kontakt</h2>
          <p>📧 <a href="mailto:${escapeHtml(contactEmail)}">${escapeHtml(contactEmail)}</a></p>
        </section>`);
  }

  return parts.join('');
}

function renderSitePage(site: UserSite): string {
  const socialLinks = site.social_links || {};
  const sections = site.sections || {};
  const theme = site.theme || 'gruene';
  const accentColor = site.accent_color || '#46962b';

  const baseColors = THEME_STYLES[theme] || THEME_STYLES.gruene;
  const colors: ThemeColors = {
    ...baseColors,
    primary: accentColor,
  };
  const dark = THEME_STYLES_DARK[theme] || THEME_STYLES_DARK.gruene;

  const socialLinksHtml = renderSocialLinks(socialLinks, colors.primary);
  const sectionsHtml = renderSections(sections, site.contact_email);

  return `
    <!DOCTYPE html>
    <html lang="de">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <meta name="color-scheme" content="light dark">
      <title>${site.site_title}</title>
      ${site.meta_description ? `<meta name="description" content="${site.meta_description}">` : ''}
      ${site.meta_keywords?.length ? `<meta name="keywords" content="${site.meta_keywords.join(', ')}">` : ''}
      <meta property="og:title" content="${site.site_title}">
      ${site.meta_description ? `<meta property="og:description" content="${site.meta_description}">` : ''}
      ${site.profile_image ? `<meta property="og:image" content="${site.profile_image}">` : ''}
      <style>
        * {
          margin: 0;
          padding: 0;
          box-sizing: border-box;
        }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
          background: ${colors.background};
          color: ${colors.text};
          line-height: 1.6;
          color-scheme: light dark;
        }
        .hero {
          background: linear-gradient(135deg, ${colors.primary} 0%, ${colors.primary}dd 100%);
          ${site.background_image ? `background-image: linear-gradient(135deg, ${colors.primary}ee 0%, ${colors.primary}cc 100%), url('${site.background_image}');` : ''}
          background-size: cover;
          background-position: center;
          color: white;
          padding: 4rem 2rem;
          text-align: center;
          min-height: 400px;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: center;
        }
        .profile-image {
          width: 150px;
          height: 150px;
          border-radius: 50%;
          object-fit: cover;
          border: 4px solid white;
          margin-bottom: 1.5rem;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        .hero h1 {
          font-size: 2.5rem;
          margin-bottom: 0.5rem;
          text-shadow: 0 2px 4px rgba(0,0,0,0.2);
        }
        .hero p {
          font-size: 1.2rem;
          opacity: 0.95;
          max-width: 600px;
        }
        .container {
          max-width: 900px;
          margin: 0 auto;
          padding: 2rem;
        }
        .content-section {
          background: ${colors.card};
          padding: 2rem;
          margin: 1.5rem 0;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .content-section h2 {
          color: ${colors.primary};
          margin-bottom: 1rem;
        }
        .content-section ul, .content-section ol {
          padding-left: 1.5em;
          margin-bottom: 1rem;
        }
        .theme-card {
          margin-top: 1.5rem;
        }
        .theme-card h3 {
          color: ${colors.primary};
          margin-bottom: 0.5rem;
        }
        .social-links {
          display: flex;
          gap: 1rem;
          justify-content: center;
          margin-top: 1.5rem;
        }
        .social-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          width: 45px;
          height: 45px;
          background: white;
          color: ${colors.primary};
          text-decoration: none;
          border-radius: 50%;
          font-weight: bold;
          transition: transform 0.2s;
          box-shadow: 0 2px 4px rgba(0,0,0,0.15);
        }
        .social-link:hover {
          transform: scale(1.05);
        }
        .contact-section a {
          color: ${colors.primary};
          text-decoration: none;
        }
        .contact-section a:hover {
          text-decoration: underline;
        }
        footer {
          text-align: center;
          padding: 2rem;
          color: #666;
          font-size: 0.9rem;
        }
        @media (max-width: 768px) {
          .hero h1 { font-size: 2rem; }
          .hero p { font-size: 1rem; }
          .container { padding: 1rem; }
          .profile-image { width: 120px; height: 120px; }
        }
        /* Dark mode — follows the visitor's OS preference. Hero gradient
           (brand accent) is left untouched. */
        @media (prefers-color-scheme: dark) {
          body { background: ${dark.background}; color: ${dark.text}; }
          .content-section { background: ${dark.card}; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
          .social-link { background: ${dark.card}; box-shadow: 0 2px 4px rgba(0,0,0,0.4); }
          footer { color: #9a9a9a; }
        }
      </style>
    </head>
    <body>
      <div class="hero">
        ${site.profile_image ? `<img src="${site.profile_image}" alt="${site.site_title}" class="profile-image">` : ''}
        <h1>${site.site_title}</h1>
        ${site.tagline ? `<p>${site.tagline}</p>` : ''}
        ${socialLinksHtml ? `<div class="social-links">${socialLinksHtml}</div>` : ''}
      </div>
      <div class="container">
        ${sectionsHtml}
      </div>
      <footer>
        <p>Erstellt mit Grünerator Sites</p>
      </footer>
    </body>
    </html>
  `;
}

/**
 * GET {*splat} - Render public site page
 * Catches all paths for subdomain-based site rendering
 */
router.get('/{*path}', ((req: SitesRequest, res: Response): void => {
  if (!req.siteData) {
    res.status(404).send(renderNotFoundPage());
    return;
  }

  res.send(renderSitePage(req.siteData));
}) as SitesHandler);

export default router;
