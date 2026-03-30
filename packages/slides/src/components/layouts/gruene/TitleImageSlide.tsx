import { type TitleImageData } from './TitleImageSlide.schema.js';

export { Schema, layoutId, layoutName, layoutDescription } from './TitleImageSlide.schema.js';

const FONT_FACE = `
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
@font-face { font-family: 'PT Sans'; src: url('/fonts/PTSans-Bold.woff2') format('woff2'); font-weight: 700; font-style: normal; font-display: swap; }
@font-face { font-family: 'GrueneType Neue'; src: url('/fonts/GrueneTypeNeue-Regular.woff2') format('woff2'); font-weight: 400; font-style: normal; font-display: swap; }
`;

const TitleImageSlide = ({ data }: { data: Partial<TitleImageData> }) => {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: FONT_FACE }} />
      <div
        className="relative w-full rounded-sm max-w-[1280px] shadow-lg max-h-[720px] aspect-video z-20 mx-auto overflow-hidden"
        style={{ fontFamily: "var(--heading-font-family, 'PT Sans')" }}
      >
        {((data as any)?.__companyName__ || (data as any)?._logo_url__) && (
          <div className="absolute top-0 left-0 right-0 px-12 pt-5 z-30">
            <div className="flex items-center gap-2">
              {(data as any)?._logo_url__ && (
                <img
                  src={(data as any)?._logo_url__}
                  alt="logo"
                  className="w-[60px] object-contain"
                />
              )}
              {(data as any)?._logo_url__ && (data as any)?.__companyName__ && (
                <span className="w-[2px] h-5 bg-white/50" />
              )}
              {(data as any)?.__companyName__ && (
                <span className="text-sm font-bold text-white">
                  {(data as any)?.__companyName__}
                </span>
              )}
            </div>
          </div>
        )}

        <img
          src={data.image?.__image_url__}
          alt={data.image?.__image_prompt__}
          className="absolute inset-0 w-full h-full object-cover"
        />

        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />

        <div className="absolute bottom-0 left-0 right-0 px-16 pb-16 z-20">
          <h1
            className="text-[52px] font-bold leading-[1.1] tracking-[-1px] text-white mb-4"
            style={{ fontFamily: "var(--heading-font-family, 'GrueneType Neue')" }}
          >
            {data.title}
          </h1>
          <div className="w-[80px] h-[4px] bg-white/60 mb-5" />
          <p className="text-[20px] leading-[1.5] text-white/90 max-w-[700px]">{data.subtitle}</p>
        </div>
      </div>
    </>
  );
};

export default TitleImageSlide;
