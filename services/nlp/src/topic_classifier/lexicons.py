"""Topic lexicons for German news article classification.

Ported from bundestag-analysis (noun_analysis/lexicons/topics.py).
21 political topic categories (the last eight from #5670, for party documents).
Includes multi-label support for terms spanning multiple topics, and compound
matching for German compounds the lexicon does not list (see get_topic_labels).

The category ids are F0: they land in Qdrant `themes`/`primary_topic` and in
`topicCategorySchema` (packages/contracts). Add, never rename — and add them
there, or the API drops the new value silently.

Note: spaCy de_core_news_lg handles lemmatization, so plural forms
(e.g. "wälder" → "wald") are intentionally excluded to prevent
double-counting.
"""

from enum import Enum


class TopicCategory(Enum):
    MIGRATION = "migration"
    KLIMA = "klima"
    WIRTSCHAFT = "wirtschaft"
    SOZIALES = "soziales"
    SICHERHEIT = "sicherheit"
    GESUNDHEIT = "gesundheit"
    EUROPA = "europa"
    DIGITAL = "digital"
    BILDUNG = "bildung"
    FINANZEN = "finanzen"
    JUSTIZ = "justiz"
    ARBEIT = "arbeit"
    MOBILITAET = "mobilitaet"
    WOHNEN = "wohnen"
    LANDWIRTSCHAFT = "landwirtschaft"
    TIERSCHUTZ = "tierschutz"
    GLEICHSTELLUNG = "gleichstellung"
    DEMOKRATIE = "demokratie"
    KULTUR = "kultur"
    KOMMUNALES = "kommunales"
    PARTEI = "partei"


TOPIC_CATEGORY_INFO: dict[TopicCategory, dict] = {
    TopicCategory.MIGRATION: {"name": "Migration", "description": "Flucht, Asyl, Einwanderung", "color": "#f59e0b"},
    TopicCategory.KLIMA: {"name": "Klima & Umwelt", "description": "Klimaschutz, Energie, Nachhaltigkeit", "color": "#22c55e"},
    TopicCategory.WIRTSCHAFT: {"name": "Wirtschaft", "description": "Unternehmen, Industrie, Handel", "color": "#3b82f6"},
    TopicCategory.SOZIALES: {"name": "Soziales", "description": "Rente, Familie, Armut", "color": "#ec4899"},
    TopicCategory.SICHERHEIT: {"name": "Sicherheit", "description": "Polizei, Verteidigung, Terrorismus", "color": "#6366f1"},
    TopicCategory.GESUNDHEIT: {"name": "Gesundheit", "description": "Krankenhaus, Pflege, Medizin", "color": "#14b8a6"},
    TopicCategory.EUROPA: {"name": "Europa/Außen", "description": "EU, Außenpolitik, Ukraine", "color": "#8b5cf6"},
    TopicCategory.DIGITAL: {"name": "Digitales & Medien", "description": "Internet, Daten, Technologie", "color": "#06b6d4"},
    TopicCategory.BILDUNG: {"name": "Bildung", "description": "Schule, Universität, Forschung", "color": "#f97316"},
    TopicCategory.FINANZEN: {"name": "Finanzen", "description": "Steuern, Haushalt, Schulden", "color": "#eab308"},
    TopicCategory.JUSTIZ: {"name": "Justiz/Recht", "description": "Gerichte, Gesetze, Verfassung", "color": "#78716c"},
    TopicCategory.ARBEIT: {"name": "Arbeit", "description": "Lohn, Gewerkschaft, Beschäftigung", "color": "#84cc16"},
    TopicCategory.MOBILITAET: {"name": "Mobilität", "description": "Verkehr, Bahn, Auto, ÖPNV", "color": "#0ea5e9"},
    TopicCategory.WOHNEN: {"name": "Wohnen & Bauen", "description": "Miete, Wohnungsbau, Stadtentwicklung", "color": "#d946ef"},
    TopicCategory.LANDWIRTSCHAFT: {"name": "Landwirtschaft & Ernährung", "description": "Bauernhöfe, Lebensmittel, ländlicher Raum", "color": "#10b981"},
    TopicCategory.TIERSCHUTZ: {"name": "Tierschutz", "description": "Tierhaltung, Tierversuche, Tierheime", "color": "#f43f5e"},
    TopicCategory.GLEICHSTELLUNG: {"name": "Gleichstellung & Vielfalt", "description": "Frauen, Queer, Antidiskriminierung", "color": "#a855f7"},
    TopicCategory.DEMOKRATIE: {"name": "Demokratie", "description": "Rechtsextremismus, Wahlrecht, Beteiligung", "color": "#ef4444"},
    TopicCategory.KULTUR: {"name": "Kultur & Sport", "description": "Kunst, Kulturförderung, Vereine, Sport", "color": "#be185d"},
    TopicCategory.KOMMUNALES: {"name": "Kommunales", "description": "Kommunen, Landkreise, Kommunalfinanzen", "color": "#64748b"},
    TopicCategory.PARTEI: {"name": "Partei intern", "description": "Satzung, Delegierte, Gremien, Wahlkampf", "color": "#52525b"},
}


