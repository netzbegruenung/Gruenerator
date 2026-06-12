import { isRichTextDocEmpty } from '@gruenerator/contracts';
import {
  HeroImagePlaceholder,
  RichTextContent,
  type CandidateData,
} from '@gruenerator/sites-design';

import { useScrollSync } from '../../../hooks/useScrollSync';
import { useClickToEdit } from '../../../hooks/useSectionFocus';
import { useEditorStore, type SectionType } from '../../../stores/editorStore';

import '../../../styles/components/editable-preview.css';

interface InteractivePreviewProps {
  candidateData: CandidateData;
  containerRef: React.RefObject<HTMLElement | null>;
}

export function InteractivePreview({ candidateData, containerRef }: InteractivePreviewProps) {
  const { highlightedElement } = useEditorStore();
  const { registerSection } = useScrollSync({ containerRef });
  const { handlePreviewClick, handleSectionClick } = useClickToEdit();

  const isHighlighted = (section: SectionType, field?: string, index?: number) => {
    if (!highlightedElement) return false;
    if (highlightedElement.section !== section) return false;
    if (field && highlightedElement.field !== field) return false;
    if (index !== undefined && highlightedElement.index !== index) return false;
    return true;
  };

  const getElementClass = (section: SectionType, field?: string, index?: number) => {
    const classes = ['editable-element'];
    if (isHighlighted(section, field, index)) {
      classes.push('editable-element--highlighted');
    }
    return classes.join(' ');
  };

  return (
    <div className="interactive-preview" onClick={handleSectionClick}>
      {/* Hero Section */}
      <section
        data-section-id="hero"
        ref={(el) => registerSection('hero', el)}
        className="editable-section editable-section-anchor"
        onClick={handlePreviewClick}
      >
        <div className="py-[var(--spacing-responsive-xxlarge)] px-[var(--spacing-responsive-medium)] text-center bg-gradient-to-br from-primary-50 to-primary-100 dark:from-primary-900 dark:to-primary-950">
          <div
            data-section="hero"
            data-field="imageUrl"
            className={`${getElementClass('hero', 'imageUrl')} editable-element--image`}
            style={{ marginBottom: 'var(--spacing-lg)' }}
          >
            {candidateData.hero.imageUrl ? (
              <img
                src={candidateData.hero.imageUrl}
                alt={candidateData.hero.name}
                className="w-[150px] h-[150px] rounded-full object-cover border-4 border-white shadow-lg mx-auto"
              />
            ) : (
              <HeroImagePlaceholder className="w-[150px] h-[150px] rounded-full border-4 border-white shadow-lg mx-auto" />
            )}
          </div>
          <h1
            data-section="hero"
            data-field="name"
            className={`${getElementClass('hero', 'name')} font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] font-bold mb-sm text-[var(--font-color-h)]`}
          >
            {candidateData.hero.name || 'Dein Name'}
          </h1>
          <p
            data-section="hero"
            data-field="tagline"
            className={`${getElementClass('hero', 'tagline')} text-[length:var(--font-size-lg)] text-[var(--font-color-muted)]`}
          >
            {candidateData.hero.tagline || 'Dein Slogan'}
          </p>
        </div>
      </section>

      {/* About Section */}
      <section
        data-section-id="about"
        ref={(el) => registerSection('about', el)}
        className="editable-section editable-section-anchor relative bg-[var(--background-color-pure)] py-[var(--spacing-responsive-xlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)]"
        onClick={handlePreviewClick}
      >
        <div className="max-w-7xl mx-auto flex flex-col items-start gap-[var(--spacing-responsive-large)]">
          <h2
            data-section="about"
            data-field="title"
            className={`${getElementClass('about', 'title')} font-[GrueneTypeNeue] text-[var(--link-color)] text-[length:var(--font-size-2xl)] font-bold leading-tight m-0`}
          >
            {candidateData.about.title || 'Wer ich bin'}
          </h2>
          <div
            data-section="about"
            data-field="content"
            className={`${getElementClass('about', 'content')} flex-1 max-w-[65ch] [&_p]:text-[var(--font-color)] [&_p]:text-[length:var(--font-size-lg)] [&_p]:leading-relaxed [&_p]:mb-[var(--spacing-md)] [&_p:last-child]:mb-0`}
          >
            {isRichTextDocEmpty(candidateData.about.content) ? (
              <p>Deine Biografie wird hier erscheinen...</p>
            ) : (
              <RichTextContent content={candidateData.about.content} />
            )}
          </div>
        </div>
      </section>

      {/* Hero Image Section */}
      <section
        data-section-id="heroImage"
        ref={(el) => registerSection('heroImage', el)}
        className="editable-section editable-section-anchor relative min-h-[40vh] bg-cover bg-center bg-scroll flex items-center justify-center"
        onClick={handlePreviewClick}
        style={{
          background: candidateData.heroImage.imageUrl
            ? `url(${candidateData.heroImage.imageUrl})`
            : 'var(--primary-700)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
        }}
      >
        <div className="absolute inset-0 bg-black/65 flex items-center justify-center">
          <div className="text-center p-[var(--spacing-responsive-large)] max-w-[800px]">
            <h2
              data-section="heroImage"
              data-field="title"
              className={`${getElementClass('heroImage', 'title')} font-[GrueneTypeNeue] text-[length:var(--font-size-xl)] font-bold text-white mb-[var(--spacing-md)] [text-shadow:0_2px_4px_rgba(0,0,0,0.3)]`}
            >
              {candidateData.heroImage.title || 'Deine Hauptbotschaft'}
            </h2>
            {candidateData.heroImage.subtitle && (
              <p
                data-section="heroImage"
                data-field="subtitle"
                className={`${getElementClass('heroImage', 'subtitle')} text-[length:var(--font-size-lg)] text-[var(--neutral-600)]`}
              >
                {candidateData.heroImage.subtitle}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Themes Section */}
      <section
        data-section-id="themes"
        ref={(el) => registerSection('themes', el)}
        className="editable-section editable-section-anchor bg-[var(--background-color-alt)] py-[var(--spacing-responsive-xxlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)] overflow-hidden"
        onClick={handlePreviewClick}
      >
        <div className="max-w-7xl mx-auto">
          <h2 className="font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] font-bold mb-xl text-center text-[var(--link-color)]">
            {candidateData.themes.title || 'Meine Themen'}
          </h2>
          <div className="flex gap-[var(--spacing-responsive-medium)] overflow-x-auto scrollbar-none pb-[var(--spacing-responsive-large)]">
            {candidateData.themes.themes.length > 0 ? (
              candidateData.themes.themes.map((theme, index) => (
                <div
                  key={theme._key ?? theme.title}
                  className="flex-[0_0_85%] min-w-[280px] bg-[var(--background-color-pure)] rounded-[var(--radius-md)] overflow-hidden shadow-[var(--shadow-md)] transition-all hover:-translate-y-1 hover:shadow-[var(--shadow-lg)]"
                >
                  {theme.imageUrl && (
                    <div
                      data-section="themes"
                      data-field="imageUrl"
                      data-index={index}
                      className={`${getElementClass('themes', 'imageUrl', index)} editable-element--image aspect-[16/10] overflow-hidden`}
                    >
                      <img
                        src={theme.imageUrl}
                        alt={theme.title}
                        className="w-full h-full object-cover transition-transform duration-300 hover:scale-105"
                      />
                    </div>
                  )}
                  <div className="p-[var(--spacing-responsive-large)]">
                    <h3
                      data-section="themes"
                      data-field="title"
                      data-index={index}
                      className={`${getElementClass('themes', 'title', index)} text-[length:var(--font-size-lg)] font-semibold text-[var(--link-color)] mb-[var(--spacing-sm)]`}
                    >
                      {theme.title || `Thema ${index + 1}`}
                    </h3>
                    <div
                      data-section="themes"
                      data-field="content"
                      data-index={index}
                      className={`${getElementClass('themes', 'content', index)} text-[var(--font-color-muted)] text-[length:var(--font-size-base)] leading-relaxed`}
                    >
                      {isRichTextDocEmpty(theme.content) ? (
                        <p>Beschreibung...</p>
                      ) : (
                        <RichTextContent content={theme.content} />
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center p-xl text-[var(--font-color-muted)]">
                Noch keine Themen hinzugefügt
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Actions Section */}
      <section
        data-section-id="actions"
        ref={(el) => registerSection('actions', el)}
        className="editable-section editable-section-anchor bg-[var(--background-color-pure)] py-[var(--spacing-responsive-xxlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)]"
        onClick={handlePreviewClick}
      >
        <div className="grid grid-cols-1 gap-[var(--spacing-responsive-medium)] sm:grid-cols-2 lg:grid-cols-3 md:gap-[var(--spacing-responsive-large)] max-w-7xl mx-auto">
          {candidateData.actions.actions.length > 0 ? (
            candidateData.actions.actions.map((action, index) => (
              <div
                key={action._key ?? action.text}
                data-section="actions"
                data-field="text"
                data-index={index}
                className={`${getElementClass('actions', 'text', index)} relative overflow-hidden cursor-pointer aspect-[3/4] w-full rounded-[var(--radius-md)] shadow-[var(--shadow-md)] bg-[var(--link-color)] flex items-center justify-center text-white`}
                style={{
                  background: action.imageUrl
                    ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${action.imageUrl})`
                    : 'var(--link-color)',
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }}
              >
                <span className="text-[length:var(--font-size-lg)] font-semibold [text-shadow:0_1px_3px_rgba(0,0,0,0.3)]">
                  {action.text || `Aktion ${index + 1}`}
                </span>
              </div>
            ))
          ) : (
            <div className="text-center p-xl text-[var(--font-color-muted)] col-span-full">
              Noch keine Aktionen hinzugefügt
            </div>
          )}
        </div>
      </section>

      {/* Social Feed Section */}
      {candidateData.socialFeed && (
        <section
          data-section-id="socialFeed"
          ref={(el) => registerSection('socialFeed', el)}
          className="editable-section editable-section-anchor py-[var(--spacing-responsive-xlarge)] px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)] bg-[var(--background-color-pure)]"
          onClick={handlePreviewClick}
        >
          <div className="max-w-7xl mx-auto">
            <h2
              data-section="socialFeed"
              data-field="title"
              className={`${getElementClass('socialFeed', 'title')} font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] font-bold mb-xl text-center text-[var(--link-color)]`}
            >
              {candidateData.socialFeed.title || 'Instagram'}
            </h2>
            <div className="flex flex-col items-center justify-center min-h-[120px] bg-[var(--background-color-alt)] rounded-md border-2 border-dashed border-grey-300">
              {candidateData.socialFeed.showFeed ? (
                candidateData.socialFeed.instagramUsername ? (
                  <div className="flex flex-col items-center gap-sm text-primary-600 text-center p-lg [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
                    <span className="text-[32px]">📸</span>
                    <p>@{candidateData.socialFeed.instagramUsername}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-sm text-[var(--font-color-muted)] text-center p-lg [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
                    <span className="text-[32px]">📷</span>
                    <p>Instagram-Username hinzufügen</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-sm text-[var(--font-color-muted)] text-center p-lg opacity-60 [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
                  <span className="text-[32px]">📷</span>
                  <p>Instagram-Feed deaktiviert</p>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section
        data-section-id="contact"
        ref={(el) => registerSection('contact', el)}
        className="editable-section editable-section-anchor relative bg-cover bg-center py-[var(--spacing-responsive-xxlarge)] md:py-16 px-[var(--spacing-responsive-medium)] md:px-[var(--spacing-responsive-large)]"
        onClick={handlePreviewClick}
        style={{
          backgroundImage: candidateData.contact.backgroundImageUrl
            ? `url(${candidateData.contact.backgroundImageUrl})`
            : undefined,
          backgroundColor: !candidateData.contact.backgroundImageUrl
            ? 'var(--font-color)'
            : undefined,
        }}
      >
        <div className="absolute inset-0 bg-black/40 z-[1]" />
        <div className="relative z-[2]">
          <div className="max-w-7xl mx-auto">
            <h2
              data-section="contact"
              data-field="title"
              className={`${getElementClass('contact', 'title')} font-[GrueneTypeNeue] text-[length:var(--font-size-2xl)] font-bold text-white mb-[var(--spacing-responsive-large)]`}
            >
              {candidateData.contact.title || 'Kontakt'}
            </h2>
            <div className="max-w-[400px] mx-auto">
              <p
                data-section="contact"
                data-field="email"
                className={`${getElementClass('contact', 'email')} text-base text-white mb-sm`}
              >
                {candidateData.contact.email || 'kontakt@beispiel.de'}
              </p>
              {candidateData.contact.phone && (
                <p
                  data-section="contact"
                  data-field="phone"
                  className={`${getElementClass('contact', 'phone')} text-base text-white opacity-90 mb-xs`}
                >
                  {candidateData.contact.phone}
                </p>
              )}
              {candidateData.contact.address && (
                <p
                  data-section="contact"
                  data-field="address"
                  className={`${getElementClass('contact', 'address')} text-sm text-white opacity-80 whitespace-pre-line`}
                >
                  {candidateData.contact.address}
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
