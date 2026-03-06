export interface HeroBlockAttributes {
  heroImageId: number;
  heroImageUrl: string;
  heroHeading: string;
  heroText: string;
  socialLinks: {
    facebook: string;
    twitter: string;
    youtube: string;
  };
}

export interface AboutBlockAttributes {
  title: string;
  content: string;
}

export interface HeroImageItem {
  imageId: number;
  imageUrl: string;
  text: string;
  link: string;
}

export interface HeroImageBlockAttributes {
  backgroundImageId: number;
  backgroundImageUrl: string;
  title: string;
  subtitle: string;
  items: HeroImageItem[];
}

export interface MeineThemenTheme {
  imageId: number;
  imageUrl: string;
  title: string;
  content: string;
  link: string;
  buttonText: string;
}

export interface MeineThemenBlockAttributes {
  title: string;
  themes: MeineThemenTheme[];
}

export interface LinkTileBlockAttributes {
  title: string;
  backgroundImageId: number;
  backgroundImageUrl: string;
  linkUrl: string;
  ariaLabel: string;
}

export interface ImageGridItem {
  imageId: number;
  imageUrl: string;
  text: string;
  link: string;
}

export interface ImageGridBlockAttributes {
  sectionTitle: string;
  items: ImageGridItem[];
}

export interface SocialMediaEntry {
  platform: string;
  url: string;
}

export interface ContactFormBlockAttributes {
  backgroundImageId: number;
  backgroundImageUrl: string;
  title: string;
  email: string;
  socialMedia: SocialMediaEntry[];
  sunflowerFormAttributes: Record<string, unknown>;
}

/** WordPress media object returned by MediaUpload onSelect callback */
export interface WPMedia {
  id: number;
  url: string;
  alt: string;
  title: string;
  caption: string;
  mime: string;
  type: string;
  width: number;
  height: number;
  sizes: Record<
    string,
    {
      url: string;
      width: number;
      height: number;
    }
  >;
}
