import * as z from 'zod';

export const layoutId = 'b90-thank-you-contact-slide';
export const layoutName = 'Vielen Dank / Kontakt';
export const layoutDescription =
  'Abschlussfolie mit Dankesformel und Kontaktdaten. Für das Ende einer Präsentation mit Kontaktinformationen.';

export const Schema = z.object({
  title: z.string().max(40).describe('Abschlusstitel').default('Vielen Dank!'),
  subtitle: z
    .string()
    .max(100)
    .describe('Optionaler Untertitel')
    .default('Für Rückfragen stehe ich gerne zur Verfügung'),
  contactName: z.string().max(50).describe('Name der Kontaktperson').default('Maria Müller'),
  contactRole: z.string().max(80).describe('Rolle / Funktion').default('Fraktionsvorsitzende'),
  contactOrg: z.string().max(80).describe('Organisation').default('BÜNDNIS 90/DIE GRÜNEN'),
  contactAddress: z
    .string()
    .max(100)
    .describe('Adresse')
    .default('Platz vor dem Neuen Tor 1, 10115 Berlin'),
  contactPhone: z.string().max(30).describe('Telefonnummer').default('+49 30 28442-0'),
  contactEmail: z.string().max(60).describe('E-Mail-Adresse').default('maria.mueller@gruene.de'),
  image: z
    .object({
      __image_url__: z.string(),
      __image_prompt__: z.string().max(100),
    })
    .describe('Optionales dekoratives Bild')
    .default({
      __image_url__: 'https://images.unsplash.com/photo-1490750967868-88aa4f44baee?w=400',
      __image_prompt__: 'Sonnenblume als dekoratives Element',
    }),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'GrueneType Neue'; src: url('/fonts/GrueneTypeNeue-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
`;

const ThankYouContactSlide = ({ data }: { data: Partial<SlideData> }) => {
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

        {/* Left: Thank you + contact */}
        <div className="flex-1 flex flex-col justify-center px-16 py-14">
          <h1
            className="text-[56px] font-bold leading-[1.05] tracking-[-1px] mb-3"
            style={{
              color: 'var(--primary-color, #005538)',
              fontFamily: "var(--heading-font-family, 'GrueneType Neue')",
            }}
          >
            {data.title}
          </h1>
          <p
            className="text-[18px] mb-10"
            style={{ color: 'var(--background-text, #000000)', opacity: 0.6 }}
          >
            {data.subtitle}
          </p>

          <div
            className="rounded-lg p-6 max-w-[440px]"
            style={{
              backgroundColor: 'var(--card-color, #FFFFFF)',
              border: '1px solid var(--stroke, #E5E0D6)',
            }}
          >
            <p
              className="text-[18px] font-bold mb-1"
              style={{ color: 'var(--background-text, #000000)' }}
            >
              {data.contactName}
            </p>
            <p
              className="text-[14px] mb-4"
              style={{ color: 'var(--background-text, #000000)', opacity: 0.6 }}
            >
              {data.contactRole} — {data.contactOrg}
            </p>

            <div
              className="w-full h-[1px] mb-4"
              style={{ backgroundColor: 'var(--stroke, #E5E0D6)' }}
            />

            <div
              className="flex flex-col gap-2 text-[14px]"
              style={{ color: 'var(--background-text, #000000)' }}
            >
              <div className="flex items-start gap-3">
                <span
                  style={{ color: 'var(--primary-color, #005538)' }}
                  className="font-bold shrink-0 w-4"
                >
                  📍
                </span>
                <span>{data.contactAddress}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  style={{ color: 'var(--primary-color, #005538)' }}
                  className="font-bold shrink-0 w-4"
                >
                  📞
                </span>
                <span>{data.contactPhone}</span>
              </div>
              <div className="flex items-center gap-3">
                <span
                  style={{ color: 'var(--primary-color, #005538)' }}
                  className="font-bold shrink-0 w-4"
                >
                  ✉️
                </span>
                <span>{data.contactEmail}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Decorative image */}
        <div className="w-[360px] h-full shrink-0 flex items-end justify-end p-8">
          <div
            className="w-[240px] h-[240px] rounded-full overflow-hidden"
            style={{ border: '4px solid var(--primary-color, #005538)' }}
          >
            <img
              src={data.image?.__image_url__}
              alt={data.image?.__image_prompt__}
              className="w-full h-full object-cover"
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default ThankYouContactSlide;
