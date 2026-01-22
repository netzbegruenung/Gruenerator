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

  // Set the production url of your site here
  url: 'https://xgwok08o0ccgo4g4cgcoksc8.services.moritz-waechter.de',
  // Set the /<baseUrl>/ pathname under which your site is served
  // For GitHub pages deployment, it is often '/<projectName>/'
  baseUrl: '/',

  // GitHub pages deployment config.
  // If you aren't using GitHub pages, you don't need these.
  organizationName: 'facebook', // Usually your GitHub org/user name.
  projectName: 'docusaurus', // Usually your repo name.

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
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
        },
        blog: {
          showReadingTime: true,
          feedOptions: {
            type: ['rss', 'atom'],
            xslt: true,
          },
          // Please change this to your repo.
          // Remove this to remove the "edit this page" links.
          editUrl:
            'https://github.com/facebook/docusaurus/tree/main/packages/create-docusaurus/templates/shared/',
          // Useful options to enforce blogging best practices
          onInlineTags: 'warn',
          onInlineAuthors: 'warn',
          onUntruncatedBlogPosts: 'warn',
        },
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
          to: '/docs/Grundlagen/Kennzeichnungs-Guide',
          label: 'Grundlagen',
          position: 'left',
        },
        {
          to: '/docs/Profil/gruene-wolke-tutorial',
          label: 'Profil',
          position: 'left',
        },
        {
          to: '/docs/gruenerieren/pro-modus',
          label: 'Grünerieren',
          position: 'left',
        },
        {
          to: '/docs/llm-basics/wie-llms-funktionieren',
          label: 'LLM Basics',
          position: 'left',
        },
      ],
    },
    footer: {
      style: 'dark',
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
              label: 'Support & Mitgliedschaft',
              to: '/docs/ueber-den-gruenerator/support-mitgliedschaft',
            },
          ],
        },
        {
          title: 'Grundlagen',
          items: [
            {
              label: 'Kennzeichnungs-Guide',
              to: '/docs/Grundlagen/Kennzeichnungs-Guide',
            },
            {
              label: 'Welches KI-Tool wofür?',
              to: '/docs/Grundlagen/welches-ki-tool-wofuer',
            },
          ],
        },
        {
          title: 'Profil & Grünerieren',
          items: [
            {
              label: 'Grüne Wolke Tutorial',
              to: '/docs/Profil/gruene-wolke-tutorial',
            },
            {
              label: 'Pro-Modus',
              to: '/docs/gruenerieren/pro-modus',
            },
            {
              label: 'Privacy-Mode',
              to: '/docs/gruenerieren/privacy-mode',
            },
          ],
        },
        {
          title: 'LLM Basics',
          items: [
            {
              label: 'Wie LLMs funktionieren',
              to: '/docs/llm-basics/wie-llms-funktionieren',
            },
            {
              label: 'Risiken & Gefahren',
              to: '/docs/llm-basics/risiken-und-gefahren-von-llms',
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
              href: 'https://github.com/Movm/Gruenerator-Dokumentation',
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
