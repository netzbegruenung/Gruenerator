import { ArticleCard } from '@gruenerator/ui';

// A single news/blog article card: source eyebrow, title, excerpt, relative date.
export function PressArticle() {
  return (
    <div style={{ maxWidth: 360 }}>
      <ArticleCard
        url="#"
        source="taz"
        title="Grüne fordern kommunales Förderprogramm für Wärmepumpen"
        excerpt="Die Landtagsfraktion will Kommunen beim Heizungstausch unterstützen und plant dafür einen Klimafonds von 40 Millionen Euro."
        publishedAt={new Date(Date.now() - 5 * 3600 * 1000).toISOString()}
      />
    </div>
  );
}

// A two-up grid of article cards as it would appear in a press monitor.
export function NewsFeed() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, maxWidth: 720 }}>
      <ArticleCard
        url="#"
        source="Zeit Online"
        title="Bundestag debattiert über schnelleren Ausbau der Windkraft"
        excerpt="Eine grüne Initiative will Genehmigungsverfahren für Windräder an Land deutlich verkürzen."
        publishedAt={new Date(Date.now() - 18 * 3600 * 1000).toISOString()}
      />
      <ArticleCard
        url="#"
        source="Süddeutsche"
        title="Mehr Geld für den Nahverkehr: Länder begrüßen Vorschlag"
        excerpt="Das 49-Euro-Ticket soll dauerhaft abgesichert und der Takt auf dem Land verbessert werden."
        publishedAt={new Date(Date.now() - 3 * 86400 * 1000).toISOString()}
      />
    </div>
  );
}

// Minimal variant: title + source only, no excerpt or date.
export function HeadlineOnly() {
  return (
    <div style={{ maxWidth: 360 }}>
      <ArticleCard
        url="#"
        source="Pressestelle"
        title="Klimaschutz entscheidet sich in den Kommunen vor Ort"
      />
    </div>
  );
}
