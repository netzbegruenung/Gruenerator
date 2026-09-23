import {
  Alert,
  AlertDescription,
  Skeleton,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@gruenerator/ui';
import { useState } from 'react';
import { PiFileText, PiImage, PiTextAa } from 'react-icons/pi';

import PageContainer from '../../components/common/PageContainer';

import { DocumentTranslator } from './components/DocumentTranslator';
import { ImageTranslator } from './components/ImageTranslator';
import { TextTranslator } from './components/TextTranslator';
import { TranslationNotConfiguredError, useTranslationLanguages } from './hooks/useTranslation';

/** Inactive = outline pill, active = the brand pill (Button's two brand variants). */
const TAB_CLS =
  'h-9 gap-xs rounded-full border border-grey-200 px-md text-sm font-semibold text-foreground dark:border-grey-700 ' +
  'data-[state=active]:border-transparent data-[state=active]:bg-secondary-600 data-[state=active]:text-white data-[state=active]:shadow-none';

/**
 * Übersetzer — DeepL text and document translation with the account glossary.
 * Language pickers come from DeepL's own list (cached server-side); nothing is
 * hardcoded here, so a new DeepL language shows up without a deploy.
 */
const UebersetzerPage = () => {
  const languages = useTranslationLanguages();
  // Both live here rather than in `TextTranslator` because reading an image
  // ends by writing into the text tab and switching to it. Owning the text in
  // one place makes that an ordinary state update instead of a handover
  // protocol between two tabs — and it is why the text now survives a tab
  // switch, which Radix would otherwise throw away by unmounting the panel.
  const [tab, setTab] = useState('text');
  const [text, setText] = useState('');

  return (
    <PageContainer
      maxWidth="lg"
      title="Übersetzer"
      subtitle="Texte und Dokumente mit DeepL übersetzen — das Grünen-Glossar wird automatisch angewendet."
    >
      {languages.isPending ? (
        <div className="flex flex-col gap-md" aria-busy="true" aria-label="Lade Sprachen">
          <Skeleton className="h-11 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : languages.isError ? (
        <Alert
          variant={
            languages.error instanceof TranslationNotConfiguredError ? 'default' : 'destructive'
          }
          role={languages.error instanceof TranslationNotConfiguredError ? 'status' : 'alert'}
        >
          <AlertDescription>{languages.error.message}</AlertDescription>
        </Alert>
      ) : (
        <Tabs value={tab} onValueChange={setTab}>
          {/* The design's pill pair, but still a real Radix tablist — two bare
              buttons would drop the tab/tabpanel wiring the page has today. */}
          <TabsList className="mb-lg h-auto gap-xs bg-transparent p-0">
            <TabsTrigger value="text" className={TAB_CLS}>
              <PiTextAa aria-hidden="true" />
              Text
            </TabsTrigger>
            <TabsTrigger value="dokument" className={TAB_CLS}>
              <PiFileText aria-hidden="true" />
              Dokument
            </TabsTrigger>
            <TabsTrigger value="bild" className={TAB_CLS}>
              <PiImage aria-hidden="true" />
              Bild
            </TabsTrigger>
          </TabsList>
          {/* Radix unmounts whatever tab is not on top. That is fine for a
              panel that only holds a form, but these two hold a paid-for
              answer: coming back to a fresh `TextTranslator` means an empty
              result pane and a debounce that sends the *unchanged* text to
              DeepL a second time, billed again against the Bäume budget; a
              fresh `DocumentTranslator` has lost the job id, the only handle
              on a document DeepL has already translated. So both stay mounted
              and are merely hidden. `forceMount` alone would show them next to
              the active tab — Radix then derives `hidden` from presence, which
              is now always true — but it spreads our props afterwards, so the
              explicit `hidden` wins. */}
          <TabsContent value="text" forceMount hidden={tab !== 'text'}>
            <TextTranslator data={languages.data} text={text} onTextChange={setText} />
          </TabsContent>
          <TabsContent value="dokument" forceMount hidden={tab !== 'dokument'}>
            <DocumentTranslator data={languages.data} />
          </TabsContent>
          <TabsContent value="bild">
            <ImageTranslator
              onExtracted={(erkannt) => {
                setText(erkannt);
                setTab('text');
              }}
            />
          </TabsContent>
        </Tabs>
      )}
    </PageContainer>
  );
};

export default UebersetzerPage;