TOPIC_LEXICONS: dict[TopicCategory, set[str]] = {
    TopicCategory.MIGRATION: {
        "migration", "migrant", "asyl", "asylbewerber",
        "flüchtling", "einwanderung", "einwanderer",
        "zuwanderung", "zuwanderer", "abschiebung", "rückführung",
        "geflüchtete", "schutzsuchende", "asylsuchende",
        "bamf", "asylverfahren", "aufenthaltstitel",
        "aufenthaltsstatus", "duldung", "abschiebehaft", "aufnahmelager",
        "erstaufnahme", "ankerzentrum",
        "grenzschutz", "grenzkontrollen", "frontex", "obergrenze",
        "familiennachzug", "integrationsgesetz", "dublin", "schengen",
        "asylrecht", "asylgesetz", "aufenthaltsgesetz", "einwanderungsgesetz",
        "migrationsabkommen", "rücknahmeabkommen", "drittstaaten",
        "kriegsflüchtlinge", "bootsflüchtlinge", "mittelmeer",
        "balkanroute", "schlepper", "schleuser", "menschenschmuggel",
        "integrationskurs", "sprachkurs", "deutschkurs",
        "einbürgerung", "staatsangehörigkeit", "aufenthaltserlaubnis",
        "schutzstatus", "subsidiär", "asylantrag", "asylbescheid",
        "bleiberecht", "abschiebeverbot", "sichere-herkunftsstaaten",
        "ausländerbehörde", "flüchtlingsheim", "flüchtlingsunterkunft",
        "asylunterkunft", "sammelunterkunft", "gemeinschaftsunterkunft",
        # 2024-2026 terms
        "bezahlkarte", "ruanda-modell", "sicherheitspaket", "geas",
        "drittstaatenlösung", "zurückweisung", "migrationspaket",
        "grenzverfahren", "abschiebungsoffensive",
    },

    TopicCategory.KLIMA: {
        "klima", "klimaschutz", "klimawandel", "klimakrise", "klimaziel",
        "klimaneutral", "klimaneutralität", "emission",
        "co2", "treibhausgas", "erderwärmung",
        "klimaabkommen", "pariser-abkommen", "klimakonferenz",
        "klimapolitik", "klimaanpassung", "klimaschutzgesetz",
        "emissionshandel", "co2-preis", "extremwetter",
        "energiewende", "erneuerbar",
        "windkraft", "windenergie", "windrad", "windpark",
        "solarenergie", "photovoltaik", "solaranlage", "solarpanel",
        "wasserstoff", "wasserstoffstrategie", "grüner-wasserstoff",
        "energieeffizienz", "geothermie", "biomasse",
        "kohle", "kohleausstieg", "kohlekraftwerk", "braunkohle",
        "steinkohle", "atomkraft", "kernenergie", "atomausstieg",
        "kernkraftwerk", "akw", "erdgas", "lng", "fracking", "erdöl",
        "umwelt", "umweltschutz", "naturschutz", "biodiversität",
        "artensterben", "artenschutz", "ökosystem", "ökologie",
        "nachhaltigkeit", "nachhaltig", "wald",
        "waldsterben", "moor",
        "umweltpolitik", "gewässerschutz", "bodenschutz",
        "wärmepumpe", "fernwärme", "dämmung", "gebäudesanierung",
        "stromnetz", "stromtrasse", "offshore", "onshore",
        "luftverschmutzung", "feinstaub", "stickoxid", "abgas",
        "plastikmüll", "recycling", "kreislaufwirtschaft",
        "mikroplastik", "pestizide",
        # 2024-2026 terms
        "heizungsgesetz", "geg", "klimageld", "e-fuels", "taxonomie",
        "pfas", "schwammstadt", "hochwasserschutz", "klimaanpassungsgesetz",
    },

    TopicCategory.WIRTSCHAFT: {
        "unternehmen", "firma", "betrieb",
        "konzern", "mittelstand", "handwerk",
        "selbstständige", "freiberufler", "gründer", "startup",
        "existenzgründung", "unternehmertum",
        "industrie", "industriestandort", "produktion", "fertigung",
        "fabrik", "maschinenbau", "automobilindustrie",
        "chemieindustrie", "stahlindustrie", "pharmaindustrie",
        "wettbewerbsfähigkeit", "konkurrenz",
        "marktanteil", "marktwirtschaft", "monopol",
        "kartell", "wettbewerbsrecht", "fusionskontrolle",
        "export", "import", "außenhandel",
        "handel", "handelsabkommen", "freihandel", "zoll",
        "handelspartner", "handelsbeziehungen", "lieferkette",
        "konjunktur", "rezession", "wachstum", "wirtschaftswachstum",
        "bruttoinlandsprodukt", "bip", "deflation",
        "wirtschaftskrise", "wirtschaftspolitik",
        "beschäftigung",
        "qualifikation", "insolvenz", "pleite",
        "investition", "kapital",
        "finanzierung", "kredit", "subvention",
        # 2024-2026 terms
        "deindustrialisierung", "bürokratieabbau", "wachstumschancengesetz",
        "lieferkettengesetz", "fachkräfteeinwanderung", "wirtschaftswende",
        "standortwettbewerb",
    },

    TopicCategory.SOZIALES: {
        "rentner", "rentnerin", "altersarmut",
        "rentenanspruch", "rentenniveau",
        "grundrente", "riester", "betriebsrente", "altersvorsorge",
        "armut", "kinderarmut", "existenzminimum", "grundsicherung",
        "bürgergeld", "hartz", "arbeitslosengeld", "sozialhilfe",
        "bedürftige", "obdachlose", "obdachlosigkeit", "tafel",
        "alleinerziehende", "kindergeld",
        "kinderzuschlag", "elterngeld", "elternzeit", "mutterschutz",
        "sozialleistung", "sozialstaat",
        "sozialsystem", "sozialpolitik", "umverteilung",
        "transferleistung", "wohlfahrt", "fürsorge",
        "behinderung", "inklusion", "barrierefreiheit",
        "altenpflege", "seniorenheim", "altershilfe",
        "jugendarbeit", "jugendhilfe",
        "jugendamt", "kinderkrippe",
        # 2024-2026 terms
        "kindergrundsicherung", "aktienrente", "generationenkapital",
        "rentenpaket", "einsamkeit", "familienstartzeit",
    },

    TopicCategory.SICHERHEIT: {
        "polizei", "polizist", "polizeibehörde",
        "bundespolizei", "landespolizei", "kriminalpolizei",
        "polizeieinsatz", "polizeigewalt", "polizeipräsenz",
        "kriminalität", "verbrechen", "straftat",
        "straftäter", "gewalttat",
        "mord", "totschlag", "raub", "diebstahl", "einbruch",
        "betrug", "korruption", "geldwäsche", "organisierte-kriminalität",
        "terrorismus", "terror", "terrorist",
        "terroranschlag", "anschlag", "attentat", "extremismus",
        "radikalisierung", "gefährder", "islamismus", "dschihadismus",
        "bundeswehr", "soldat", "soldatin", "streitkräfte",
        "verteidigung", "verteidigungsetat", "militär", "armee",
        "rüstung", "waffenlieferung", "panzer", "kampfjet",
        "bündnisfall", "abschreckung", "verteidigungsfähigkeit",
        "geheimdienst", "verfassungsschutz", "bnd", "nachrichtendienst",
        "überwachung", "spionage", "cyberangriff", "cyberattacke",
        "sicherheitsbehörde", "innere-sicherheit",
        "videoüberwachung", "deradikalisierung",
        # 2024-2026 terms
        "messerangriff", "clankriminalität", "kriegstüchtigkeit",
        "zivilschutz", "zeitenwende", "wehrpflicht", "wehrdienst",
        "resilienz", "munition", "munitionsbeseitigung",
    },

    TopicCategory.GESUNDHEIT: {
        "krankenhaus", "klinik",
        "krankenkasse", "krankenversicherung",
        "gesundheitssystem", "gesundheitswesen", "gesundheitspolitik",
        "arzt", "ärztin", "medizin", "mediziner",
        "facharzt", "hausarzt", "krankheit",
        "behandlung", "therapie", "operation", "notaufnahme",
        "rettungsdienst", "krankenstand",
        "medikament", "arzneimittel", "impfung",
        "impfstoff", "impfpflicht", "impfquote", "vakzin",
        "apotheke", "pharma",
        "pflegekraft", "pflegepersonal",
        "krankenpflege", "pflegenotstand",
        "pflegeversicherung", "pflegegrad", "pflegegeld",
        "psychiatrie", "psychotherapie",
        "depression", "burnout", "sucht", "suchtberatung",
        "vorsorge", "gesundheitsamt", "epidemie",
        "pandemie", "corona", "covid", "infektion", "infektionsschutz",
        "quarantäne", "rki", "fallzahl", "inzidenz",
        "krankenhausreform", "gesundheitsreform", "fallpauschale",
        "zusatzbeitrag", "leistungskatalog",
        # 2024-2026 terms
        "kliniksterben", "cannabis", "legalisierung", "telemedizin",
        "long-covid", "digitale-gesundheitsanwendung",
    },

    TopicCategory.EUROPA: {
        "europa", "europäisch", "europäische-union", "brüssel",
        "eu-kommission", "eu-parlament", "europarat",
        "europäischer-rat", "ezb", "eurozone", "schengen",
        "mitgliedsstaat", "eu-beitritt",
        "eu-austritt", "brexit", "binnenmarkt", "freizügigkeit",
        "eu-recht", "eu-richtlinie", "eu-verordnung",
        "außenpolitik", "außenminister", "diplomatie", "diplomat",
        "botschafter", "sanktion",
        "embargo", "völkerrecht", "menschenrechte",
        "ukraine", "ukrainer", "ukrainisch", "kiew", "selensky",
        "russland", "russisch", "putin", "kreml", "moskau",
        "angriffskrieg", "kriegsverbrechen",
        "waffenlieferungen", "wiederaufbau",
        "china", "chinesisch", "usa", "amerika", "amerikanisch",
        "israel", "nahost", "iran", "türkei", "afrika",
        "uno", "vereinte-nationen", "g7", "g20", "weltbank",
        "iwf", "wto", "osze",
        "gipfel", "gipfeltreffen", "abkommen",
        "kooperation",
        "frieden", "friedensprozess", "waffenstillstand",
        # 2024-2026 terms
        "gaza", "hamas", "nahostkonflikt", "trump", "taiwan",
        "handelszoll", "asylkompromiss", "eu-erweiterung",
    },

    TopicCategory.DIGITAL: {
        "digital", "digitalisierung", "internet", "online",
        "netzwerk", "breitband", "glasfaser",
        "mobilfunk", "5g", "netzausbau", "funkloch",
        "datenschutz", "dsgvo", "datensicherheit",
        "datensouveränität", "algorithmus",
        "big-data", "datenverarbeitung", "datenbank",
        "technologie", "künstliche-intelligenz", "ki",
        "maschinelles-lernen", "automatisierung", "roboter",
        "software", "hardware", "computer", "chip", "halbleiter",
        "social-media", "e-commerce",
        "onlinehandel", "streaming", "cloud", "server",
        "rechenzentrum", "digitalwirtschaft",
        "e-government", "onlinezugangsgesetz", "bürgerportal",
        "digitale-verwaltung", "registermodernisierung",
        "elektronische-patientenakte",
        "gründerszene",
        "forschung-und-entwicklung", "venture-capital",
        "cybersicherheit", "hacker", "hackerangriff",
        "it-sicherheit", "verschlüsselung", "malware",
        "öffentlich-rechtlich", "rundfunk", "pressefreiheit",
        "desinformation", "fake-news", "medienkompetenz",
        # 2024-2026 terms
        "tiktok", "chatgpt", "ai-act", "ki-verordnung", "deepfake",
        "cyberabwehr", "plattformregulierung",
    },

    TopicCategory.BILDUNG: {
        "bildungspolitik", "bildungssystem",
        "schule", "schüler", "schülerin",
        "grundschule", "gymnasium", "realschule", "hauptschule",
        "gesamtschule", "berufsschule", "schulpflicht", "schulabschluss",
        "abitur", "mittlere-reife", "schulreform",
        "lehrer", "lehrerin", "lehrkraft",
        "lehrermangel", "unterricht", "lehrplan", "bildungsplan",
        "klassenzimmer", "schulklasse", "digitaler-unterricht",
        "universität", "hochschule",
        "studium", "student", "studentin",
        "studierende", "professor", "professorin", "dozent",
        "bafög", "studiengebühren", "semesterbeitrag",
        "bachelor", "master", "promotion", "doktorand",
        "wissenschaft", "wissenschaftler",
        "wissenschaftlerin", "wissenschaftsfreiheit",
        "grundlagenforschung", "forschungsförderung",
        "exzellenzinitiative", "drittmittel", "dfg",
        "ausbildung", "azubi", "auszubildende", "berufsausbildung",
        "duale-ausbildung", "lehrling", "meisterbrief",
        "ausbildungsplatz", "betriebliche-ausbildung",
        "krippe",
        "vorschule", "erzieher", "erzieherin", "frühkindliche-bildung",
        "weiterbildung", "fortbildung", "qualifizierung",
        "erwachsenenbildung", "volkshochschule", "umschulung",
        # 2024-2026 terms
        "startchancen-programm", "pisa-studie", "bildungsnotstand",
        "quereinsteiger", "ganztagsanspruch",
    },

    TopicCategory.FINANZEN: {
        "steuer", "steuerzahler", "steuersenkung",
        "steuererhöhung", "einkommensteuer", "mehrwertsteuer",
        "unternehmenssteuer", "körperschaftsteuer", "gewerbesteuer",
        "erbschaftsteuer", "vermögensteuer", "steuerpolitik",
        "steuergerechtigkeit", "steuerhinterziehung", "steuerflucht",
        "bundeshaushalt", "haushaltsentwurf",
        "haushaltsplan", "etat", "finanzplan", "haushaltsausschuss",
        "haushaltssperre", "haushaltsdefizit",
        "staatsschulden", "verschuldung", "neuverschuldung",
        "schuldenbremse", "tilgung", "schuldenstand",
        "maastricht-kriterien", "defizit", "überschuss",
        "öffentliche-investitionen",
        "infrastrukturinvestition", "sondervermögen",
        "konjunkturpaket", "konjunkturprogramm",
        "sparkasse", "finanzmarkt",
        "börse", "aktie", "leitzins",
        "geldpolitik", "währung",
        "subvention", "fördermittel",
        "zuschuss", "finanzhilfe", "staatshilfe", "rettungspaket",
        "entlastung", "steuerentlastung",
        "finanzminister", "finanzministerium", "bundesbank",
        "rechnungshof", "bundesrechnungshof", "finanzamt",
        # 2024-2026 terms
        "nachtragshaushalt", "schuldenstreit", "kinderfreibetrag",
        "haushaltskrise", "solidaritätszuschlag",
    },

    TopicCategory.JUSTIZ: {
        "gericht", "richter", "richterin",
        "bundesverfassungsgericht", "bundesgerichtshof",
        "verwaltungsgericht", "amtsgericht", "landgericht",
        "oberlandesgericht", "europäischer-gerichtshof",
        "gesetzgebung", "gesetzesänderung", "novelle", "verordnung", "vorschrift",
        "rechtsprechung", "urteil",
        "grundgesetz", "verfassung", "verfassungsrecht",
        "grundrechte", "rechtsstaatlichkeit",
        "rechtsstaat", "verfassungswidrig", "verfassungskonform",
        "strafrecht", "straftat",
        "strafverfolgung", "staatsanwaltschaft", "staatsanwalt",
        "anklage", "angeklagte", "verurteilung", "freispruch",
        "haft", "gefängnis", "bewährung", "strafmaß",
        "zivilrecht", "kläger", "beklagte",
        "schadenersatz", "haftung", "vertragsrecht",
        "anwalt", "rechtsanwalt", "verteidiger",
        "justizminister", "justizministerium", "justizreform",
    },

    TopicCategory.ARBEIT: {
        "arbeitnehmer", "arbeitnehmerin",
        "beschäftigte", "belegschaft", "angestellte", "arbeiter",
        "arbeiterin", "arbeitskraft",
        "lohn", "gehalt", "einkommen",
        "mindestlohn", "tariflohn", "lohnerhöhung", "lohndumping",
        "lohnfortzahlung", "lohngerechtigkeit", "niedriglohn",
        "gewerkschaft", "tarifvertrag",
        "tarifverhandlung", "tarifkonflikt", "arbeitskampf",
        "streik", "warnstreik", "betriebsrat", "mitbestimmung",
        "arbeitgeberverband", "sozialpartner", "tarifbindung",
        "arbeitsplatz", "beschäftigung",
        "vollzeit", "teilzeit", "minijob", "leiharbeit",
        "zeitarbeit", "befristung", "unbefristet", "festanstellung",
        "arbeitsvertrag", "kündigung", "kündigungsschutz",
        "arbeitslosigkeit", "arbeitslose", "erwerbslose",
        "arbeitslosenquote", "langzeitarbeitslose", "jobcenter",
        "arbeitsagentur", "bundesagentur-für-arbeit",
        "arbeitszeit", "überstunden", "homeoffice", "telearbeit",
        "arbeitsschutz", "arbeitssicherheit", "gesundheitsschutz",
        "work-life-balance", "vereinbarkeit",
        "sozialversicherung", "rentenversicherung", "arbeitslosenversicherung",
        "unfallversicherung", "sozialabgaben", "beitragssatz",
        # 2024-2026 terms
        "vier-tage-woche", "tariftreuegesetz", "fachkräfteeinwanderung",
        "quiet-quitting", "workation",
    },

    TopicCategory.MOBILITAET: {
        "öpnv", "nahverkehr", "fernverkehr", "personenverkehr",
        "bahnhof", "haltestelle", "busverkehr", "straßenbahn",
        "s-bahn", "u-bahn", "regionalbahn", "ice",
        "bahn", "deutsche-bahn", "schiene", "schienennetz",
        "bahnstrecke", "zugverkehr", "schienenverkehr",
        "bahnverbindung", "zugverbindung", "pünktlichkeit",
        "auto", "pkw", "fahrzeug",
        "autobahn", "straßenverkehr",
        "stau", "tempolimit", "geschwindigkeitsbegrenzung",
        "führerschein", "fahrerlaubnis", "kfz",
        "elektromobilität", "e-auto", "elektroauto", "elektrofahrzeug",
        "ladesäule", "ladeinfrastruktur", "ladepunkt", "wallbox",
        "flughafen", "flugzeug", "flugverkehr", "luftverkehr",
        "fluglinie", "inlandsflüge",
        "schiff", "schifffahrt", "hafen",
        "binnenschifffahrt", "seeverkehr", "containerhafen",
        "fahrrad", "radverkehr", "radweg",
        "fußverkehr", "fußgänger", "gehweg",
        "verkehrswende", "verkehrspolitik", "mobilitätswende",
        "verkehrsinfrastruktur", "verkehrsminister",
        "deutschlandticket", "49-euro-ticket",
        # 2024-2026 terms
        "verbrenner-aus", "e-scooter", "antriebswende", "sanierungsstau",
        "brückenprüfung", "bundesverkehrswegeplan", "radverkehrsnetz",
    },

    TopicCategory.WOHNEN: {
        "wohnen", "wohnung", "wohnungsbau", "wohnungsnot", "wohnungsmarkt",
        "wohnraum", "wohnungslosigkeit", "wohnungslose", "wohnungspolitik",
        "miete", "mieter", "mieterin", "mieterschutz", "mietrecht", "mietspiegel",
        "mietpreis", "mietpreisbremse", "mietendeckel", "mieterhöhung", "vermieter",
        "sozialwohnung", "sozialer-wohnungsbau", "wohngeld", "wohngeld-plus",
        "eigenheim", "wohneigentum", "baugenehmigung", "bauland", "bebauungsplan",
        "bauordnung", "bauen", "bauwende", "wohnungsneubau", "leerstand", "zweckentfremdung",
        "wohnheim", "studierendenwohnheim", "genossenschaft", "wohnungsgenossenschaft",
        "stadtentwicklung", "städtebau", "quartier", "landesentwicklungsplan",
        "eigenbedarf", "zwangsräumung", "hessengeld",
    },

    TopicCategory.LANDWIRTSCHAFT: {
        "landwirtschaft", "landwirt", "landwirtin", "bäuerin",
        "bauernhof", "agrar", "agrarpolitik", "agrarwende", "agrarförderung",
        "ökolandbau", "biolandbau", "bio-landwirtschaft", "ackerbau", "acker",
        "dünger", "düngeverordnung", "glyphosat", "pflanzenschutzmittel",
        "ernte", "saatgut", "gentechnik", "ernährung", "ernährungspolitik",
        "lebensmittel", "nahrungsmittel", "lebensmittelverschwendung",
        "schulessen", "schulverpflegung", "gemeinschaftsverpflegung",
        "verbraucherschutz", "milch", "milchpreis", "weinbau", "forstwirtschaft",
        "fischerei", "flächenverbrauch", "flächenversiegelung", "artenvielfalt",
        "ländlicher-raum", "gap",
    },

    TopicCategory.TIERSCHUTZ: {
        "tierschutz", "tierwohl", "tierhaltung", "massentierhaltung",
        "nutztierhaltung", "tiertransport", "tierversuch", "tierheim",
        "tierrecht", "tierschutzgesetz", "tierschutzbeauftragte",
        "stallpflicht", "käfighaltung", "anbindehaltung", "schlachthof",
        "wildtier", "haustier", "jagd", "tierquälerei", "pelz",
    },

    TopicCategory.GLEICHSTELLUNG: {
        "gleichstellung", "gleichberechtigung", "diskriminierung",
        "antidiskriminierung", "gleichbehandlung", "gleichbehandlungsgesetz", "agg",
        "frauenhaus", "frauenpolitik", "frauentag", "frauenquote", "frauenrechte",
        "frauenförderung", "frauenhass", "femizid", "gewaltschutz", "gewalthilfe",
        "gewalthilfegesetz", "istanbul-konvention", "sexismus", "belästigung",
        "parität", "paritätsgesetz", "gender", "gender-pay-gap", "lohnlücke",
        "feminismus", "queer", "queerpolitik", "lsbtiq", "lgbtq", "csd",
        "homosexualität", "transfeindlichkeit", "queerfeindlichkeit",
        "selbstbestimmungsgesetz", "vielfalt", "diversität", "rassismus",
        "antirassismus", "antisemitismus", "antiziganismus", "muslimfeindlichkeit",
        "teilhabe", "chancengleichheit",
    },

    TopicCategory.DEMOKRATIE: {
        "demokratie", "demokratieförderung", "demokratiefördergesetz",
        "rechtsextremismus", "rechtsextremist", "rechtsruck", "rechtspopulismus",
        "neonazi", "afd-verbot", "parteiverbot", "faschismus",
        "wahlrecht", "wahlalter", "wahlbeteiligung", "wahlrechtsreform",
        "bürgerbeteiligung", "bürgerrat", "bürgerentscheid", "volksbegehren",
        "volksentscheid", "volksabstimmung", "direkte-demokratie",
        "zivilgesellschaft", "ehrenamt",
        "lobbyregister", "lobbyismus", "untersuchungsausschuss",
        "erinnerungskultur", "gedenken", "gedenkstätte", "verfassungstreue",
        "hetze", "hassrede", "hasskriminalität", "politische-bildung",
        "untersuchungsausschuss",
    },

    TopicCategory.KULTUR: {
        "kultur", "kulturpolitik", "kulturförderung", "kunst", "künstler",
        "künstlerin", "theater", "museum", "oper", "orchester", "konzert",
        "bibliothek", "denkmalschutz", "denkmal", "kulturerbe", "festival",
        "clubkultur", "film", "filmförderung", "literatur", "musikschule",
        "soziokultur", "kreativwirtschaft", "raubkunst", "raubgut",
        "sport", "sportverein", "sportförderung", "sportstätte", "sportpolitik",
        "schwimmbad", "breitensport", "spitzensport", "olympia", "fußball",
        "verein", "religion", "kirche", "religionspolitik", "religionsgemeinschaft",
    },

    TopicCategory.KOMMUNALES: {
        "kommune", "kommunalpolitik", "kommunalfinanzen", "kommunalwahl",
        "kommunalverwaltung", "kommunalaufsicht", "kommunalabgabe",
        "gemeinde", "gemeinderat", "stadtrat", "kreistag", "landkreis",
        "landrat", "landrätin", "bürgermeister", "bürgermeisterin",
        "oberbürgermeister", "stadtverwaltung", "kreisverwaltung",
        "gebietsreform", "kreisgebietsreform", "daseinsvorsorge",
        "kommunalfinanzausgleich", "finanzausgleich", "konnexität",
        "stadtwerk", "bezirk", "bezirksamt", "ortsteil", "ortschaftsrat",
        "dorf", "dorfentwicklung",
    },

    TopicCategory.PARTEI: {
        "satzung", "satzungsänderung", "statut", "geschäftsordnung",
        "delegierte", "delegierter", "landesvorstand",
        "bundesvorstand", "kreisvorstand", "parteirat", "landesparteirat",
        "länderrat",
        "parteitag", "mitgliederversammlung", "landesmitgliederversammlung",
        "kreisverband", "ortsverband", "urabstimmung", "urwahl",
        "antragskommission", "beisitzer", "beisitzerin", "schatzmeister",
        "schatzmeisterin", "mitgliedsbeitrag", "mitgliederentwicklung",
        "landesarbeitsgemeinschaft", "bundesarbeitsgemeinschaft", "lag", "bag",
        "listenaufstellung", "landesliste", "wahlversammlung", "spitzenkandidat",
        "spitzenkandidatin", "sondierung", "sondierungsgespräch",
        "koalitionsgespräch", "koalitionsverhandlung",
        "wahlkampf", "strukturreform", "parteistruktur",
        "protokoll", "frauenstatut", "vielfaltsstatut", "bundesfinanzrat",
    },
}


