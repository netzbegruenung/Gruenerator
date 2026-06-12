import { type RichTextDoc } from '@gruenerator/contracts';

export interface SocialLinks {
  facebook?: string;
  twitter?: string;
  instagram?: string;
  youtube?: string;
  linkedin?: string;
  mastodon?: string;
  [key: string]: string | undefined;
}

export interface HeroSection {
  imageUrl: string;
  name: string;
  tagline: string;
  socialLinks: SocialLinks;
}

export interface AboutSection {
  title: string;
  content: RichTextDoc;
}

export interface HeroImageSection {
  imageUrl: string;
  title: string;
  subtitle: string;
}

export interface ThemeCard {
  /** Client-only render key — never persisted. */
  _key?: string;
  imageUrl: string;
  title: string;
  content: RichTextDoc;
}

export interface ThemesSection {
  title: string;
  themes: ThemeCard[];
}

export interface ActionTile {
  /** Client-only render key — never persisted. */
  _key?: string;
  imageUrl: string;
  text: string;
  link: string;
}

export interface ActionsSection {
  actions: ActionTile[];
}

export interface SocialMediaProfile {
  platform: string;
  url: string;
  icon?: string;
}

export interface ContactSection {
  title: string;
  backgroundImageUrl: string;
  email: string;
  phone?: string;
  address?: string;
  socialMedia: SocialMediaProfile[];
}

export interface SocialFeedSection {
  title: string;
  instagramUsername?: string;
  showFeed: boolean;
}

export interface CandidateData {
  id: string;
  slug: string;
  hero: HeroSection;
  about: AboutSection;
  heroImage: HeroImageSection;
  themes: ThemesSection;
  actions: ActionsSection;
  socialFeed?: SocialFeedSection;
  contact: ContactSection;
  meta?: {
    createdAt?: string;
    updatedAt?: string;
    published?: boolean;
  };
}
