/**
 * The decorative scenery of the "Nachhaltigkeit" page: clouds, wind turbines,
 * a road, trees, solar panels. All `aria-hidden`; colours come from the
 * `--nh-*` tokens in nachhaltigkeit.css, motion from its `.nh-*` classes
 * (which do nothing under prefers-reduced-motion).
 */
import { type CSSProperties, type ReactNode } from 'react';

const hidden = { 'aria-hidden': true, focusable: false } as const;

export function Cloud({ width, fill }: { width: number; fill: string }) {
  return (
    <svg {...hidden} width={width} height={width / 2} viewBox="0 0 120 60" fill={fill}>
      <circle cx="36" cy="38" r="17" />
      <circle cx="62" cy="28" r="24" />
      <circle cx="88" cy="38" r="16" />
      <rect x="20" y="36" width="86" height="22" rx="11" />
    </svg>
  );
}

/** A few clouds drifting across a band; hidden on small screens. */
export function DriftingClouds({ fill, top = 40 }: { fill: string; top?: number }) {
  const clouds = [
    { width: 150, top, duration: 100, delay: 0 },
    { width: 110, top: top + 24, duration: 60, delay: -22 },
    { width: 130, top: top - 10, duration: 80, delay: -55 },
  ];
  return (
    <div {...hidden} className="pointer-events-none absolute inset-x-0 top-0 hidden md:block">
      {clouds.map((c, i) => (
        <div
          key={i}
          className="nh-drift absolute left-0"
          style={{
            top: c.top,
            animationDuration: `${c.duration}s`,
            animationDelay: `${c.delay}s`,
            // Without motion the clouds sit spread out instead of piled at the left edge.
            transform: `translateX(${18 + i * 30}vw)`,
          }}
        >
          <Cloud width={c.width} fill={fill} />
        </div>
      ))}
    </div>
  );
}

const BLADE = 'M50 40 C46 26 47 8 50 0 C53 8 54 26 50 40Z';

export function WindTurbine({
  height,
  fill,
  speed = 4,
}: {
  height: number;
  fill: string;
  speed?: number;
}) {
  return (
    <svg
      {...hidden}
      width={(height * 100) / 220}
      height={height}
      viewBox="0 0 100 220"
      fill={fill}
      className="overflow-visible"
    >
      <path d="M48 40 L52 40 L55 220 L45 220 Z" />
      <g
        className="nh-spin"
        style={{ transformOrigin: '50px 40px', animationDuration: `${speed}s` }}
      >
        <path d={BLADE} />
        <path d={BLADE} transform="rotate(120 50 40)" />
        <path d={BLADE} transform="rotate(240 50 40)" />
      </g>
      <circle cx="50" cy="40" r="5" />
    </svg>
  );
}

export function Factory() {
  return (
    <svg {...hidden} width="200" height="190" viewBox="0 70 200 190">
      <rect x="40" y="80" width="30" height="180" fill="var(--nh-hero-deep)" />
      <rect x="40" y="96" width="30" height="8" fill="var(--nh-hero)" />
      <rect x="100" y="110" width="26" height="150" fill="var(--nh-hero-deep)" />
      <rect x="100" y="124" width="26" height="8" fill="var(--nh-hero)" />
      <rect x="10" y="190" width="190" height="70" fill="var(--nh-hero-deep)" />
      {[22, 52, 82, 112, 142, 172].map((x, i) => (
        <rect
          key={x}
          x={x}
          y="210"
          width="14"
          height="10"
          fill="var(--nh-glow)"
          opacity={i % 2 ? 0.55 : 1}
        />
      ))}
    </svg>
  );
}

const PYLON =
  'M68 160 L90 30 L112 160 M76 112 L104 112 M60 52 L120 52 M68 70 L112 70 M72 160 L98 112 M108 160 L82 112';

export function PowerLines() {
  return (
    <div {...hidden} className="h-[170px] overflow-hidden">
      <svg width="100%" height="170" viewBox="0 0 1440 170" preserveAspectRatio="xMinYMax slice">
        <line x1="0" y1="52" x2="1620" y2="52" stroke="var(--nh-hero-deep)" strokeWidth="2" />
        <line x1="0" y1="70" x2="1620" y2="70" stroke="var(--nh-hero-deep)" strokeWidth="2" />
        {[0, 360, 720, 1080, 1440].map((x) => (
          <path
            key={x}
            d={PYLON}
            transform={`translate(${x} 0)`}
            stroke="var(--nh-hero)"
            strokeWidth="4"
            fill="none"
          />
        ))}
        <rect x="0" y="160" width="1620" height="10" fill="var(--nh-hero-deep)" />
      </svg>
    </div>
  );
}

