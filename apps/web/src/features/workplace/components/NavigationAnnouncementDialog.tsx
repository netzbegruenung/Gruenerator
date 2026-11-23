import { Button } from '@gruenerator/ui';
import { Search } from 'lucide-react';
import { motion } from 'motion/react';
import { type ReactNode } from 'react';
import { HiArrowRight } from 'react-icons/hi2';
import { LuFolderCog } from 'react-icons/lu';
import { useNavigate } from 'react-router-dom';

import {
  AnnouncementDialog,
  type AnnouncementSlide,
  enter,
  Features,
  Lead,
} from '../../../components/common/AnnouncementDialog';
import WorkplaceIcon from '../../../components/icons/WorkplaceIcon';
import { getIcon } from '../../../config/icons';
import { useStartLayout } from '../../../hooks/useStartLayout';
import { useAuthStore } from '../../../stores/authStore';

import { cn } from '@/utils/cn';

const ChatIcon = getIcon('navigation', 'home');

// ── Drawn mock-ups: plain boxes, so the popup never shows a stale screenshot ──

/** The „Chat | Arbeiten" switch; the white pill slides over once. */
function TabSwitchMock({ active }: { active: 0 | 1 }) {
  return (
    <div className="relative grid h-9 w-56 grid-cols-2 rounded-full bg-white/70 text-sm font-medium">
      <motion.span
        className="absolute inset-y-0 left-0 w-1/2 rounded-full border-[0.5px] border-black/10 bg-white shadow-[0_1px_6px_rgba(0,0,0,.08)]"
        initial={{ x: active ? '0%' : '100%' }}
        animate={{ x: active ? '100%' : '0%' }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1], delay: 0.5 }}
      />
      {['Chat', 'Arbeiten'].map((label, i) => (
        <span
          key={label}
          className={cn(
            'relative z-10 flex items-center justify-center',
            i === active ? 'text-grey-900' : 'text-grey-500'
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

function ComposerMock({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'flex h-10 items-center gap-2 rounded-full bg-white px-3 shadow-md ring-1 ring-black/5',
        className
      )}
    >
      <span className="size-5 rounded-full bg-primary-100" />
      <span className="h-2 w-2/5 rounded-full bg-grey-200" />
    </div>
  );
}

function CardRowMock({ count, delayMs }: { count: number; delayMs: number }) {
  return (
    <div className="grid w-full gap-2" style={{ gridTemplateColumns: `repeat(${count}, 1fr)` }}>
      {Array.from({ length: count }, (_, i) => (
        <motion.span
          key={i}
          className="aspect-[4/5] rounded-md bg-white shadow-sm ring-1 ring-black/5"
          {...enter(delayMs + i * 60, { y: 10 })}
        />
      ))}
    </div>
  );
}

function TabsVisual() {
  return (
    <div className="flex w-full max-w-72 flex-col items-center gap-5">
      <motion.div {...enter(0, { y: -8 })}>
        <TabSwitchMock active={1} />
      </motion.div>
      <motion.div className="w-full" {...enter(150, { y: 8 })}>
        <ComposerMock />
      </motion.div>
      <CardRowMock count={3} delayMs={300} />
    </div>
  );
}

/** With tabs the sidebar has a Chat entry; on the one page Workplace carries the mark. */
function SidebarVisual({ withChat }: { withChat: boolean }) {
  const workplaceIcon =
    !withChat && ChatIcon ? <ChatIcon className="size-5" /> : <WorkplaceIcon className="size-5" />;
  const rows: { icon: ReactNode; label: string }[] = [
    ...(withChat && ChatIcon ? [{ icon: <ChatIcon className="size-5" />, label: 'Chat' }] : []),
    { icon: workplaceIcon, label: 'Workplace' },
    { icon: <LuFolderCog className="size-5" />, label: 'Projekte' },
  ];
  const current = withChat ? 1 : 0;
  return (
    <motion.div
      className="flex h-[88%] w-48 flex-col rounded-2xl bg-white p-2.5 text-sm text-grey-800 shadow-xl ring-1 ring-black/5"
      {...enter(0, { x: -16 })}
    >
      {rows.map((row, i) => (
        <motion.span
          key={row.label}
          className={cn(
            'flex items-center gap-3 rounded-lg px-2.5 py-2',
            i === current && 'bg-black/[0.06] font-medium'
          )}
          {...enter(150 + i * 80, { x: -8 })}
        >
          {row.icon}
          {row.label}
        </motion.span>
      ))}
      <span className="mt-auto flex items-center gap-3 rounded-lg px-2.5 py-2">
        <Search className="size-5" />
        Suche
        <kbd className="ml-auto rounded bg-grey-100 px-1.5 text-[11px] text-grey-500">⌘K</kbd>
      </span>
    </motion.div>
  );
}

function OnePageVisual() {
  return (
    <div className="flex w-full max-w-72 flex-col items-center gap-3">
      <motion.span className="h-3 w-3/5 rounded-full bg-grey-800/80" {...enter(0, { y: -6 })} />
      <motion.div className="w-full" {...enter(120, { y: 6 })}>
        <ComposerMock />
      </motion.div>
      <span className="mt-2 h-2 w-16 self-start rounded-full bg-grey-500/60" />
      <CardRowMock count={4} delayMs={260} />
    </div>
  );
}

function TourVisual() {
  return (
    <div className="flex w-full max-w-72 flex-col items-center gap-4">
      <motion.div
        className="w-full rounded-full ring-4 ring-primary-500/60 ring-offset-4 ring-offset-primary-100 dark:ring-offset-primary-900"
        {...enter(0, { scale: 0.96 })}
      >
        <ComposerMock />
      </motion.div>
      <motion.div
        className="max-w-60 self-end rounded-xl bg-white p-3 text-left text-[12px] leading-snug text-grey-700 shadow-lg ring-1 ring-black/5"
        {...enter(250, { y: 8 })}
      >
        <span className="block font-semibold text-grey-900">Dein Chat-Einstieg</span>
        Stell Fragen oder lass Texte schreiben …
      </motion.div>
    </div>
  );
}

interface NavigationAnnouncementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** The walkthrough of the new navigation: the one-page start, the sidebar and the tabs option. */
export default function NavigationAnnouncementDialog({
  open,
  onOpenChange,
}: NavigationAnnouncementDialogProps) {
  const navigate = useNavigate();
  const layout = useStartLayout();
  const updateStartLayout = useAuthStore((s) => s.updateStartLayout);
  const onePage = layout === 'combined';

  const startTour = () => {
    onOpenChange(false);
    void import('../../tours/workplaceTour').then((m) =>
      m.startWorkplaceTour((path) => void navigate(path), layout)
    );
  };

  const slides: AnnouncementSlide[] = [
    {
      eyebrow: 'Neu im Grünerator',
      title: 'Alles auf einer Seite',
      visual: <OnePageVisual />,
      body: (
        <>
          <Lead>
            Auf der Startseite schreibst du direkt los. Darunter findest du alles, woran du zuletzt
            gearbeitet hast, und deine Werkzeuge.
          </Lead>
          <Features
            items={[
              'Oben der Chat: Fragen stellen, Texte schreiben, Sharepics erstellen.',
              'Darunter „Zuletzt“, „Neu erstellen“, deine Werkzeuge, Briefing und Marktplatz.',
              'Auf dem Handy wartet der Chat unten am Daumen, sobald du nach unten wischst.',
            ]}
          />
        </>
      ),
    },
    {
      eyebrow: 'Seitenleiste',
      title: 'Alles Wichtige links',
      visual: <SidebarVisual withChat={!onePage} />,
      body: (
        <>
          <Lead>
            Die Seitenleiste ist schlanker geworden. Was du ständig brauchst, steht ganz oben, die
            Suche ganz unten.
          </Lead>
          <Features
            items={[
              onePage
                ? 'Workplace bringt dich von überall zurück zur Startseite.'
                : 'Chat und Workplace bringen dich von überall zurück zur Startseite.',
              'Projekte: gemeinsam im Team arbeiten, mit Notebooks und Rezepten.',
              'Suche: ganz unten in der Leiste oder mit ⌘K (Strg+K) von überall.',
              'Darunter deine Chats, und ganz unten dein Konto mit den Einstellungen.',
            ]}
          />
        </>
      ),
    },
    {
      eyebrow: 'Deine Wahl',
      title: 'Lieber mit Tabs?',
      visual: <TabsVisual />,
      body: (
        <>
          <Lead>
            Mit Tabs bekommen Chat und Arbeiten je eine eigene Ansicht, umgeschaltet oben auf der
            Seite. Ändern kannst du das jederzeit in den Einstellungen unter Allgemein → Aufbau der
            Startseite.
          </Lead>
          <div>
            <Button
              variant={onePage ? 'default' : 'outline'}
              className="rounded-full"
              onClick={() => void updateStartLayout(onePage ? 'tabs' : 'combined')}
            >
              {onePage ? 'Tabs ausprobieren' : 'Zurück zu einer Seite'}
            </Button>
            <p className="m-0 mt-2 text-xs text-muted-foreground" role="status">
              {onePage ? 'Aktiv: alles auf einer Seite.' : 'Aktiv: Tabs.'}
            </p>
          </div>
        </>
      ),
    },
    {
      eyebrow: 'Los geht’s',
      title: 'Kurze Tour gefällig?',
      visual: <TourVisual />,
      body: (
        <>
          <Lead>
            In einer Minute zeigen wir dir alles direkt auf der Seite: den Chat-Einstieg, „Zuletzt“,
            deine Werkzeuge und die Seitenleiste.
          </Lead>
          <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center">
            <Button size="brand-md" className="rounded-full" onClick={startTour}>
              Tour starten
              <HiArrowRight className="size-5" aria-hidden="true" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="rounded-full"
              onClick={() => onOpenChange(false)}
            >
              Später
            </Button>
          </div>
        </>
      ),
    },
  ];

  return (
    <AnnouncementDialog
      open={open}
      onOpenChange={onOpenChange}
      slides={slides}
      topic="die neue Navigation"
    />
  );
}