# Multi-label support for terms spanning multiple topics
TOPIC_MULTI_LABEL: dict[str, list[tuple[TopicCategory, float]]] = {
    "pflege": [(TopicCategory.GESUNDHEIT, 1.0), (TopicCategory.SOZIALES, 0.7)],
    "pflegekraft": [(TopicCategory.GESUNDHEIT, 1.0), (TopicCategory.ARBEIT, 0.5)],
    "pflegeheim": [(TopicCategory.GESUNDHEIT, 0.8), (TopicCategory.SOZIALES, 0.8)],
    "altenpflege": [(TopicCategory.GESUNDHEIT, 0.8), (TopicCategory.SOZIALES, 0.8)],
    "rente": [(TopicCategory.SOZIALES, 1.0), (TopicCategory.FINANZEN, 0.5)],
    "rentenversicherung": [(TopicCategory.SOZIALES, 0.8), (TopicCategory.FINANZEN, 0.8)],
    "ukraine": [(TopicCategory.EUROPA, 1.0), (TopicCategory.SICHERHEIT, 0.7)],
    "waffenlieferungen": [(TopicCategory.EUROPA, 0.7), (TopicCategory.SICHERHEIT, 1.0)],
    "waffenlieferung": [(TopicCategory.EUROPA, 0.7), (TopicCategory.SICHERHEIT, 1.0)],
    "nato": [(TopicCategory.EUROPA, 0.7), (TopicCategory.SICHERHEIT, 1.0)],
    "bündnisfall": [(TopicCategory.EUROPA, 0.7), (TopicCategory.SICHERHEIT, 1.0)],
    "energie": [(TopicCategory.KLIMA, 1.0), (TopicCategory.WIRTSCHAFT, 0.5)],
    "energiewende": [(TopicCategory.KLIMA, 1.0), (TopicCategory.WIRTSCHAFT, 0.6)],
    "energiepreise": [(TopicCategory.KLIMA, 0.5), (TopicCategory.WIRTSCHAFT, 1.0)],
    "fachkräftemangel": [(TopicCategory.ARBEIT, 1.0), (TopicCategory.WIRTSCHAFT, 0.7)],
    "fachkräfte": [(TopicCategory.ARBEIT, 1.0), (TopicCategory.WIRTSCHAFT, 0.6)],
    "arbeitskräfte": [(TopicCategory.ARBEIT, 1.0), (TopicCategory.WIRTSCHAFT, 0.5)],
    "integration": [(TopicCategory.MIGRATION, 1.0), (TopicCategory.SOZIALES, 0.5)],
    "integrationskurs": [(TopicCategory.MIGRATION, 1.0), (TopicCategory.BILDUNG, 0.5)],
    "kita": [(TopicCategory.SOZIALES, 0.8), (TopicCategory.BILDUNG, 0.8)],
    "kindergarten": [(TopicCategory.SOZIALES, 0.8), (TopicCategory.BILDUNG, 0.8)],
    "kinderbetreuung": [(TopicCategory.SOZIALES, 1.0), (TopicCategory.BILDUNG, 0.5)],
    "e-rezept": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.GESUNDHEIT, 0.7)],
    "elektronische-patientenakte": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.GESUNDHEIT, 0.7)],
    "cyberangriff": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.SICHERHEIT, 0.8)],
    "cyberattacke": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.SICHERHEIT, 0.8)],
    "cybersicherheit": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.SICHERHEIT, 0.8)],
    "forschung": [(TopicCategory.BILDUNG, 1.0), (TopicCategory.WIRTSCHAFT, 0.4)],
    # New multi-label entries from evaluation
    "schuldenbremse": [(TopicCategory.FINANZEN, 1.0), (TopicCategory.WIRTSCHAFT, 0.6)],
    "bürgergeld": [(TopicCategory.SOZIALES, 1.0), (TopicCategory.ARBEIT, 0.6)],
    "ki": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.WIRTSCHAFT, 0.5)],
    "künstliche-intelligenz": [(TopicCategory.DIGITAL, 1.0), (TopicCategory.WIRTSCHAFT, 0.5)],
    "klimaschutz": [(TopicCategory.KLIMA, 1.0), (TopicCategory.WIRTSCHAFT, 0.4)],
    "fachkräfteeinwanderung": [(TopicCategory.ARBEIT, 0.8), (TopicCategory.MIGRATION, 0.8)],
    "datenschutz": [(TopicCategory.DIGITAL, 0.8), (TopicCategory.JUSTIZ, 0.8)],
    "burnout": [(TopicCategory.GESUNDHEIT, 0.8), (TopicCategory.ARBEIT, 0.8)],
    "inflation": [(TopicCategory.FINANZEN, 1.0), (TopicCategory.WIRTSCHAFT, 0.7)],
    "untersuchungsausschuss": [(TopicCategory.DEMOKRATIE, 0.8), (TopicCategory.JUSTIZ, 0.8)],
    "prävention": [(TopicCategory.GESUNDHEIT, 0.7), (TopicCategory.SICHERHEIT, 0.7)],
    # Political actors as topic signals (distinctive names with clear portfolios)
    "habeck": [(TopicCategory.WIRTSCHAFT, 1.0), (TopicCategory.KLIMA, 0.7)],
    "lauterbach": [(TopicCategory.GESUNDHEIT, 1.0)],
    "faeser": [(TopicCategory.SICHERHEIT, 1.0), (TopicCategory.MIGRATION, 0.7)],
    "lindner": [(TopicCategory.FINANZEN, 1.0)],
    "wissing": [(TopicCategory.DIGITAL, 0.8), (TopicCategory.MOBILITAET, 0.8)],
    "stark-watzinger": [(TopicCategory.BILDUNG, 1.0)],
    "özdemir": [(TopicCategory.KLIMA, 0.8), (TopicCategory.SOZIALES, 0.5)],
    "heil": [(TopicCategory.ARBEIT, 1.0), (TopicCategory.SOZIALES, 0.7)],
    "paus": [(TopicCategory.SOZIALES, 1.0)],
    "baerbock": [(TopicCategory.EUROPA, 1.0)],
    "pistorius": [(TopicCategory.SICHERHEIT, 1.0)],
    "geywitz": [(TopicCategory.SOZIALES, 0.8)],
}


