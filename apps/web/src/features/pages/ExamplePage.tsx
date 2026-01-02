import { PageView, PageHeader, PageContent, QuoteBlock, InfoBox, FactBox, CalloutBlock } from './index';
import { getPageById } from './data/examplePages';

// Example 1: Using structured data
export const StructuredExamplePage = () => {
    const pageData = getPageById('gruene-vision-2030');

    return <PageView pageData={pageData} />;
};

// Example 2: Using JSX directly
export const CustomExamplePage = () => {
    return (
        <PageView>
            <PageHeader
                title="Grüne Politik erleben"
                subtitle="Ein praktischer Leitfaden für nachhaltige Veränderung"
                author="Lokale Grüne Basis"
                readTime="6 min"
                alignment="left"
            />

            <PageContent>
                <p>
                    Politik ist kein abstraktes Konzept, sondern wirkt sich direkt auf unser tägliches Leben aus.
                    Hier zeigen wir, wie grüne Politik konkret funktioniert und wie jeder von uns einen Beitrag
                    leisten kann.
                </p>

                <QuoteBlock
                    text="Veränderung beginnt nicht in den Parlamenten, sondern in den Köpfen und Herzen der Menschen."
                    author="Cem Özdemir"
                    title="Bundeslandwirtschaftsminister"
                />

                <h2>Was bedeutet grüne Politik?</h2>

                <p>
                    Grüne Politik denkt langfristig und ganzheitlich. Wir berücksichtigen nicht nur die
                    wirtschaftlichen Auswirkungen unserer Entscheidungen, sondern auch die sozialen und
                    ökologischen Folgen.
                </p>

                <InfoBox
                    title="Grundprinzipien grüner Politik"
                    variant="success"
                    items={[
                        "Nachhaltigkeit in allen Bereichen",
                        "Soziale Gerechtigkeit für alle",
                        "Demokratie und Bürgerbeteiligung",
                        "Friedliche Konfliktlösung",
                        "Respekt vor der Natur und allen Lebewesen"
                    ]}
                />

                <h3>Erfolge der letzten Jahre</h3>

                <p>
                    Die grüne Bewegung hat bereits viel erreicht. Von der Energiewende über die
                    Verkehrswende bis hin zu neuen Standards in der Landwirtschaft - grüne Ideen
                    werden zu konkreter Politik.
                </p>

                <FactBox
                    facts={[
                        { number: "50%", label: "Erneuerbare Energie" },
                        { number: "3 Mio", label: "Grüne Arbeitsplätze" },
                        { number: "15%", label: "Bio-Landwirtschaft" },
                        { number: "500+", label: "Grüne Bürgermeister" }
                    ]}
                />

                <CalloutBlock
                    title="Werde aktiv in deiner Region"
                    text="Politik findet nicht nur in Berlin statt. Engagiere dich vor Ort und gestalte deine Gemeinde mit!"
                    buttonText="Ortsverband finden"
                    buttonHref="https://www.gruene.de/ortsverbände"
                />

                <h3>Wie kannst du mitmachen?</h3>

                <p>
                    Demokratie lebt von der Beteiligung aller. Ob als Mitglied, als Unterstützer oder
                    einfach als interessierte Bürgerin - es gibt viele Wege, sich für eine grüne
                    Zukunft einzusetzen.
                </p>

                <InfoBox
                    title="Mitmach-Möglichkeiten"
                    variant="default"
                >
                    <p>
                        <strong>Mitglied werden:</strong> Gestalte aktiv die Programmatik und Kandidatenauswahl mit.<br/>
                        <strong>Ehrenamt:</strong> Engagiere dich in Arbeitskreisen oder bei Veranstaltungen.<br/>
                        <strong>Spenden:</strong> Unterstütze unsere Arbeit finanziell.<br/>
                        <strong>Wählen:</strong> Gib deine Stimme bei Wahlen ab.
                    </p>
                </InfoBox>
            </PageContent>
        </PageView>
    );
};
