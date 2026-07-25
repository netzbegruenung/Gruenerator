import { themes as prismThemes } from 'prism-react-renderer';
import type { Config } from '@docusaurus/types';
import type * as Preset from '@docusaurus/preset-classic';

// This runs in Node.js - Don't use client-side code here (browser APIs, JSX...)

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
          // experimente: Themen-Monitor (now /experiments/monitor) not published yet.
          exclude: ['intern/**', 'experimente/**'],
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
          { from: '/docs/gruenerieren/social-media-post', to: '/docs/chat/social-media-post' },
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
        ],
        // The dated newsletter and Signal posts moved into archiv/ as a whole —
        // one rule beats twelve hand-written entries.
        createRedirects(existingPath) {
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
        {
          to: '/docs/ueber-den-gruenerator/intro',
          label: 'Über den Grünerator',
          position: 'left',
        },
        {
          type: 'dropdown',
          label: 'Anleitung',
          position: 'left',
          items: [
            { to: '/docs/ueber-den-gruenerator/tools', label: 'Alle Werkzeuge' },
            { to: '/docs/category/chat', label: 'Chat' },
            { to: '/docs/category/office', label: 'Office' },
            { to: '/docs/category/wissen', label: 'Wissen' },
            { to: '/docs/category/grüneratoren', label: 'Grüneratoren' },
            { to: '/docs/category/konto--projekte', label: 'Konto & Projekte' },
            { to: '/docs/category/integrationen', label: 'Integrationen' },
            // { to: '/docs/experimente/intro', label: 'Experimente' }, // hidden — Themen-Monitor not published yet
          ],
        },
        {
          to: '/docs/category/grundlagen',
          label: 'Grundlagen',
          position: 'left',
        },
        {
          to: '/docs/webinare',
          label: 'Webinare',
          position: 'right',
        },
        {
          to: '/docs/category/archiv',
          label: 'Newsletter',
          position: 'right',
        },
      ],
    },
    footer: {
      style: 'light',
      links: [
        {
          title: 'Über den Grünerator',
          items: [
            {
              label: 'Einführung',
              to: '/docs/ueber-den-gruenerator/intro',
            },
            {
              label: 'Pro EU',
              to: '/docs/ueber-den-gruenerator/gruenerator-pro-eu',
            },
            {
              label: 'Deine Daten im Grünerator',
              to: '/docs/ueber-den-gruenerator/notebook',
            },
          ],
        },
        {
          title: 'Wissen',
          items: [
            {
              label: 'Kennzeichnungs-Guide',
              to: '/docs/grundlagen/Kennzeichnungs-Guide',
            },
            {
              label: 'Welches KI-Tool wofür?',
              to: '/docs/grundlagen/welches-ki-tool-wofuer',
            },
            {
              label: 'Wie LLMs funktionieren',
              to: '/docs/grundlagen/wie-llms-funktionieren',
            },
          ],
        },
        {
          title: 'Anleitung',
          items: [
            {
              label: 'KI-Modelle',
              to: '/docs/chat/ki-modelle',
            },
            {
              label: 'Grüne Wolke Tutorial',
              to: '/docs/konto/gruene-wolke',
            },
            {
              label: 'KI-Chat einrichten',
              to: '/docs/integrationen/ki-chat-einrichten',
            },
            {
              label: 'Was kann ich fragen?',
              to: '/docs/integrationen/mcp-was-kann-ich-fragen',
            },
            // {
            //   label: 'Themen-Monitor',
            //   to: '/docs/experimente/intro',
            // }, // hidden — Themen-Monitor not online yet
          ],
        },
        {
          title: 'Newsletter',
          items: [
            {
              label: 'Newsletter-Archiv',
              to: '/docs/category/archiv',
            },
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
