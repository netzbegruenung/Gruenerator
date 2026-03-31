import * as z from 'zod';

export const layoutId = 'b90-branded-message-slide';
export const layoutName = 'Statement-Folie';
export const layoutDescription =
  'Wirkungsvolle Folie mit einer großen Kernbotschaft und farblich hervorgehobenem Schlüsselwort. Für Zitate, Kernaussagen und Leitsätze.';

export const Schema = z.object({
  icon: z
    .object({
      __icon_url__: z.string(),
      __icon_query__: z.string().max(20),
    })
    .describe('Kleines Icon links neben der Botschaft')
    .default({
      __icon_url__: '/static/icons/placeholder.png',
      __icon_query__: 'leaf green icon',
    }),
  messageBefore: z
    .string()
    .max(60)
    .describe('Textabschnitt vor dem hervorgehobenen Wort')
    .default('Zusammenbringen,'),
  messageHighlight: z
    .string()
    .max(40)
    .describe('Farblich hervorgehobenes Schlüsselwort')
    .default('was zusammen gehört'),
  messageAfter: z
    .string()
    .max(60)
    .describe('Textabschnitt nach dem hervorgehobenen Wort')
    .default(''),
  subtitle: z
    .string()
    .max(150)
    .describe('Optionaler Untertitel unter der Botschaft')
    .default('Für ein gerechtes, nachhaltiges und freies Land'),
});

type SlideData = z.infer<typeof Schema>;

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'GrueneType Neue'; src: url('/fonts/GrueneTypeNeue-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
`;

const BrandedMessageSlide = ({ data }: { data: Partial<SlideData> }) => {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE }} />
      <div
        className="relative w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video z-20 mx-auto overflow-hidden flex items-center"
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

        <div className="flex items-center gap-12 px-20 w-full">
          {data.icon?.__icon_url__ && (
            <div className="shrink-0">
              <img
                src={data.icon.__icon_url__}
                alt={data.icon.__icon_query__}
                className="w-[80px] h-[80px] object-contain"
              />
            </div>
          )}

          <div className="flex flex-col">
            <p
              className="text-[48px] font-bold leading-[1.15] tracking-[-1px]"
              style={{
                color: 'var(--background-text, #000000)',
                fontFamily: "var(--heading-font-family, 'GrueneType Neue')",
              }}
            >
              {data.messageBefore} <span style={{ color: '#8ABD24' }}>{data.messageHighlight}</span>
              {data.messageAfter && ` ${data.messageAfter}`}
            </p>

            {data.subtitle && (
              <p
                className="text-[20px] mt-6 leading-[1.5]"
                style={{ color: 'var(--background-text, #000000)', opacity: 0.6 }}
              >
                {data.subtitle}
              </p>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default BrandedMessageSlide;
