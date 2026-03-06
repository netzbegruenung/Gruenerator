export type EmbedPlatform = 'instagram' | 'youtube' | 'twitter';

export interface PlatformConsent {
  granted: boolean;
  remember: boolean;
  timestamp?: string;
}

export interface ConsentState {
  [platform: string]: PlatformConsent;
}

export interface ConsentAction {
  platform: EmbedPlatform;
  granted: boolean;
  remember: boolean;
}
