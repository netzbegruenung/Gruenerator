import { useScrollSync } from '../../../hooks/useScrollSync';
import { useClickToEdit } from '../../../hooks/useSectionFocus';
import { useEditorStore, type SectionType } from '../../../stores/editorStore';
import { MarkdownContent } from '../../../utils/markdown';

import type { CandidateData } from '../../../types/candidate';

import '../../../styles/components/editable-preview.css';
import '../../../styles/components/about.css';
import '../../../styles/components/themes.css';
import '../../../styles/components/actions.css';
import '../../../styles/components/contact.css';
import '../../../styles/components/hero-image.css';

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
        <div className="py-[var(--spacing-xxl-r)] px-[var(--spacing-md-r)] text-center bg-gradient-to-br from-primary-50 to-primary-100">
          {candidateData.hero.imageUrl && (
            <div
              data-section="hero"
              data-field="imageUrl"
              className={`${getElementClass('hero', 'imageUrl')} editable-element--image`}
              style={{ marginBottom: 'var(--spacing-lg)' }}
            >
              <img
                src={candidateData.hero.imageUrl}
                alt={candidateData.hero.name}
                className="w-[150px] h-[150px] rounded-full object-cover border-4 border-white shadow-lg"
              />
            </div>
          )}
          <h1
            data-section="hero"
            data-field="name"
            className={`${getElementClass('hero', 'name')} text-[length:var(--font-size-2xl)] font-bold mb-sm text-grey-900`}
          >
            {candidateData.hero.name || 'Dein Name'}
          </h1>
          <p
            data-section="hero"
            data-field="tagline"
            className={`${getElementClass('hero', 'tagline')} text-[length:var(--font-size-lg)] text-grey-600`}
          >
            {candidateData.hero.tagline || 'Dein Slogan'}
          </p>
        </div>
      </section>

      {/* About Section */}
      <section
        data-section-id="about"
        ref={(el) => registerSection('about', el)}
        className="editable-section editable-section-anchor about-section"
        onClick={handlePreviewClick}
      >
        <div className="about-block-content">
          <h2
            data-section="about"
            data-field="title"
            className={`${getElementClass('about', 'title')} about-block-title`}
          >
            {candidateData.about.title || 'Wer ich bin'}
          </h2>
          <div
            data-section="about"
            data-field="content"
            className={`${getElementClass('about', 'content')} about-block-text`}
          >
            <MarkdownContent
              content={candidateData.about.content || 'Deine Biografie wird hier erscheinen...'}
            />
          </div>
        </div>
      </section>

      {/* Hero Image Section */}
      <section
        data-section-id="heroImage"
        ref={(el) => registerSection('heroImage', el)}
        className="editable-section editable-section-anchor hero-image-section"
        onClick={handlePreviewClick}
        style={{
          background: candidateData.heroImage.imageUrl
            ? `url(${candidateData.heroImage.imageUrl})`
            : 'var(--primary-700)',
        }}
      >
        <div className="hero-image-overlay">
          <div className="hero-image-content">
            <h2
              data-section="heroImage"
              data-field="title"
              className={`${getElementClass('heroImage', 'title')} hero-image-title`}
            >
              {candidateData.heroImage.title || 'Deine Hauptbotschaft'}
            </h2>
            {candidateData.heroImage.subtitle && (
              <p
                data-section="heroImage"
                data-field="subtitle"
                className={`${getElementClass('heroImage', 'subtitle')} hero-image-subtitle`}
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
        className="editable-section editable-section-anchor themes-section"
        onClick={handlePreviewClick}
      >
        <h2 className="text-[length:var(--font-size-2xl)] mb-xl text-center text-grey-900">
          {candidateData.themes.title || 'Meine Themen'}
        </h2>
        <div className="themes-grid">
          {candidateData.themes.themes.length > 0 ? (
            candidateData.themes.themes.map((theme, index) => (
              <div key={index} className="theme-card">
                {theme.imageUrl && (
                  <div
                    data-section="themes"
                    data-field="imageUrl"
                    data-index={index}
                    className={`${getElementClass('themes', 'imageUrl', index)} editable-element--image theme-image-wrapper`}
                  >
                    <img src={theme.imageUrl} alt={theme.title} className="theme-image" />
                  </div>
                )}
                <div className="theme-content">
                  <h3
                    data-section="themes"
                    data-field="title"
                    data-index={index}
                    className={`${getElementClass('themes', 'title', index)} theme-title`}
                  >
                    {theme.title || `Thema ${index + 1}`}
                  </h3>
                  <div
                    data-section="themes"
                    data-field="content"
                    data-index={index}
                    className={`${getElementClass('themes', 'content', index)} theme-description`}
                  >
                    <MarkdownContent content={theme.content || 'Beschreibung...'} />
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center p-xl text-grey-500">Noch keine Themen hinzugefügt</div>
          )}
        </div>
      </section>

      {/* Actions Section */}
      <section
        data-section-id="actions"
        ref={(el) => registerSection('actions', el)}
        className="editable-section editable-section-anchor actions-section"
        onClick={handlePreviewClick}
      >
        <div className="image-grid">
          {candidateData.actions.actions.length > 0 ? (
            candidateData.actions.actions.map((action, index) => (
              <div
                key={index}
                data-section="actions"
                data-field="text"
                data-index={index}
                className={`${getElementClass('actions', 'text', index)} grid-item`}
                style={{
                  background: action.imageUrl
                    ? `linear-gradient(rgba(0,0,0,0.5), rgba(0,0,0,0.5)), url(${action.imageUrl})`
                    : 'var(--primary-600)',
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
            <div className="text-center p-xl text-grey-500 col-span-full">
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
          className="editable-section editable-section-anchor py-[var(--spacing-xl-r)] px-[var(--container-padding)] bg-white"
          onClick={handlePreviewClick}
        >
          <div className="max-w-[var(--container-max-width)] mx-auto">
            <h2
              data-section="socialFeed"
              data-field="title"
              className={`${getElementClass('socialFeed', 'title')} text-[length:var(--font-size-2xl)] mb-xl text-center text-grey-900`}
            >
              {candidateData.socialFeed.title || 'Instagram'}
            </h2>
            <div className="flex flex-col items-center justify-center min-h-[120px] bg-grey-50 rounded-md border-2 border-dashed border-grey-300">
              {candidateData.socialFeed.showFeed ? (
                candidateData.socialFeed.instagramUsername ? (
                  <div className="flex flex-col items-center gap-sm text-primary-600 text-center p-lg [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
                    <span className="text-[32px]">📸</span>
                    <p>@{candidateData.socialFeed.instagramUsername}</p>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-sm text-grey-600 text-center p-lg [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
                    <span className="text-[32px]">📷</span>
                    <p>Instagram-Username hinzufügen</p>
                  </div>
                )
              ) : (
                <div className="flex flex-col items-center gap-sm text-grey-600 text-center p-lg opacity-60 [&_p]:m-0 [&_p]:text-[length:var(--font-size-sm)]">
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
        className="editable-section editable-section-anchor contact-section"
        onClick={handlePreviewClick}
        style={{
          backgroundImage: candidateData.contact.backgroundImageUrl
            ? `url(${candidateData.contact.backgroundImageUrl})`
            : undefined,
          backgroundColor: !candidateData.contact.backgroundImageUrl
            ? 'var(--grey-800)'
            : undefined,
        }}
      >
        <div className="contact-overlay">
          <div className="contact-container">
            <h2
              data-section="contact"
              data-field="title"
              className={`${getElementClass('contact', 'title')} contact-title`}
            >
              {candidateData.contact.title || 'Kontakt'}
            </h2>
            <div className="max-w-[400px] mx-auto">
              <p
                data-section="contact"
                data-field="email"
                className={`${getElementClass('contact', 'email')} text-base mb-sm`}
              >
                {candidateData.contact.email || 'kontakt@beispiel.de'}
              </p>
              {candidateData.contact.phone && (
                <p
                  data-section="contact"
                  data-field="phone"
                  className={`${getElementClass('contact', 'phone')} text-base opacity-90 mb-xs`}
                >
                  {candidateData.contact.phone}
                </p>
              )}
              {candidateData.contact.address && (
                <p
                  data-section="contact"
                  data-field="address"
                  className={`${getElementClass('contact', 'address')} text-sm opacity-80 whitespace-pre-line`}
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