# Pre-built reverse lookup: lemma → TopicCategory (for single-label words)
_TOPIC_LOOKUP: dict[str, TopicCategory] | None = None

# Compound matching (#5670). German policy text is compound-heavy, and the
# lexicon can never list every "Radverkehrsnetz" or "Frauenhausplatz". A lemma
# that is not a lexicon term itself borrows the labels of a lexicon term it
# ends with (the head: "kinder|armut") or, failing that, starts with (the
# modifier: "klima|stiftung", "umwelt|ausschuss") — in policy compounds the
# modifier usually names the field.
#
# Both parts need COMPOUND_MIN_PART characters: shorter terms ("auto", "bahn",
# "haft") are prefixes of too many unrelated words ("Autonomie", "Haftung").
COMPOUND_MIN_PART = 5
# A modifier match is not a compound when only a derivational ending follows:
# "steuer|ung" is Steuerung, not a tax.
_DERIVATIONAL_ENDINGS = frozenset({
    "ung", "ungen", "heit", "keit", "lich", "ler", "nis", "tum", "isch",
    "ismus", "ist", "istin", "erin", "ern", "ers", "ens",
})
# Lexicon terms that are fine as whole words but mislead as a compound part:
# "Regierungsbildung" is not about schools, "Zusammenarbeit" not about jobs.
_NO_COMPOUND = frozenset({
    "bildung", "handel", "verkehr", "arbeit", "verein", "kultur", "kunst",
    "sport", "wachstum", "frieden", "gipfel", "abkommen", "europa", "kirche",
    "bauen", "wohnen", "agrar", "verfassung", "demokratie", "online", "tafel",
    "netzwerk", "betrieb", "finanzierung", "verordnung", "vorschrift", "novelle",
    "gesetzgebung", "produktion", "kapital",
})
# Lemmas that parse as "lexicon term + word" but are not that compound.
_NOT_A_COMPOUND = frozenset({"lebensmittelpunkt"})
_COMPOUND_TERMS: tuple[str, ...] | None = None
_COMPOUND_CACHE: dict[str, list[tuple[TopicCategory, float]]] = {}


