// Components
export {
  HeroSection,
  HeroImagePlaceholder,
  AboutSection,
  HeroImageSection,
  ThemesSection,
  ActionsSection,
  SocialFeedSection,
  ContactSection,
  RichTextContent,
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

// Site renderer
export { SiteBody } from './site/SiteBody.js';
export { SiteLegalBody } from './site/SiteLegalBody.js';
export { InstagramConsent } from './site/InstagramConsent.js';
export { SiteRichText } from './site/SiteRichText.js';
export { siteRootAttributes } from './model/root.js';
export {
  siteFontFaceCss,
  siteFontFiles,
  siteFontPreloads,
  type SiteFontFile,
} from './model/fonts.js';
export { sitePaths, type SiteLinks } from './model/paths.js';
export { reportHref, safeHref } from './model/links.js';
export { SECTION_ANCHORS, visibleSections, type SiteRenderMode } from './model/visibility.js';
export { sizedSrc } from './model/images.js';
export { type SiteDocumentKind } from './model/meta.js';
export { type LegalDocumentKind } from './legal/types.js';
