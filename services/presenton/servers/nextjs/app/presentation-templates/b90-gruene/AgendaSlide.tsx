import * as z from 'zod';

export const layoutId = 'b90-agenda-slide';
export const layoutName = 'Tagesordnung';
export const layoutDescription =
  'Nummerierte Tagesordnung oder Inhaltsverzeichnis. Für die Struktur einer Präsentation oder Sitzung.';

export const Schema = z.object({
  title: z.string().min(3).max(40).describe('Überschrift der Tagesordnung').default('Tagesordnung'),
  items: z
    .array(
      z.object({
        label: z.string().max(80).describe('Tagesordnungspunkt'),
      })
    )
    .min(2)
    .max(10)
    .describe('Liste der Tagesordnungspunkte')
    .default([
      { label: 'Begrüßung und Einführung' },
      { label: 'Rückblick: Ergebnisse der letzten Monate' },
      { label: 'Strategie 2026 — Schwerpunkte und Ziele' },
      { label: 'Klimaschutzpolitik: aktuelle Entwicklungen' },
      { label: 'Diskussion und offene Fragen' },
      { label: 'Nächste Schritte und Verabschiedung' },
    ]),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
`;

const AgendaSlide = ({ data }: { data: Partial<SlideData> }) => {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE }} />
      <div
        className="relative w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video z-20 mx-auto overflow-hidden px-16 py-14 flex flex-col"
        style={{
          fontFamily: "var(--heading-font-family, 'PT Sans')",
          background: 'var(--background-color, #F5F1E9)',
        }}
      >
        {((data as any)?.__companyName__ || (data as any)?._logo_url__) && (
          <div className="absolute top-0 left-0 right-0 px-12 pt-5">
            <div className="flex items-center gap-2">
              {(data as any)?._logo_url__ && (
                <img
                  src={(data as any)?._logo_url__}
                  alt="logo"
                  className="w-[60px] object-contain"
                />
              )}
              {(data as any)?._logo_url__ && (data as any)?.__companyName__ && (
                <span
                  style={{ backgroundColor: 'var(--stroke, #E5E0D6)' }}
                  className="w-[2px] h-5"
                />
              )}
              {(data as any)?.__companyName__ && (
                <span
                  className="text-sm font-bold"
                  style={{ color: 'var(--background-text, #000000)' }}
                >
                  {(data as any)?.__companyName__}
                </span>
              )}
            </div>
          </div>
        )}

        <h1
          className="text-[42px] font-bold leading-[1.1] tracking-[-1px] mt-8 mb-2"
          style={{ color: 'var(--background-text, #000000)' }}
        >
          {data.title}
        </h1>
        <div
          className="w-[100px] h-[5px] mb-10"
          style={{ backgroundColor: 'var(--primary-color, #005538)' }}
        />

        <div className="flex flex-col gap-[2px] flex-1">
          {data.items?.map((item, index) => (
            <div
              key={index}
              className="flex items-center gap-5 py-3 px-4 rounded-md"
              style={{
                backgroundColor: index % 2 === 0 ? 'var(--card-color, #FFFFFF)' : 'transparent',
              }}
            >
              <span
                className="text-[28px] font-bold w-[48px] text-center shrink-0"
                style={{ color: 'var(--primary-color, #005538)' }}
              >
                {String(index + 1).padStart(2, '0')}
              </span>
              <span
                className="text-[18px] leading-[1.4]"
                style={{ color: 'var(--background-text, #000000)' }}
              >
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
};

export default AgendaSlide;