export function Car({ width, body }: { width: number; body: string }) {
  const wheel = (cx: number) => (
    <g>
      <circle cx={cx} cy="46" r="10" fill="#1f3a30" />
      <circle cx={cx} cy="46" r="4" fill="#c9ded4" />
    </g>
  );
  return (
    <svg
      {...hidden}
      width={width}
      height={(width * 56) / 120}
      viewBox="0 0 120 56"
      className="block flex-none overflow-visible"
    >
      <path
        d="M6 40 L10 26 Q14 18 26 18 L58 18 Q66 18 74 26 L86 34 L106 36 Q116 37 116 44 L116 46 L6 46 Z"
        fill={body}
      />
      <path d="M30 22 L56 22 Q62 22 67 27 L72 32 L30 32 Z" fill="#e3efe9" />
      <rect x="108" y="38" width="8" height="4" rx="2" fill="#f3e9b5" />
      {wheel(30)}
      {wheel(92)}
    </svg>
  );
}

/** One lane of the road; the looping cars only appear where there is room for them. */
function Lane({ children, looping }: { children?: ReactNode; looping?: string[] }) {
  return (
    <div className="relative flex h-[96px] items-center border-b-4 border-dashed border-[#8aa399] sm:h-[112px]">
      {looping?.map((body, i) => (
        <div
          key={i}
          aria-hidden
          className="nh-drive absolute left-0 top-[calc(50%-22px)] hidden sm:block"
          style={{ animationDelay: `${-i * 4.5}s`, transform: `translateX(${10 + i * 45}vw)` }}
        >
          <Car width={96} body={body} />
        </div>
      ))}
      {children}
    </div>
  );
}

/** Where each towed sign stands from `sm` up; below that they all sit at the left. */
const SIGN_OFFSET = ['sm:right-[8%]', 'sm:right-[30%]', 'sm:right-[52%]'] as const;

/**
 * The road band of chapter 02: each comparison is a sign towed by a car.
 * The signs carry real text, so the band itself is not hidden — only the cars.
 */
export function Road({ signs }: { signs: { value: string; label: string }[] }) {
  const bodies = ['#52907a', '#a8e0c6', '#a8c9ba'];
  return (
    <div className="overflow-hidden border-y-[10px] border-[#86b5a1] bg-[var(--nh-road)]">
      <Lane looping={['#a8c9ba', '#f4f7f5']} />
      {signs.map((sign, i) => (
        <Lane key={sign.label}>
          <div
            className={`absolute left-4 top-1/2 flex -translate-y-1/2 items-center sm:left-auto ${SIGN_OFFSET[i % SIGN_OFFSET.length]}`}
          >
            <div className="flex flex-col rounded-2xl bg-white px-4 py-2 shadow-[0_8px_24px_rgba(0,0,0,0.18)] sm:px-5 sm:py-2.5">
              <b className="nh-display whitespace-nowrap text-[clamp(26px,3.6vw,52px)] font-black leading-none tracking-[-0.03em] text-[#1f3a30]">
                {sign.value}
              </b>
              <span className="whitespace-nowrap text-[clamp(13px,1.1vw,15px)] text-[#3d4f47]">
                {sign.label}
              </span>
            </div>
            <span aria-hidden className="h-1 w-6 flex-none bg-[#c9ded4] sm:w-11" />
            <Car width={110} body={bodies[i % bodies.length]} />
          </div>
        </Lane>
      ))}
    </div>
  );
}

function Tree({ height, pine }: { height: number; pine?: boolean }) {
  return (
    <svg
      {...hidden}
      width={height * 0.6}
      height={height}
      viewBox="0 0 60 100"
      className="flex-none"
    >
      <rect x="27" y="56" width="6" height="44" rx="2" fill="#5b6b64" />
      {pine ? (
        <>
          <path d="M30 2 L56 62 L4 62 Z" fill="var(--nh-tree-soft)" />
          <path d="M30 2 L30 62 L4 62 Z" fill="var(--nh-tree)" />
        </>
      ) : (
        <>
          <circle cx="30" cy="34" r="26" fill="var(--nh-tree-soft)" />
          <circle cx="20" cy="46" r="16" fill="var(--nh-tree)" />
        </>
      )}
    </svg>
  );
}

