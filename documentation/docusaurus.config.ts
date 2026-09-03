import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';
import { SECTIONS, EXTRA_LINKS } from './src/nav/sections';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

// Navbar, footer and the startpage grid all come from src/nav/sections.ts —
// edit the structure there, not here.
function section(id: string) {
  const found = SECTIONS.find((s) => s.id === id);
  if (!found) throw new Error(`sections.ts has no section '${id}'`);
  return found;
}

const config: Config = {
  title: 'Grünerator Doku',
  tagline: 'Dokumentation für den Grünerator',
  favicon: 'favicon.ico',

  // Future flags, see https://docusaurus.io/docs/api/docusaurus-config#future
  future: {
    v4: true, // Improve compatibility with the upcoming Docusaurus v4
  },

  // Production URL. Was a dead Coolify placeholder hostname, which put that
  // hostname into every <loc> of sitemap.xml and into the canonical tags.
  url: 'https://doku.gruenerator.eu',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'netzbegruenung', // GitHub org.
  projectName: 'Gruenerator', // Monorepo hosting documentation/.

  onBrokenLinks: 'throw',
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },

  // Algolia site verification
  headTags: [
    {
      tagName: 'meta',
      attributes: {
        name: 'algolia-site-verification',
        content: '37CB511CF150BAAE',
      },
    },
  ],

  // Even if you don't use internationalization, you can use this field to set
  // useful metadata like html lang. For example, if your site is Chinese, you
  // may want to replace "en" with "zh-Hans".
  i18n: {
    defaultLocale: 'en',
    locales: ['en'],
  },

  presets: [
    [
      'classic',
      {
        docs: {
          sidebarPath: './sidebars.ts',
          // Hidden until ready — remove entries to re-enable in the sidebar.
          // intern: dev-only LV-Korpus analysis pages, internal.
          // finetuning + welches-ki-tool-wofuer: temporarily out of the docs —
          // remove the two entries to re-publish them (keep in sync with
          // EXCLUDED_FILES in scripts/generate-docs-index.mjs).
          exclude: ['intern/**', 'basics/finetuning.md', 'basics/welches-ki-tool-wofuer.md'],
          // "Edit this page" points at the docs in the monorepo.
          editUrl: 'https://github.com/netzbegruenung/Gruenerator/tree/master/documentation/',
        },
        blog: false,
        theme: {
          customCss: './src/css/custom.css',
        },
      } satisfies Preset.Options,
    ],
  ],

  themes: [
    [
      require.resolve('@easyops-cn/docusaurus-search-local'),
      {
        hashed: true,
        language: ['en', 'de'],
        searchResultLimits: 5,
        searchResultContextMaxLength: 30,
        searchBarShortcutHint: false,
        explicitSearchResultPath: false,
      },
    ],
  ],

  // Every page that moved in the structure rebuild keeps its old address. The
  // chat has already cited doc URLs to users, and the app deep-links into the
  // docs — without these, those links would 404.
  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          // gruenerieren/* → chat/*
          { from: '/docs/gruenerieren/ki-chat', to: '/docs/chat/ki-chat' },
          { from: '/docs/gruenerieren/was-kann-ich-fragen', to: '/docs/chat/was-kann-ich-fragen' },
          { from: '/docs/gruenerieren/dateien-hinzufuegen', to: '/docs/chat/dateien-hinzufuegen' },
          { from: '/docs/gruenerieren/ki-modelle', to: '/docs/chat/ki-modelle' },
          // social-media-post.mdx was removed; its successor is the guide
          // "Wie schreibe ich einen Social Media Beitrag?". Both spellings keep
          // resolving: /docs/chat/social-media-post was compiled into a shipped
          // mobile binary as SOCIAL_POST_DOC_URL (commit daa4fff59, 07/2026),
          // which no deploy can update, and the .de spelling was cited to users
          // in chat. Retargeting them is safe — only the destination moves.
          {
            from: '/docs/gruenerieren/social-media-post',
            to: '/docs/guides/einsteigerinnen/social-media-beitrag',
          },
          {
            from: '/docs/chat/social-media-post',
            to: '/docs/guides/einsteigerinnen/social-media-beitrag',
          },
          // websuche.md was removed — its topic now lives in "Was kann ich fragen?".
          { from: '/docs/gruenerieren/websuche', to: '/docs/chat/was-kann-ich-fragen' },
          // Structure rebuild 08/2026: office/, wissen/ and grueneratoren/ were
          // merged into features/, the two how-to pages moved into guides/ and
          // the Inhaltsdatenbank into sonstiges/. Same rule as every move
          // before: the old address keeps resolving forever. These URLs sit in
          // the chat's own citations and in the docs index the chat searches,
          // so a dead one is a dead link inside an answer.
          { from: '/docs/office/intro', to: '/docs/features/office' },
          { from: '/docs/office/dokumente', to: '/docs/features/dokumente' },
          { from: '/docs/office/tabellen', to: '/docs/features/tabellen' },
          { from: '/docs/office/praesentationen', to: '/docs/features/praesentationen' },
          { from: '/docs/office/boards', to: '/docs/features/boards' },
          { from: '/docs/office/ki-im-editor', to: '/docs/features/ki-im-editor' },
          { from: '/docs/grueneratoren/agentura', to: '/docs/features/agentura' },
          { from: '/docs/wissen/landesverbaende', to: '/docs/features/landesverbaende' },
          {
            from: '/docs/grueneratoren/eigene-agentinnen-erstellen',
            to: '/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen',
          },
          {
            from: '/docs/wissen/eigenes-notebook-erstellen',
            to: '/docs/guides/einsteigerinnen/eigenes-notebook-erstellen',
          },
          { from: '/docs/wissen/inhaltsdatenbank', to: '/docs/sonstiges/inhaltsdatenbank' },
          // agents/* → grueneratoren/*
          { from: '/docs/agents/agentura', to: '/docs/features/agentura' },
          {
            from: '/docs/agents/eigene-agentinnen-erstellen',
            to: '/docs/guides/fortgeschrittene/eigene-agentinnen-erstellen',
          },
          // notebooks + landesverbaende + inhaltsdatenbank → wissen/*
          {
            from: '/docs/notebooks/eigenes-notebook-erstellen',
            to: '/docs/guides/einsteigerinnen/eigenes-notebook-erstellen',
          },
          { from: '/docs/landesverbaende', to: '/docs/features/landesverbaende' },
          {
            from: '/docs/ueber-den-gruenerator/inhaltsdatenbank',
            to: '/docs/sonstiges/inhaltsdatenbank',
          },
          // projekte + Profil → konto/*
          { from: '/docs/projekte/intro', to: '/docs/konto/projekte' },
          { from: '/docs/Profil/einstellungen', to: '/docs/konto/einstellungen' },
          {
            from: '/docs/Profil/gruene-wolke-tutorial',
            to: '/docs/guides/fortgeschrittene/gruene-wolke-einbinden',
          },
          {
            from: '/docs/konto/gruene-wolke',
            to: '/docs/guides/fortgeschrittene/gruene-wolke-einbinden',
          },
          {
            from: '/docs/konto/landesverband-einrichten',
            to: '/docs/guides/landesverbaende/landesverband-einrichten',
          },
          // Basics: "Über den Grünerator" and "Grundlagen" merged into basics/
          { from: '/docs/ueber-den-gruenerator/intro', to: '/docs/basics/intro' },
          { from: '/docs/ueber-den-gruenerator/tools', to: '/docs/basics/tools' },
          {
            from: '/docs/ueber-den-gruenerator/gruenerator-pro-eu',
            to: '/docs/basics/gruenerator-pro-eu',
          },
          {
            from: '/docs/ueber-den-gruenerator/nachhaltigkeit',
            to: '/docs/basics/nachhaltigkeit',
          },
          { from: '/docs/ueber-den-gruenerator/notebook', to: '/docs/basics/notebook' },
          { from: '/docs/ueber-den-gruenerator/open-source', to: '/docs/basics/open-source' },
          {
            from: '/docs/ueber-den-gruenerator/barrierefreiheit',
            to: '/docs/basics/barrierefreiheit',
          },
          {
            from: '/docs/ueber-den-gruenerator/wie-diese-doku-entsteht',
            to: '/docs/sonstiges/wie-diese-doku-entsteht',
          },
          {
            from: '/docs/grundlagen/wie-llms-funktionieren',
            to: '/docs/basics/wie-llms-funktionieren',
          },
          {
            from: '/docs/grundlagen/risiken-und-gefahren-von-llms',
            to: '/docs/basics/risiken-und-gefahren-von-llms',
          },
          {
            from: '/docs/grundlagen/Kennzeichnungs-Guide',
            to: '/docs/basics/Kennzeichnungs-Guide',
          },
          // llm-basics → basics/*
          //
          // The two pages that merely changed case (/docs/Grundlagen/* →
          // /docs/grundlagen/*) get NO redirect on purpose: macOS' filesystem
          // can't hold both spellings, so the plugin would try to overwrite the
          // real page and every local build would fail. Those two URLs are
          // low-traffic concept pages; a build that only works on Linux costs
          // more than the two dead links.
          //
          // finetuning and welches-ki-tool-wofuer are temporarily out of the
          // docs (see docs.exclude above) — their old addresses land on the
          // Basics intro until the pages come back.
          { from: '/docs/llm-basics/finetuning', to: section('basics').intro },
          { from: '/docs/grundlagen/finetuning', to: section('basics').intro },
          { from: '/docs/grundlagen/welches-ki-tool-wofuer', to: section('basics').intro },
          {
            from: '/docs/llm-basics/risiken-und-gefahren-von-llms',
            to: '/docs/basics/risiken-und-gefahren-von-llms',
          },
          {
            from: '/docs/llm-basics/wie-llms-funktionieren',
            to: '/docs/basics/wie-llms-funktionieren',
          },
          // The top-level /docs/category/… index pages disappeared with the
          // per-area sidebars (a category page only exists while a category
          // node sits in a sidebar). Their slugs came from the old labels —
          // umlauts and all — so they are spelled out here, not computed.
          // newsletter/ and signal-nachrichten/ keep their category pages
          // (still categories inside archivSidebar) and need no rule.
          {
            from: '/docs/category/über-den-grünerator',
            to: section('basics').intro,
          },
          { from: '/docs/category/chat', to: section('chat').intro },
          { from: '/docs/category/office', to: section('features').intro },
          { from: '/docs/category/wissen', to: section('features').intro },
          { from: '/docs/category/grüneratoren', to: section('features').intro },
          { from: '/docs/category/konto--projekte', to: section('konto').intro },
          { from: '/docs/category/integrationen', to: section('integrationen').intro },
          { from: '/docs/category/grundlagen', to: section('basics').intro },
          { from: '/docs/category/archiv', to: EXTRA_LINKS.archiv.to },
        ],
        // The dated newsletter and Signal posts moved into archiv/ as a whole —
        // one rule beats twelve hand-written entries.
        createRedirects(existingPath: string) {
          if (existingPath.startsWith('/docs/archiv/newsletter/')) {
            return [existingPath.replace('/docs/archiv/newsletter/', '/docs/newsletter/')];
          }
          if (existingPath.startsWith('/docs/archiv/signal-nachrichten/')) {
            return [
              existingPath.replace('/docs/archiv/signal-nachrichten/', '/docs/signal-nachrichten/'),
            ];
          }
          return undefined;
        },
      },
    ],
  ],

  themeConfig: {
    // The navbar toggle is replaced by a three-way (hell/dunkel/system)
    // switcher in the footer — see src/theme/Footer/index.tsx. The navbar
    // button itself is emptied via src/theme/Navbar/ColorModeToggle;
    // disableSwitch must stay off, it would wipe the persisted choice on
    // every page load (theme-common calls ColorModeStorage.del() then).
    colorMode: {
      defaultMode: 'light',
      respectPrefersColorScheme: true,
    },
    // Replace with your project's social card
    image: 'img/docusaurus-social-card.jpg',
    // algolia: {
    //   // The application ID provided by Algolia
    //   appId: '5ZTA63GYWV',

    //   // Public API key: it is safe to commit it
    //   apiKey: '***REMOVED***',

    //   indexName: 'Gruenerator Dokumentation',

    //   // Optional: see doc section below
    //   contextualSearch: true,

    //   // Optional: Specify domains where the navigation should occur through window.location instead on history.push. Useful when our Algolia config crawls multiple documentation sites and we want to navigate with window.location.href to them.
    //   // externalUrlRegex: 'external\\.com|domain\\.com',

    //   // Optional: Replace parts of the item URLs from Algolia. Useful when using the same search index for multiple deployments using a different baseUrl. You can use regexp or string in the `from` param. For example: localhost:3000 vs myCompany.com/docs
    //   // replaceSearchResultPathname: {
    //   //   from: '/docs/', // or as RegExp: /\/docs\//
    //   //   to: '/',
    //   // },

    //   // Optional: Algolia search parameters
    //   searchParameters: {},

    //   // Optional: path for search page that enabled by default (`false` to disable it)
    //   searchPagePath: 'search',

    //   // Optional: whether the insights feature is enabled or not on Docsearch (`false` by default)
    //   insights: false,
    // },
    navbar: {
      logo: {
        alt: 'Grünerator Doku Logo',
        src: 'img/GRÜNERATOR_Doku_Logo_Grün.svg',
      },
      items: [
        // The main areas mirror the app; docSidebar items highlight the
        // active area and swap the sidebar to it. `navbarOrder` pulls single
        // entries to the front; the rest keep the order they have in
        // sections.ts, which is also the startpage's.
        ...SECTIONS.filter((s) => s.navbar === 'direct')
          .slice()
          .sort((a, b) => (a.navbarOrder ?? Infinity) - (b.navbarOrder ?? Infinity))
          .map((s) => ({
            type: 'docSidebar' as const,
            sidebarId: s.sidebarId,
            label: s.label,
            position: 'left' as const,
          })),
        {
          type: 'dropdown',
          label: 'Mehr',
          position: 'left',
          items: [
            ...SECTIONS.filter((s) => s.navbar === 'more').map((s) => ({
              type: 'docSidebar' as const,
              sidebarId: s.sidebarId,
              label: s.label,
            })),
            { to: EXTRA_LINKS.webinare.to, label: EXTRA_LINKS.webinare.label },
            { type: 'docSidebar' as const, sidebarId: 'archivSidebar', label: 'Archiv' },
          ],
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Bereiche',
          items: SECTIONS.map((s) => ({ label: s.label, to: s.intro })),
        },
        {
          title: 'Verstehen',
          items: section('basics').topPages,
        },
        {
          title: 'Mehr',
          items: [
            EXTRA_LINKS.webinare,
            { label: 'Newsletter-Archiv', to: EXTRA_LINKS.archiv.to },
            EXTRA_LINKS.bildnachweise,
            {
              label: 'Newsletter abonnieren',
              href: 'https://fax.gruenerator.de',
            },
          ],
        },
        {
          title: 'Links',
          items: [
            {
              label: 'Zum Grünerator',
              href: 'https://gruenerator.eu',
            },
            {
              label: 'GitHub',
              href: 'https://github.com/netzbegruenung/Gruenerator/tree/master/documentation',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} Grünerator Doku. Built with Docusaurus.`,
    },
    prism: {
      theme: prismThemes.github,
      darkTheme: prismThemes.dracula,
    },
  } satisfies Preset.ThemeConfig,
};

export default config;
