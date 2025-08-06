export const examplePages = {
    'gruene-vision-2030': {
        id: 'gruene-vision-2030',
        title: 'Unsere Vision für 2030',
        subtitle: 'Gemeinsam für eine nachhaltige und gerechte Zukunft in Deutschland',
        author: 'Die Grünen',
        readTime: '8 min',
        headerAlignment: 'center',
        content: [
            {
                type: 'paragraph',
                text: 'Die kommenden Jahre sind entscheidend für die Zukunft unseres Planeten und unserer Gesellschaft. Als Grüne haben wir eine klare Vision: Deutschland soll bis 2030 zu einem Vorreiter für Klimaschutz, soziale Gerechtigkeit und nachhaltige Entwicklung werden.'
            },
            {
                type: 'heading2',
                text: 'Klimaschutz als Chance begreifen'
            },
            {
                type: 'paragraph',
                text: 'Der Klimawandel ist die größte Herausforderung unserer Zeit. Doch wir sehen ihn auch als Chance für Innovation, neue Arbeitsplätze und eine lebenswerte Zukunft. Unser Weg führt über eine konsequente Energiewende, nachhaltige Mobilität und eine Wirtschaft, die im Einklang mit der Natur steht.'
            },
            {
                type: 'quote',
                text: 'Klimaschutz ist nicht nur eine Aufgabe für die Politik, sondern eine Chance für jeden Einzelnen, Teil der Lösung zu werden.',
                author: 'Annalena Baerbock',
                title: 'Bundesaußenministerin'
            },
            {
                type: 'infoBox',
                title: 'Unsere Kernziele bis 2030',
                variant: 'success',
                items: [
                    'Klimaneutralität in der Energieversorgung',
                    'Verdopplung des öffentlichen Nahverkehrs',
                    '80% weniger CO₂-Emissionen gegenüber 1990',
                    'Vollständiger Kohleausstieg',
                    '1 Million neue Arbeitsplätze in grünen Branchen'
                ]
            },
            {
                type: 'heading3',
                text: 'Soziale Gerechtigkeit und Teilhabe'
            },
            {
                type: 'paragraph',
                text: 'Eine nachhaltige Gesellschaft ist nur dann erfolgreich, wenn alle Menschen daran teilhaben können. Wir setzen uns für bezahlbaren Wohnraum, gute Bildung für alle und ein Sozialsystem ein, das niemanden zurücklässt.'
            },
            {
                type: 'factBox',
                facts: [
                    { number: '400.000', label: 'Neue Wohnungen pro Jahr' },
                    { number: '100%', label: 'Erneuerbare Energie' },
                    { number: '15€', label: 'Mindestlohn bis 2025' },
                    { number: '0€', label: 'Studiengebühren' }
                ]
            },
            {
                type: 'heading3',
                text: 'Digitale Transformation gestalten'
            },
            {
                type: 'paragraph',
                text: 'Die Digitalisierung bietet enorme Chancen für Nachhaltigkeit, Bildung und gesellschaftliche Teilhabe. Wir wollen eine digitale Infrastruktur aufbauen, die allen zugute kommt und gleichzeitig unsere Werte von Datenschutz und digitaler Souveränität wahrt.'
            },
            {
                type: 'timeline',
                items: [
                    {
                        date: '2025',
                        title: 'Digitale Grundrechte',
                        content: 'Verankerung digitaler Grundrechte im Grundgesetz und Ausbau der digitalen Infrastruktur'
                    },
                    {
                        date: '2027',
                        title: 'Grüne Digitalisierung',
                        content: 'Alle Rechenzentren laufen mit 100% erneuerbarer Energie'
                    },
                    {
                        date: '2030',
                        title: 'Digitale Teilhabe',
                        content: 'Flächendeckende Breitbandversorgung und digitale Kompetenz für alle Generationen'
                    }
                ]
            },
            {
                type: 'callout',
                title: 'Werde Teil der Bewegung',
                text: 'Die Zukunft gestalten wir nur gemeinsam. Engagiere dich in deiner Nachbarschaft, werde Mitglied oder unterstütze unsere Arbeit mit einer Spende.',
                buttonText: 'Jetzt mitmachen',
                buttonHref: 'https://www.gruene.de/mitmachen'
            },
            {
                type: 'paragraph',
                text: 'Unsere Vision für 2030 ist ambitioniert, aber realistisch. Mit mutiger Politik, innovativen Lösungen und dem Engagement aller können wir Deutschland zu einem Vorbild für eine nachhaltige und gerechte Zukunft machen. Die Zeit zu handeln ist jetzt.'
            }
        ]
    },

    'klimaschutz-konkret': {
        id: 'klimaschutz-konkret',
        title: 'Klimaschutz konkret',
        subtitle: 'Praktische Schritte für eine klimaneutrale Zukunft',
        author: 'Grüne Umweltpolitik',
        readTime: '5 min',
        headerAlignment: 'left',
        content: [
            {
                type: 'paragraph',
                text: 'Klimaschutz beginnt mit konkreten Maßnahmen. Hier zeigen wir auf, wie wir gemeinsam die Klimaziele erreichen können - von der Politik bis zum persönlichen Alltag.'
            },
            {
                type: 'infoBox',
                title: 'Wusstest du schon?',
                variant: 'default',
                content: 'Deutschland hat sich verpflichtet, bis 2045 klimaneutral zu werden. Das bedeutet: In nur zwei Jahrzehnten müssen wir unsere gesamte Wirtschaft umstellen.'
            },
            {
                type: 'heading2',
                text: 'Energiewende beschleunigen'
            },
            {
                type: 'paragraph',
                text: 'Der Ausbau erneuerbarer Energien ist der Schlüssel zum Klimaschutz. Wir brauchen mehr Windkraft, Solarenergie und innovative Speichertechnologien.'
            },
            {
                type: 'quote',
                text: 'Jedes installierte Windrad ist ein Schritt weg von fossilen Brennstoffen und hin zu einer sauberen Zukunft.',
                author: 'Robert Habeck',
                title: 'Bundeswirtschaftsminister'
            },
            {
                type: 'factBox',
                facts: [
                    { number: '65%', label: 'Erneuerbare bis 2030' },
                    { number: '30.000', label: 'MW neue Windkraft' },
                    { number: '200', label: 'GW Solarenergie' }
                ]
            }
        ]
    }
};

export const getPageById = (id) => {
    return examplePages[id] || null;
};

export const getAllPageIds = () => {
    return Object.keys(examplePages);
};