import { memo } from 'react';

const DOCUMENT_HTML = `<h1>Antrag: Ausbau des Radwegenetzes</h1>
<p>Der Kreisverband möge beschließen, den Ausbau sicherer Radwege in der Innenstadt mit höchster Priorität voranzutreiben.</p>
<h2>Begründung</h2>
<p>Die aktuelle Verkehrssituation gefährdet täglich Radfahrer*innen. Sichere Radinfrastruktur ist zentral für die Verkehrswende und den Klimaschutz unserer Kommune.</p>
<ul><li>Radverkehrsanteil auf 30% erhöhen</li><li>Geschützte Radstreifen auf Hauptstraßen</li><li>Sichere Kreuzungsgestaltung nach niederländischem Vorbild</li></ul>
<h2>Finanzierung</h2>
<p>Die Mittel sollen aus dem Bundesförderprogramm für nachhaltige Mobilität beantragt werden. Der Eigenanteil der Kommune beträgt 20% der Gesamtkosten.</p>
<h2>Umsetzung</h2>
<p>Die Verwaltung wird beauftragt, innerhalb von sechs Monaten einen Umsetzungsplan vorzulegen.</p>`;

const contentClass = [
  'outline-none px-7 md:px-8 py-7 md:py-8',
  'font-[PT_Sans,Arial,sans-serif] leading-relaxed text-foreground',
  '[&_h1]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h1]:text-base [&_h1]:font-bold [&_h1]:leading-tight [&_h1]:mb-2 [&_h1]:mt-0',
  '[&_h2]:font-[Raleway,PT_Sans,Arial,sans-serif] [&_h2]:text-xs [&_h2]:font-semibold [&_h2]:leading-snug [&_h2]:mt-3 [&_h2]:mb-1',
  '[&_p]:text-[11px] [&_p]:mb-1.5 [&_p]:mt-0 [&_p]:leading-relaxed',
  '[&_ul]:text-[11px] [&_ul]:mb-1.5 [&_ul]:pl-4',
  '[&_li]:mb-0.5',
  '[&_strong]:font-semibold',
].join(' ');

const DocumentsMock = memo(function DocumentsMock() {
  return (
    <div className="w-full h-full flex items-center justify-center p-2 md:p-sm lg:p-md">
      <div className="w-full max-w-[340px] aspect-[210/240] bg-white dark:bg-grey-900 shadow-[0_2px_20px_rgba(0,0,0,0.08)] dark:shadow-[0_2px_20px_rgba(0,0,0,0.3)] overflow-hidden relative">
        <div
          className={contentClass}
          contentEditable
          suppressContentEditableWarning
          dangerouslySetInnerHTML={{ __html: DOCUMENT_HTML }}
        />
        <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-white dark:from-grey-900 to-transparent pointer-events-none" />
      </div>
    </div>
  );
});

export default DocumentsMock;
