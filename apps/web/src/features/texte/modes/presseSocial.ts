import type { ModeDefinition } from './types';

export const presseSocialMode: ModeDefinition = {
  id: 'presse-social',
  endpoint: '/claude_social',
  instructionType: 'social',
  componentName: 'presse-social',
  defaultMode: 'balanced',
  searchQueryFields: ['inhalt'],
  placeholder: 'Beschreibe dein Thema und alle relevanten Details...',
  useCustomSubmit: true,
  showAgentMode: true,
  useMarkdown: false,
  settings: [
    {
      key: 'platforms',
      label: 'Formate',
      options: [
        { id: 'pressemitteilung', label: 'Pressemitteilung' },
        { id: 'instagram', label: 'Instagram' },
        { id: 'facebook', label: 'Facebook' },
        { id: 'twitter', label: 'X/Bsky/Mastodon' },
        { id: 'linkedin', label: 'LinkedIn' },
        { id: 'actionIdeas', label: 'Aktionsideen' },
        { id: 'reelScript', label: 'Reel-Skript' },
      ],
      multiple: true,
    },
  ],
  extraFields: [
    {
      key: 'zitatgeber',
      type: 'input',
      placeholder: 'Name der*des Zitatgeber*in...',
      condition: (state) => {
        const platforms = state.platforms;
        return Array.isArray(platforms) && platforms.includes('pressemitteilung');
      },
    },
  ],
  defaults: {
    platforms: ['instagram'],
    zitatgeber: '',
  },
};
