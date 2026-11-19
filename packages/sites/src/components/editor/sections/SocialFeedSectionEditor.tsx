import { SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { Input, Label, Switch } from '@gruenerator/ui';
import { FaInstagram } from 'react-icons/fa';

import { useDraft, useDraftActions } from '../../../draft/SiteDraftContext';
import { useSectionFocus } from '../../../hooks/useSectionFocus';
import { Field, SectionHeading } from '../common/Field';

const cleanUsername = (value: string) => value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');

export function SocialFeedSectionEditor() {
  const { registerField, handleFieldFocus, handleFieldBlur } = useSectionFocus();
  const { setField } = useDraftActions();
  const showFeed = useDraft((d) => d.socialFeed.showFeed);
  const title = useDraft((d) => d.socialFeed.title);
  const username = useDraft((d) => d.socialFeed.instagramUsername);

  return (
    <div>
      <SectionHeading>
        <FaInstagram aria-hidden="true" style={{ marginRight: '8px', color: '#E4405F' }} />
        Instagram Feed
      </SectionHeading>

      <div className="mb-md flex items-center gap-sm">
        <Switch
          id="socialfeed-show"
          checked={showFeed}
          onCheckedChange={(checked) => setField('socialFeed.showFeed', checked)}
        />
        <Label htmlFor="socialfeed-show" className="text-base text-foreground">
          Instagram-Feed anzeigen
        </Label>
      </div>

      {showFeed && (
        <>
          <Field
            panel="socialFeed"
            path="sections.socialFeed.title"
            htmlFor="socialfeed-title"
            label="Abschnittstitel"
          >
            <Input
              ref={(el) => registerField('socialFeed', 'sections.socialFeed.title', el)}
              id="socialfeed-title"
              value={title}
              onChange={(e) => setField('socialFeed.title', e.target.value)}
              onFocus={() => handleFieldFocus('socialFeed', 'sections.socialFeed.title')}
              onBlur={handleFieldBlur}
              placeholder="Instagram"
              maxLength={SITE_SECTION_TITLE_MAX}
            />
          </Field>

          <Field
            panel="socialFeed"
            path="sections.socialFeed.instagramUsername"
            htmlFor="socialfeed-username"
            label="Instagram-Benutzername"
            hint="Der Benutzername deines öffentlichen Instagram-Profils"
          >
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-sm text-grey-600 dark:text-grey-400">
                @
              </span>
              <Input
                ref={(el) =>
                  registerField('socialFeed', 'sections.socialFeed.instagramUsername', el)
                }
                id="socialfeed-username"
                value={username}
                onChange={(e) =>
                  setField('socialFeed.instagramUsername', cleanUsername(e.target.value))
                }
                onFocus={() =>
                  handleFieldFocus('socialFeed', 'sections.socialFeed.instagramUsername')
                }
                onBlur={handleFieldBlur}
                placeholder="benutzername"
                maxLength={30}
              />
            </div>
          </Field>

          <div className="p-md bg-primary-100 dark:bg-primary-900 rounded-sm mt-md">
            <p className="m-0 text-sm text-primary-800 dark:text-primary-300 leading-relaxed">
              <strong className="font-semibold">Datenschutz-Hinweis:</strong> Der Instagram-Feed
              wird erst geladen, nachdem Besucher*innen der Datenübertragung an Meta zugestimmt
              haben (DSGVO-konforme Zwei-Klick-Lösung).
            </p>
          </div>
        </>
      )}
    </div>
  );
}
