import { type SharepicSpec } from '@gruenerator/contracts';

/**
 * The shape of the composer's design variations (`sharepicTweaks` in
 * canvas-editor), restated here: this package does not bundle the composer,
 * web passes the functions in through `ChatConfig.sharepicDesign`.
 */
export interface SharepicDesignOption {
  value: string;
  label: string;
  disabled: boolean;
  swatch?: string[];
}

export interface SharepicDesignTweak {
  id: string;
  label: string;
  value: string | null;
  options: SharepicDesignOption[];
}

export type SharepicDesignChoice = Partial<Record<string, string>>;

export interface SharepicDesign {
  tweaks: (base: SharepicSpec, choice: SharepicDesignChoice) => SharepicDesignTweak[];
  apply: (base: SharepicSpec, choice: SharepicDesignChoice) => SharepicSpec;
}
