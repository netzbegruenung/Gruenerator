import { SITE_SECTION_TITLE_MAX } from '@gruenerator/contracts';
import { Input } from '@gruenerator/ui';
import { FaInstagram } from 'react-icons/fa';

import { useDraftActions, useDraftBlock } from '../../../draft/SiteDraftContext';
import { useFieldRegistry } from '../../../hooks/useFieldRegistry';
import { Field, SectionHeading } from '../common/Field';

const cleanUsername = (value: string) => value.replace(/^@/, '').replace(/[^a-zA-Z0-9._]/g, '');

export function SocialFeedSectionEditor({ blockId }: { blockId: string }) {
  const { registerField, handleFieldFocus, handleFieldBlur } = useFieldRegistry();
  const { setBlockField } = useDraftActions();
  const block = useDraftBlock(blockId, 'socialFeed');
  if (!block) return null;
  const { title } = block;
  const username = block.instagramUsername ?? '';
  const set = (patch: Parameters<typeof setBlockField<'socialFeed'>>[2]) =>
    setBlockField(blockId, 'socialFeed', patch);
  const titlePath = `blocks.${blockId}.title`;
  const userPath = `blocks.${blockId}.instagramUsername`;

  return (
    <div>
      <SectionHeading>
        <FaInstagram aria-hidden="true" style={{ marginRight: '8px', color: '#E4405F' }} />
        Instagram Feed
      </SectionHeading>

      <Field panel={blockId} path={titlePath} htmlFor="socialfeed-title" label="Abschnittstitel">
        <Input
          ref={(el) => registerField(titlePath, el)}
          id="socialfeed-title"
          value={title}
          onChange={(e) => set({ title: e.target.value })}
          onFocus={() => handleFieldFocus(blockId, titlePath)}
          onBlur={handleFieldBlur}
          placeholder="Instagram"
          maxLength={SITE_SECTION_TITLE_MAX}
        />
      </Field>

      <Field
        panel={blockId}
        path={userPath}
        htmlFor="socialfeed-username"
        label="Instagram-Benutzername"
        hint="Der Benutzername deines öffentlichen Instagram-Profils"
      >
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="text-sm text-grey-600 dark:text-grey-400">
            @
          </span>
          <Input
            ref={(el) => registerField(userPath, el)}
            id="socialfeed-username"
            value={username}
            onChange={(e) => set({ instagramUsername: cleanUsername(e.target.value) })}
            onFocus={() => handleFieldFocus(blockId, userPath)}
            onBlur={handleFieldBlur}
            placeholder="benutzername"
            maxLength={30}
          />
        </div>
      </Field>

      <div className="p-md bg-primary-100 dark:bg-primary-900 rounded-sm mt-md">
        <p className="m-0 text-sm text-primary-800 dark:text-primary-300 leading-relaxed">
          <strong className="font-semibold">Datenschutz-Hinweis:</strong> Der Instagram-Feed wird
          erst geladen, nachdem Besucher*innen der Datenübertragung an Meta zugestimmt haben
          (DSGVO-konforme Zwei-Klick-Lösung).
        </p>
      </div>
    </div>
  );
}
