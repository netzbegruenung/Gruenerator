import * as z from 'zod';

export const layoutId = 'b90-text-image-right-slide';
export const layoutName = 'Text links, Bild rechts';
export const layoutDescription =
  'Zweispaltige Folie mit Titel, Beschreibung und Aufzählungspunkten links, Bild rechts. Optionaler dekorativer Störer-Kreis.';

export const Schema = z.object({
  title: z
    .string()
    .min(3)
    .max(50)
    .describe('Hauptüberschrift der Folie')
    .default('Klimaschutz vor Ort'),
  description: z
    .string()
    .max(300)
    .describe('Beschreibungstext')
    .default(
      'Kommunale Klimaschutzstrategien sind der Schlüssel zur Erreichung unserer nationalen Klimaziele. Vor Ort werden die Weichen für eine nachhaltige Zukunft gestellt.'
    ),
  bulletPoints: z
    .array(
      z.object({
        text: z.string().max(80).describe('Aufzählungspunkt'),
      })
    )
    .max(5)
    .describe('Optionale Stichpunkte')
    .default([
      { text: 'Erneuerbare Energien in jeder Kommune' },
      { text: 'Nachhaltige Mobilität fördern' },
      { text: 'Grüne Infrastruktur ausbauen' },
    ]),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Bild auf der rechten Seite')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1473448912268-2022ce9509d8?w=800',
      __image_prompt__: 'Grüner Wald mit Sonnenlicht',
    }),
  accentBadge: z
    .string()
    .max(30)
    .describe('Optionaler Text im Störer-Kreis, leer lassen wenn nicht gewünscht')
    .default('Wichtig!'),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
`;

const TextImageRightSlide = ({ data }: { data: Partial<SlideData> }) => {
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

        {/* Left: Text content */}
        <div className="flex-1 flex flex-col justify-center px-16 py-14">
          <h1
            className="text-[40px] font-bold leading-[1.1] tracking-[-1px] mb-3"
            style={{ color: 'var(--background-text, #000000)' }}
          >
            {data.title}
          </h1>
          <div
            className="w-[100px] h-[5px] mb-6"
            style={{ backgroundColor: 'var(--primary-color, #005538)' }}
          />

          <p
            className="text-[16px] leading-[1.7] mb-6"
            style={{ color: 'var(--background-text, #000000)' }}
          >
            {data.description}
          </p>

          {data.bulletPoints && data.bulletPoints.length > 0 && (
            <ul className="flex flex-col gap-2">
              {data.bulletPoints.map((point, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span
                    className="w-2 h-2 rounded-full mt-[7px] shrink-0"
                    style={{ backgroundColor: 'var(--primary-color, #005538)' }}
                  />
                  <span
                    className="text-[15px] leading-[1.5]"
                    style={{ color: 'var(--background-text, #000000)' }}
                  >
                    {point.text}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Right: Image */}
        <div className="w-[480px] h-full shrink-0 relative">
          <img
            src={data.image?.__image_url__}
            alt={data.image?.__image_prompt__}
            className="w-full h-full object-cover"
          />

          {data.accentBadge && (
            <div
              className="absolute -left-8 bottom-16 w-[140px] h-[100px] flex items-center justify-center rounded-[50%] z-20"
              style={{
                backgroundColor: '#E6007E',
                transform: 'rotate(-21deg)',
              }}
            >
              <span
                className="text-[16px] font-bold text-white text-center px-2"
                style={{ transform: 'rotate(21deg)' }}
              >
                {data.accentBadge}
              </span>
            </div>
          )}
        </div>
      </div>
    </>
  );
};

export default TextImageRightSlide;
