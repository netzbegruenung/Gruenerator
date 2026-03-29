import * as z from 'zod';

export const layoutId = 'b90-intro-slide';
export const layoutName = 'Titelfolie';
export const layoutDescription =
  'Einleitungsfolie mit großem Titel, Untertitel, Vortragenden-Info und optionalem Bild. Für die erste Folie einer Präsentation.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(60)
    .describe('Haupttitel der Präsentation')
    .default('Zusammen wirken'),
  subtitle: z
    .string()
    .max(200)
    .describe('Untertitel oder kurze Beschreibung')
    .default('Gemeinsam für eine lebenswerte Zukunft — unsere Strategie für die kommenden Jahre'),
  presenterName: z
    .string()
    .max(50)
    .describe('Name der vortragenden Person')
    .default('Maria Müller'),
  presenterRole: z.string().max(80).describe('Rolle oder Funktion').default('Fraktionsvorsitzende'),
  date: z.string().max(30).describe('Datum der Präsentation').default('März 2026'),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Optionales Bild rechts')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1472289065668-ce650ac443d2?w=800',
      __image_prompt__: 'Sonnige Landschaft mit grüner Natur',
    }),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'GrueneType Neue'; src: url('/fonts/GrueneTypeNeue-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
`;

const IntroSlide = ({ data }: { data: Partial<SlideData> }) => {
  const getInitials = (name: string) =>
    name
      .split(' ')
      .map((w) => w.charAt(0).toUpperCase())
      .join('');

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE }} />
      <div
        className="relative w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video z-20 mx-auto overflow-hidden flex"
        style={{
          fontFamily: "var(--heading-font-family, 'PT Sans')",
          background: 'var(--background-color, #F5F1E9)',
        }}
      >
        {((data as any)?.__companyName__ || (data as any)?._logo_url__) && (
          <div className="absolute top-0 left-0 right-0 px-12 pt-5 z-10">
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

        {/* Left content */}
        <div className="flex-1 flex flex-col justify-center px-16 py-12 z-10">
          <h1
            className="text-[56px] font-bold leading-[1.05] tracking-[-1px] mb-4"
            style={{
              color: 'var(--background-text, #000000)',
              fontFamily: "var(--heading-font-family, 'GrueneType Neue')",
            }}
          >
            {data.title}
          </h1>

          <div
            className="w-[100px] h-[5px] mb-6"
            style={{ backgroundColor: 'var(--primary-color, #005538)' }}
          />

          <p
            className="text-[18px] leading-[1.6] max-w-[480px] mb-8"
            style={{ color: 'var(--background-text, #000000)' }}
          >
            {data.subtitle}
          </p>

          <div
            className="flex items-center gap-4 p-4 rounded-lg max-w-[380px]"
            style={{
              backgroundColor: 'var(--card-color, #FFFFFF)',
              border: '1px solid var(--stroke, #E5E0D6)',
            }}
          >
            <div
              className="w-11 h-11 rounded-full flex items-center justify-center shrink-0"
              style={{ backgroundColor: 'var(--primary-color, #005538)' }}
            >
              <span className="text-sm font-bold" style={{ color: 'var(--primary-text, #FFFFFF)' }}>
                {getInitials(data.presenterName || 'M M')}
              </span>
            </div>
            <div className="flex flex-col">
              <span
                className="text-[16px] font-bold"
                style={{ color: 'var(--background-text, #000000)' }}
              >
                {data.presenterName}
              </span>
              <span
                className="text-[13px]"
                style={{ color: 'var(--background-text, #000000)', opacity: 0.6 }}
              >
                {data.presenterRole} · {data.date}
              </span>
            </div>
          </div>
        </div>

        {/* Right image */}
        <div className="w-[420px] h-full shrink-0">
          <img
            src={data.image?.__image_url__}
            alt={data.image?.__image_prompt__}
            className="w-full h-full object-cover"
          />
        </div>
      </div>
    </>
  );
};

export default IntroSlide;
