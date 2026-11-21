/** @jsxRuntime automatic @jsxImportSource react */
import { isRichTextDocEmpty } from '@gruenerator/contracts';

import {
  CONTAINER,
  editableText,
  innerId,
  itemField,
  type Placement,
  Section,
  type SectionContext,
  SectionHeading,
} from '../layout.js';
import { Placeholder } from '../Placeholder.js';
import { SiteImage } from '../SiteImage.js';
import { SiteRichText } from '../SiteRichText.js';

export function ThemesSection({ ctx, place }: { ctx: SectionContext; place: Placement<'themes'> }) {
  const { copy } = ctx;
  const { anchor, ground, block } = place;
  const cardGround = ground === 'paper' ? 'surface' : 'paper';
  const themes = block.items;
  const listField = `blocks.${block.id}`;

  return (
    <Section ctx={ctx} place={place} className="site:py-section">
      <div className={`${CONTAINER} site:mb-8`}>
        <SectionHeading id={`${anchor}-titel`}>{copy.themesHeading}</SectionHeading>
      </div>
      {themes.length === 0 ? (
        <div className={CONTAINER}>
          <Placeholder field={listField} text={copy.emptyThemes} mode={ctx.mode} />
        </div>
      ) : (
        <div
          role="region"
          aria-label={copy.themesScroller}
          tabIndex={0}
          className="site:snap-x site:snap-mandatory site:scroll-px-gutter site:overflow-x-auto site:overscroll-x-contain site:pb-2 site:focus-visible:outline-offset-[-3px] site:lg:mx-auto site:lg:max-w-page site:lg:snap-none site:lg:overflow-visible site:lg:px-gutter site:lg:pb-0"
        >
          <ul
            data-field={listField}
            className="site:grid site:w-max site:auto-cols-[85vw] site:grid-flow-col site:gap-6 site:px-gutter site:md:auto-cols-[42vw] site:lg:w-auto site:lg:grid-flow-row site:lg:grid-cols-3 site:lg:gap-8 site:lg:px-0"
          >
            {themes.map((theme, i) => {
              const titleId = innerId(place, `thema-${i + 1}-titel`);
              const title = theme.title.trim();
              return (
                <li key={theme.id} data-item-id={theme.id} className="site:flex site:snap-start">
                  <article
                    aria-labelledby={titleId}
                    data-ground={cardGround}
                    className="site:flex site:w-full site:flex-col site:overflow-hidden site:rounded-card"
                  >
                    <SiteImage
                      url={theme.imageUrl}
                      slot="card"
                      field={itemField(block, theme.id, 'imageUrl')}
                      focus={theme.imageFocus}
                      className="site:aspect-[16/10]"
                    />
                    <div className="site:flex site:grow site:flex-col site:p-6 site:lg:p-8">
                      <h3
                        id={titleId}
                        data-field={itemField(block, theme.id, 'title')}
                        className="site:mb-3 site:text-h3 site:leading-[1.2] site:text-heading site:hyphens-manual site:break-words"
                      >
                        {editableText(
                          ctx,
                          itemField(block, theme.id, 'title'),
                          `${copy.navThemes} ${i + 1}`,
                          title || `${copy.navThemes} ${i + 1}`
                        )}
                      </h3>
                      {ctx.edit ? (
                        <div
                          data-rich-text=""
                          data-field={itemField(block, theme.id, 'content')}
                          className="site:max-w-prose site:hyphens-auto"
                        >
                          {ctx.edit.richText(
                            itemField(block, theme.id, 'content'),
                            copy.editThemeText
                          )}
                        </div>
                      ) : (
                        !isRichTextDocEmpty(theme.content) && (
                          <SiteRichText
                            content={theme.content}
                            headingOffset={2}
                            field={itemField(block, theme.id, 'content')}
                          />
                        )
                      )}
                    </div>
                  </article>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </Section>
  );
}
