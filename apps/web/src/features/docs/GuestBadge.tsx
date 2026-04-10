import { type ComponentType } from 'react';
import {
  GiSquirrel,
  GiHedgehog,
  GiFoxHead,
  GiRabbitHead,
  GiOwl,
  GiBeaver,
  GiFalconMoon,
  GiLynxHead,
} from 'react-icons/gi';
import { LiaOtterSolid } from 'react-icons/lia';
import { TbDeer } from 'react-icons/tb';

export interface GuestAnimal {
  name: string;
  icon: ComponentType<{ size?: number }>;
}

export const GUEST_ANIMALS: GuestAnimal[] = [
  { name: 'Emsiges Eichhörnchen', icon: GiSquirrel },
  { name: 'Illustrer Igel', icon: GiHedgehog },
  { name: 'Flinker Fuchs', icon: GiFoxHead },
  { name: 'Ruhiges Reh', icon: TbDeer },
  { name: 'Hurtiger Hase', icon: GiRabbitHead },
  { name: 'Eifrige Eule', icon: GiOwl },
  { name: 'Origineller Otter', icon: LiaOtterSolid },
  { name: 'Braver Biber', icon: GiBeaver },
  { name: 'Fixer Falke', icon: GiFalconMoon },
  { name: 'Lustiger Luchs', icon: GiLynxHead },
];

interface GuestBadgeProps {
  guestName: string;
  guestColor: string;
  guestIcon: ComponentType<{ size?: number }>;
  loginUrl: string;
}

export const GuestBadge = ({
  guestName,
  guestColor,
  guestIcon: Icon,
  loginUrl,
}: GuestBadgeProps) => (
  <div className="flex items-center gap-2 py-0.5 px-1 pr-2.5 text-[0.75rem] rounded-full bg-secondary-100/60 dark:bg-secondary-600/20 text-secondary-700 dark:text-secondary-400 border border-secondary-200/50 dark:border-secondary-600/25">
    <div
      className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
      style={{ backgroundColor: guestColor }}
    >
      <Icon size={12} />
    </div>
    <span className="font-medium">{guestName}</span>
    <span className="text-secondary-500 dark:text-secondary-500">·</span>
    <a
      href={loginUrl}
      className="text-secondary-800 dark:text-secondary-300 underline hover:text-secondary-900 dark:hover:text-secondary-200"
    >
      Anmelden
    </a>
  </div>
);