def _build_topic_lookup() -> dict[str, TopicCategory]:
    lookup: dict[str, TopicCategory] = {}
    for topic, terms in TOPIC_LEXICONS.items():
        for term in terms:
            if term not in TOPIC_MULTI_LABEL:
                lookup[term] = topic
    return lookup


def _exact_labels(term: str) -> list[tuple[TopicCategory, float]]:
    if term in TOPIC_MULTI_LABEL:
        return TOPIC_MULTI_LABEL[term]

    global _TOPIC_LOOKUP
    if _TOPIC_LOOKUP is None:
        _TOPIC_LOOKUP = _build_topic_lookup()

    topic = _TOPIC_LOOKUP.get(term)
    return [(topic, 1.0)] if topic else []


def _compound_terms() -> tuple[str, ...]:
    """Lexicon terms usable as compound parts, longest first."""
    global _COMPOUND_TERMS
    if _COMPOUND_TERMS is None:
        terms = {t for ts in TOPIC_LEXICONS.values() for t in ts} | set(TOPIC_MULTI_LABEL)
        _COMPOUND_TERMS = tuple(sorted(
            (t for t in terms
             if len(t) >= COMPOUND_MIN_PART and t.isalpha() and t not in _NO_COMPOUND),
            key=len, reverse=True,
        ))
    return _COMPOUND_TERMS


