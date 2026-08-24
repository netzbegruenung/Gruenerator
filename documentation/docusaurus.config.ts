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
          exclude: ['intern/**'],
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
          // social-media-post.mdx was removed — its topic now lives in
          // "Was kann ich fragen?". Both spellings keep resolving: the URL was
          // cited to users in chat and is compiled into shipped mobile
          // binaries (SOCIAL_POST_DOC_URL), which no deploy can update.
          {
            from: '/docs/gruenerieren/social-media-post',
            to: '/docs/chat/was-kann-ich-fragen',
          },
          { from: '/docs/chat/social-media-post', to: '/docs/chat/was-kann-ich-fragen' },
          // websuche.md was removed — its topic now lives in "Was kann ich fragen?".
          { from: '/docs/gruenerieren/websuche', to: '/docs/chat/was-kann-ich-fragen' },
          // agents/* → grueneratoren/*
          { from: '/docs/agents/agentura', to: '/docs/grueneratoren/agentura' },
          {
            from: '/docs/agents/eigene-agentinnen-erstellen',
            to: '/docs/grueneratoren/eigene-agentinnen-erstellen',
          },
          // notebooks + landesverbaende + inhaltsdatenbank → wissen/*
          {
            from: '/docs/notebooks/eigenes-notebook-erstellen',
            to: '/docs/wissen/eigenes-notebook-erstellen',
          },
          { from: '/docs/landesverbaende', to: '/docs/wissen/landesverbaende' },
          {
            from: '/docs/ueber-den-gruenerator/inhaltsdatenbank',
            to: '/docs/wissen/inhaltsdatenbank',
          },
          // projekte + Profil → konto/*
          { from: '/docs/projekte/intro', to: '/docs/konto/projekte' },
          { from: '/docs/Profil/einstellungen', to: '/docs/konto/einstellungen' },
          { from: '/docs/Profil/gruene-wolke-tutorial', to: '/docs/konto/gruene-wolke' },
          // llm-basics → grundlagen/*
          //
          // The two pages that merely changed case (/docs/Grundlagen/* →
          // /docs/grundlagen/*) get NO redirect on purpose: macOS' filesystem
          // can't hold both spellings, so the plugin would try to overwrite the
          // real page and every local build would fail. Those two URLs are
          // low-traffic concept pages; a build that only works on Linux costs
          // more than the two dead links.
          { from: '/docs/llm-basics/finetuning', to: '/docs/grundlagen/finetuning' },
          {
            from: '/docs/llm-basics/risiken-und-gefahren-von-llms',
            to: '/docs/grundlagen/risiken-und-gefahren-von-llms',
          },
          {
            from: '/docs/llm-basics/wie-llms-funktionieren',
            to: '/docs/grundlagen/wie-llms-funktionieren',
          },
          // The top-level /docs/category/… index pages disappeared with the
          // per-area sidebars (a category page only exists while a category
          // node sits in a sidebar). Their slugs came from the old labels —
          // umlauts and all — so they are spelled out here, not computed.
          // newsletter/ and signal-nachrichten/ keep their category pages
          // (still categories inside archivSidebar) and need no rule.
          {
            from: '/docs/category/über-den-grünerator',
            to: section('ueber-den-gruenerator').intro,
          },
          { from: '/docs/category/chat', to: section('chat').intro },
          { from: '/docs/category/office', to: section('office').intro },
          { from: '/docs/category/wissen', to: section('wissen').intro },
          { from: '/docs/category/grüneratoren', to: section('grueneratoren').intro },
          { from: '/docs/category/konto--projekte', to: section('konto').intro },
          { from: '/docs/category/integrationen', to: section('integrationen').intro },
          { from: '/docs/category/grundlagen', to: section('grundlagen').intro },
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
          items: [...section('grundlagen').topPages, ...section('ueber-den-gruenerator').topPages],
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
