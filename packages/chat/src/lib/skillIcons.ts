import {
  PiAnchor,
  PiBuildings,
  PiChatCircle,
  PiFacebookLogo,
  PiFileText,
  PiFlowerLight,
  PiInstagramLogo,
  PiLightbulb,
  PiLinkedinLogo,
  PiListChecks,
  PiMicrophoneStage,
  PiMountains,
  PiNewspaper,
  PiSparkle,
  PiTiktokLogo,
  PiTranslate,
  PiTree,
  PiWaves,
  PiXLogo,
} from 'react-icons/pi';
import type { SkillIcon } from '@gruenerator/shared/agents';

export const SKILL_ICONS: Record<string, SkillIcon> = {
  PiAnchor,
  PiBuildings,
  PiChatCircle,
  PiFacebookLogo,
  PiFileText,
  PiFlowerLight,
  PiInstagramLogo,
  PiLightbulb,
  PiLinkedinLogo,
  PiListChecks,
  PiMicrophoneStage,
  PiMountains,
  PiNewspaper,
  PiTiktokLogo,
  PiTranslate,
  PiTree,
  PiWaves,
  PiXLogo,
};

export const fallbackSkillIcon: SkillIcon = PiSparkle;

export function resolveSkillIcon(iconKey: string): SkillIcon {
  return SKILL_ICONS[iconKey] ?? fallbackSkillIcon;
}