function Datacenter() {
  return (
    <svg {...hidden} width="220" height="150" viewBox="0 0 220 150" className="flex-none">
      {[50, 110, 170].map((cx) => (
        <g key={cx}>
          <circle cx={cx} cy="26" r="22" fill="var(--nh-tree-soft)" />
          <g>
            {[0, 90, 180, 270].map((r) => (
              <path
                key={r}
                d={`M${cx} 26 L${cx - 6} 8 L${cx + 6} 8 Z`}
                fill="var(--nh-hero)"
                transform={`rotate(${r} ${cx} 26)`}
              />
            ))}
          </g>
        </g>
      ))}
      <rect x="0" y="50" width="220" height="100" rx="6" fill="var(--nh-line)" />
      {Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 9 }, (_, col) => (
          <rect
            key={`${row}-${col}`}
            x={16 + col * 22}
            y={68 + row * 18}
            width="10"
            height="5"
            rx="2"
            fill={(row + col) % 3 === 0 ? 'var(--nh-hero)' : 'var(--nh-tree)'}
          />
        ))
      )}
    </svg>
  );
}

function SolarPanel() {
  return (
    <svg {...hidden} width="120" height="80" viewBox="0 0 120 80" className="flex-none">
      <path d="M14 10 L110 10 L100 56 L4 56 Z" fill="var(--nh-hero)" />
      <path
        d="M38 10 L30 56 M62 10 L54 56 M86 10 L78 56 M9 33 L105 33"
        stroke="#86b5a1"
        strokeWidth="2"
      />
      <rect x="50" y="56" width="6" height="24" fill="#5b6b64" />
    </svg>
  );
}

function Sprout({ height }: { height: number }) {
  return (
    <svg
      {...hidden}
      width={height * 0.6}
      height={height}
      viewBox="0 0 60 100"
      className="flex-none"
    >
      <path d="M30 100 C30 70 32 50 30 30" stroke="var(--nh-hero)" strokeWidth="4" fill="none" />
      <path d="M30 44 C14 44 6 32 6 20 C20 20 30 30 30 44Z" fill="#52907a" />
      <path d="M30 34 C46 34 54 22 54 10 C40 10 30 20 30 34Z" fill="#86b5a1" />
    </svg>
  );
}

export function Sun() {
  return (
    <svg {...hidden} width="150" height="150" viewBox="0 0 120 120" className="overflow-visible">
      <g>
        {Array.from({ length: 12 }, (_, i) => (
          <rect
            key={i}
            x="58"
            y="2"
            width="4"
            height="16"
            rx="2"
            fill="#e2c85b"
            transform={`rotate(${i * 30} 60 60)`}
          />
        ))}
      </g>
      <circle cx="60" cy="60" r="30" fill="var(--nh-sun)" />
    </svg>
  );
}

/** A row of scenery standing on a strip of ground at the foot of a band. */
function Horizon({
  ground,
  height,
  children,
}: {
  ground: string;
  height: number;
  children: ReactNode;
}) {
  const style: CSSProperties = { height };
  return (
    <div {...hidden} className="relative overflow-hidden" style={style}>
      <div className="absolute inset-x-0 bottom-0 h-3.5" style={{ background: ground }} />
      <div className="absolute inset-x-0 bottom-3.5 flex items-end justify-around gap-3 px-6">
        {children}
      </div>
    </div>
  );
}

export function DatacenterHorizon() {
  return (
    <Horizon ground="var(--nh-line)" height={190}>
      <Tree height={98} pine />
      <Tree height={82} />
      <span className="hidden sm:block">
        <Tree height={100} pine />
      </span>
      <Datacenter />
      <span className="hidden sm:block">
        <WindTurbine height={150} fill="var(--nh-tree-soft)" />
      </span>
      <Tree height={95} />
      <span className="hidden md:block">
        <Tree height={93} />
      </span>
      <span className="hidden md:block">
        <WindTurbine height={120} fill="var(--nh-tree-soft)" speed={5} />
      </span>
      <Tree height={98} pine />
    </Horizon>
  );
}

export function SolarHorizon() {
  return (
    <Horizon ground="var(--nh-line)" height={200}>
      <SolarPanel />
      <span className="hidden sm:block">
        <WindTurbine height={150} fill="var(--nh-tree-soft)" />
      </span>
      <SolarPanel />
      <span className="hidden md:block">
        <SolarPanel />
      </span>
      <span className="hidden sm:block">
        <WindTurbine height={130} fill="var(--nh-tree-soft)" speed={5} />
      </span>
      <SolarPanel />
    </Horizon>
  );
}

export function SproutHorizon() {
  const heights = [73, 110, 90, 66, 104, 80, 110, 70, 96, 84, 108, 76];
  return (
    <Horizon ground="var(--nh-tree-soft)" height={180}>
      {heights.map((h, i) => (
        <span key={i} className={i % 3 === 2 ? 'hidden sm:block' : undefined}>
          {i % 4 === 3 ? <Tree height={h} /> : <Sprout height={h} />}
        </span>
      ))}
    </Horizon>
  );
}