def _compound_labels(lemma: str) -> list[tuple[TopicCategory, float]]:
    cached = _COMPOUND_CACHE.get(lemma)
    if cached is not None:
        return cached
    labels: list[tuple[TopicCategory, float]] = []
    if len(lemma) >= 2 * COMPOUND_MIN_PART and lemma.isalpha() and lemma not in _NOT_A_COMPOUND:
        terms = _compound_terms()
        head = next(
            (t for t in terms if lemma.endswith(t) and len(lemma) - len(t) >= COMPOUND_MIN_PART),
            None,
        )
        if head:
            labels = _exact_labels(head)
        else:
            modifier = next(
                (t for t in terms
                 if lemma.startswith(t)
                 and len(lemma) - len(t) >= COMPOUND_MIN_PART - 2
                 and lemma[len(t):] not in _DERIVATIONAL_ENDINGS),
                None,
            )
            if modifier:
                labels = _exact_labels(modifier)
    _COMPOUND_CACHE[lemma] = labels
    return labels


def get_topic_labels(lemma: str) -> list[tuple[TopicCategory, float]]:
    """Get all topic labels for a lemma with weights.

    Returns list of (TopicCategory, weight) tuples.
    Empty list for uncategorized words. An exact lexicon term wins; otherwise
    the lemma is tried as a compound of a lexicon term (see _compound_labels).
    """
    lemma_lower = lemma.lower()
    return _exact_labels(lemma_lower) or _compound_labels(lemma_lower)
