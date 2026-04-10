import { type ComponentType, useEffect, useRef, useState } from 'react';
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
}: GuestBadgeProps) => {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        className="flex items-center gap-1.5 py-0.5 px-1.5 text-[0.75rem] rounded-full bg-secondary-100/60 dark:bg-secondary-600/20 text-secondary-700 dark:text-secondary-400 border border-secondary-200/50 dark:border-secondary-600/25 cursor-pointer transition-colors hover:bg-secondary-200/60 dark:hover:bg-secondary-600/30"
        onClick={() => setOpen((v) => !v)}
        title={guestName}
      >
        <div
          className="w-5 h-5 rounded-full flex items-center justify-center text-white shrink-0"
          style={{ backgroundColor: guestColor }}
        >
          <Icon size={12} />
        </div>
        <span className="font-medium max-sm:hidden">{guestName}</span>
      </button>

      {open && (
        <div className="absolute top-[calc(100%+0.5rem)] right-0 min-w-[200px] p-3 bg-white/90 dark:bg-grey-900/90 backdrop-blur-xl border border-white/30 dark:border-white/10 rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.08),0_1px_2px_rgba(0,0,0,0.04)] z-[100]">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="w-7 h-7 rounded-full flex items-center justify-center text-white shrink-0"
              style={{ backgroundColor: guestColor }}
            >
              <Icon size={16} />
            </div>
            <div>
              <div className="text-[0.8125rem] font-medium text-foreground">{guestName}</div>
              <div className="text-[0.6875rem] text-grey-500">Gastzugang</div>
            </div>
          </div>
          <a
            href={loginUrl}
            className="flex items-center justify-center w-full py-1.5 px-3 text-[0.8125rem] font-medium rounded-lg bg-primary-600 text-white no-underline transition-colors hover:bg-primary-700"
          >
            Anmelden
          </a>
        </div>
      )}
    </div>
  );
};
