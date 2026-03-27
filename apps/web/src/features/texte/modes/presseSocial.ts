import { Newspaper, Lightbulb, Video } from 'lucide-react';
import { createElement } from 'react';
import { PiInstagramLogo, PiFacebookLogo, PiXLogo, PiLinkedinLogo } from 'react-icons/pi';

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
        { id: 'pressemitteilung', label: 'Pressemitteilung', icon: createElement(Newspaper) },
        { id: 'instagram', label: 'Instagram', icon: createElement(PiInstagramLogo) },
        { id: 'facebook', label: 'Facebook', icon: createElement(PiFacebookLogo) },
        { id: 'twitter', label: 'X/Bsky/Mastodon', icon: createElement(PiXLogo) },
        { id: 'linkedin', label: 'LinkedIn', icon: createElement(PiLinkedinLogo) },
        { id: 'actionIdeas', label: 'Aktionsideen', icon: createElement(Lightbulb) },
        { id: 'reelScript', label: 'Reel-Skript', icon: createElement(Video) },
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
