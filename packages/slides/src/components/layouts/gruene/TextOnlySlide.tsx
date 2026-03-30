import { type TextOnlyData } from './TextOnlySlide.schema.js';

export { Schema, layoutId, layoutName, layoutDescription } from './TextOnlySlide.schema.js';

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
`;

const TextOnlySlide = ({ data }: { data: Partial<TextOnlyData> }) => {
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

        <div className="flex gap-12 flex-1 relative">
          <div className="flex-1">
            <p
              className="text-[16px] leading-[1.75]"
              style={{ color: 'var(--background-text, #000000)' }}
            >
              {data.columnLeft}
            </p>
          </div>
          <div className="w-[1px]" style={{ backgroundColor: 'var(--stroke, #E5E0D6)' }} />
          <div className="flex-1">
            <p
              className="text-[16px] leading-[1.75]"
              style={{ color: 'var(--background-text, #000000)' }}
            >
              {data.columnRight}
            </p>
          </div>

          {data.accentBadge && (
            <div
              className="absolute -right-4 -bottom-2 w-[130px] h-[90px] flex items-center justify-center rounded-[50%] z-20"
              style={{
                backgroundColor: '#0BA1DD',
                transform: 'rotate(-21deg)',
              }}
            >
              <span
                className="text-[15px] font-bold text-white text-center px-2"
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

export default TextOnlySlide;
