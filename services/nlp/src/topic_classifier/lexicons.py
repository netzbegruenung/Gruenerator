"""Topic lexicons for German news article classification.

Ported from bundestag-analysis (noun_analysis/lexicons/topics.py).
13 political topic categories with 500+ German terms.
Includes multi-label support for terms spanning multiple topics.

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
        "klimaschutz", "klimawandel", "klimakrise", "klimaziel",
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
        "wohnungsnot", "wohnungsmarkt", "mietpreisbremse",
        "sozialwohnung", "sozialer-wohnungsbau", "wohngeld",
        "behinderung", "inklusion", "barrierefreiheit",
        "altenpflege", "seniorenheim", "altershilfe",
        "jugendarbeit", "jugendhilfe",
        "jugendamt", "kinderkrippe",
        # 2024-2026 terms
        "kindergrundsicherung", "aktienrente", "generationenkapital",
        "rentenpaket", "wohngeld-plus", "einsamkeit", "familienstartzeit",
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
        "resilienz",
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
        "schadenersatz", "haftung", "vertragsrecht", "mietrecht",
        "anwalt", "rechtsanwalt", "verteidiger",
        "justizminister", "justizministerium", "justizreform",
        "verbraucherschutz",
        "diskriminierung", "gleichstellung", "gleichberechtigung",
        # 2024-2026 terms
        "parteiverbot", "verfassungstreue", "demokratiefördergesetz",
        "afd-verbot",
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
        "brückenprüfung",
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


def _build_topic_lookup() -> dict[str, TopicCategory]:
    lookup: dict[str, TopicCategory] = {}
    for topic, terms in TOPIC_LEXICONS.items():
        for term in terms:
            if term not in TOPIC_MULTI_LABEL:
                lookup[term] = topic
    return lookup


def get_topic_labels(lemma: str) -> list[tuple[TopicCategory, float]]:
    """Get all topic labels for a lemma with weights.

    Returns list of (TopicCategory, weight) tuples.
    Empty list for uncategorized words.
    """
    lemma_lower = lemma.lower()

    if lemma_lower in TOPIC_MULTI_LABEL:
        return TOPIC_MULTI_LABEL[lemma_lower]

    global _TOPIC_LOOKUP
    if _TOPIC_LOOKUP is None:
        _TOPIC_LOOKUP = _build_topic_lookup()

    topic = _TOPIC_LOOKUP.get(lemma_lower)
    if topic:
        return [(topic, 1.0)]
    return []
