// Components
export {
  HeroSection,
  AboutSection,
  HeroImageSection,
  ThemesSection,
  ActionsSection,
  SocialFeedSection,
  ContactSection,
  InstagramEmbed,
  EmbedConsentPlaceholder,
  Button,
  buttonVariants,
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselDots,
  useCarousel,
} from './components';

// Types
export type {
  SocialLinks,
  HeroSection as HeroSectionType,
  AboutSection as AboutSectionType,
  HeroImageSection as HeroImageSectionType,
  ThemeCard,
  ThemesSection as ThemesSectionType,
  ActionTile,
  ActionsSection as ActionsSectionType,
  SocialMediaProfile,
  ContactSection as ContactSectionType,
  SocialFeedSection as SocialFeedSectionType,
  CandidateData,
} from './types/candidate';

export type { EmbedPlatform, PlatformConsent, ConsentState, ConsentAction } from './types/consent';

// Utilities
export { cn } from './lib/utils';
export { renderMarkdown, MarkdownContent } from './utils/markdown';
