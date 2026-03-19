"""Topic lexicons for German news article classification.

Ported from bundestag-analysis (noun_analysis/lexicons/topics.py).
13 political topic categories with 500+ German terms.
Includes multi-label support for terms spanning multiple topics.
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
        "migration", "migrant", "migranten", "asyl", "asylbewerber",
        "flüchtling", "flüchtlinge", "einwanderung", "einwanderer",
        "zuwanderung", "zuwanderer", "abschiebung", "rückführung",
        "geflüchtete", "schutzsuchende", "asylsuchende",
        "bamf", "asylverfahren", "aufenthaltstitel",
        "aufenthaltsstatus", "duldung", "abschiebehaft", "aufnahmelager",
        "erstaufnahme", "ankerzentrum", "ankerzentren",
        "grenze", "grenzschutz", "grenzkontrollen", "frontex", "obergrenze",
        "familiennachzug", "integrationsgesetz", "dublin", "schengen",
        "asylrecht", "asylgesetz", "aufenthaltsgesetz", "einwanderungsgesetz",
        "migrationsabkommen", "rücknahmeabkommen", "drittstaaten",
        "kriegsflüchtlinge", "bootsflüchtlinge", "mittelmeer",
        "balkanroute", "schlepper", "schleuser", "menschenschmuggel",
        "integration", "integrationskurs", "sprachkurs", "deutschkurs",
        "einbürgerung", "staatsangehörigkeit", "aufenthaltserlaubnis",
        "schutzstatus", "subsidiär", "asylantrag", "asylbescheid",
        "bleiberecht", "abschiebeverbot", "sichere-herkunftsstaaten",
        "ausländerbehörde", "flüchtlingsheim", "flüchtlingsunterkunft",
        "asylunterkunft", "sammelunterkunft", "gemeinschaftsunterkunft",
    },

    TopicCategory.KLIMA: {
        "klimaschutz", "klimawandel", "klimakrise", "klimaziel",
        "klimaneutral", "klimaneutralität", "emissionen", "emission",
        "co2", "treibhausgas", "treibhausgase", "erderwärmung",
        "klimaabkommen", "pariser-abkommen", "klimakonferenz",
        "klimapolitik", "klimaanpassung", "klimaschutzgesetz",
        "emissionshandel", "co2-preis", "extremwetter",
        "energie", "energiewende", "erneuerbar", "erneuerbare",
        "windkraft", "windenergie", "windrad", "windpark",
        "solarenergie", "photovoltaik", "solaranlage", "solarpanel",
        "wasserstoff", "wasserstoffstrategie", "grüner-wasserstoff",
        "energieeffizienz", "netzausbau", "geothermie", "biomasse",
        "kohle", "kohleausstieg", "kohlekraftwerk", "braunkohle",
        "steinkohle", "atomkraft", "kernenergie", "atomausstieg",
        "kernkraftwerk", "akw", "erdgas", "lng", "fracking", "erdöl",
        "umwelt", "umweltschutz", "naturschutz", "biodiversität",
        "artensterben", "artenschutz", "ökosystem", "ökologie",
        "nachhaltigkeit", "nachhaltig", "wald", "wälder",
        "waldsterben", "regenwälder", "moor", "moore",
        "umweltpolitik", "gewässerschutz", "bodenschutz",
        "wärmepumpe", "fernwärme", "dämmung", "gebäudesanierung",
        "stromnetz", "stromtrasse", "offshore", "onshore",
        "luftverschmutzung", "feinstaub", "stickoxid", "abgas",
        "müll", "plastikmüll", "recycling", "kreislaufwirtschaft",
        "mikroplastik", "pestizide",
    },

    TopicCategory.WIRTSCHAFT: {
        "unternehmen", "firma", "firmen", "betrieb", "betriebe",
        "konzern", "konzerne", "mittelstand", "handwerk",
        "selbstständige", "freiberufler", "gründer", "startup",
        "startups", "existenzgründung", "unternehmertum",
        "industrie", "industriestandort", "produktion", "fertigung",
        "fabrik", "werk", "werke", "maschinenbau", "automobilindustrie",
        "chemieindustrie", "stahlindustrie", "pharmaindustrie",
        "wettbewerb", "wettbewerbsfähigkeit", "konkurrenz", "markt",
        "märkte", "marktanteil", "marktwirtschaft", "monopol",
        "kartell", "wettbewerbsrecht", "fusionskontrolle",
        "export", "exporte", "import", "importe", "außenhandel",
        "handel", "handelsabkommen", "freihandel", "zoll", "zölle",
        "handelspartner", "handelsbeziehungen", "lieferkette",
        "konjunktur", "rezession", "wachstum", "wirtschaftswachstum",
        "bruttoinlandsprodukt", "bip", "inflation", "deflation",
        "wirtschaftskrise", "wirtschaftspolitik", "standort",
        "arbeitsplatz", "arbeitsplätze", "beschäftigung",
        "fachkräftemangel", "fachkräfte", "arbeitskräfte",
        "qualifikation", "insolvenz", "insolvenzen", "pleite",
        "investition", "investitionen", "kapital", "anlage",
        "finanzierung", "kredit", "kredite", "zinsen", "subvention",
    },

    TopicCategory.SOZIALES: {
        "rente", "renten", "rentner", "rentnerin", "altersarmut",
        "rentenversicherung", "rentenanspruch", "rentenniveau",
        "grundrente", "riester", "betriebsrente", "altersvorsorge",
        "armut", "kinderarmut", "existenzminimum", "grundsicherung",
        "bürgergeld", "hartz", "arbeitslosengeld", "sozialhilfe",
        "bedürftige", "obdachlose", "obdachlosigkeit", "tafel",
        "familie", "familien", "eltern", "kinder", "kind",
        "alleinerziehende", "kinderbetreuung", "kindergeld",
        "kinderzuschlag", "elterngeld", "elternzeit", "mutterschutz",
        "sozialleistung", "sozialleistungen", "sozialstaat",
        "sozialsystem", "sozialpolitik", "umverteilung",
        "transferleistung", "wohlfahrt", "fürsorge",
        "wohnung", "wohnungen", "miete", "mieten", "mietpreis",
        "wohnungsnot", "wohnungsmarkt", "mietpreisbremse",
        "sozialwohnung", "sozialer-wohnungsbau", "wohngeld",
        "behinderung", "behinderte", "inklusion", "barrierefreiheit",
        "pflegeheim", "altenpflege", "seniorenheim", "altershilfe",
        "jugend", "jugendliche", "jugendarbeit", "jugendhilfe",
        "jugendamt", "kita", "kindergarten", "kinderkrippe",
    },

    TopicCategory.SICHERHEIT: {
        "polizei", "polizist", "polizisten", "polizeibehörde",
        "bundespolizei", "landespolizei", "kriminalpolizei",
        "polizeieinsatz", "polizeigewalt", "polizeipräsenz",
        "kriminalität", "verbrechen", "straftat", "straftaten",
        "straftäter", "täter", "gewalt", "gewalttat",
        "mord", "totschlag", "raub", "diebstahl", "einbruch",
        "betrug", "korruption", "geldwäsche", "organisierte-kriminalität",
        "terrorismus", "terror", "terrorist", "terroristen",
        "terroranschlag", "anschlag", "angriff", "attentat", "extremismus",
        "radikalisierung", "gefährder", "islamismus", "dschihadismus",
        "bundeswehr", "soldat", "soldaten", "soldatin", "streitkräfte",
        "verteidigung", "verteidigungsetat", "militär", "armee",
        "rüstung", "waffen", "waffenlieferung", "panzer", "kampfjet",
        "nato", "bündnisfall", "abschreckung", "verteidigungsfähigkeit",
        "geheimdienst", "verfassungsschutz", "bnd", "nachrichtendienst",
        "überwachung", "spionage", "cyberangriff", "cyberattacke",
        "sicherheitsbehörde", "innere-sicherheit", "grenzschutz",
        "videoüberwachung", "prävention", "deradikalisierung",
    },

    TopicCategory.GESUNDHEIT: {
        "krankenhaus", "krankenhäuser", "klinik", "kliniken",
        "krankenkasse", "krankenkassen", "krankenversicherung",
        "gesundheitssystem", "gesundheitswesen", "gesundheitspolitik",
        "arzt", "ärzte", "ärztin", "medizin", "mediziner",
        "facharzt", "hausarzt", "kranke", "krankheit",
        "behandlung", "therapie", "operation", "notaufnahme",
        "notfall", "rettungsdienst", "krankenstand",
        "medikament", "medikamente", "arzneimittel", "impfung",
        "impfstoff", "impfpflicht", "impfquote", "vakzin",
        "apotheke", "rezept", "pharma", "pharmaindustrie",
        "pflege", "pflegekraft", "pflegekräfte", "pflegepersonal",
        "pflegeheim", "altenpflege", "krankenpflege", "pflegenotstand",
        "pflegeversicherung", "pflegegrad", "pflegegeld",
        "psyche", "psychisch", "psychiatrie", "psychotherapie",
        "depression", "burnout", "sucht", "suchtberatung",
        "prävention", "vorsorge", "gesundheitsamt", "epidemie",
        "pandemie", "corona", "covid", "infektion", "infektionsschutz",
        "quarantäne", "rki", "fallzahl", "inzidenz",
        "krankenhausreform", "gesundheitsreform", "fallpauschale",
        "zusatzbeitrag", "leistungskatalog",
    },

    TopicCategory.EUROPA: {
        "europa", "europäisch", "europäische-union", "brüssel",
        "eu-kommission", "eu-parlament", "europarat",
        "europäischer-rat", "ezb", "eurozone", "schengen",
        "mitgliedsstaat", "mitgliedsstaaten", "eu-beitritt",
        "eu-austritt", "brexit", "binnenmarkt", "freizügigkeit",
        "eu-recht", "eu-richtlinie", "eu-verordnung",
        "außenpolitik", "außenminister", "diplomatie", "diplomat",
        "botschafter", "sanktion", "sanktionen",
        "embargo", "völkerrecht", "menschenrechte",
        "ukraine", "ukrainer", "ukrainisch", "kiew", "selensky",
        "russland", "russisch", "putin", "kreml", "moskau",
        "krieg", "angriffskrieg", "kriegsverbrechen",
        "waffenlieferungen", "wiederaufbau",
        "china", "chinesisch", "usa", "amerika", "amerikanisch",
        "israel", "nahost", "iran", "türkei", "afrika",
        "uno", "vereinte-nationen", "g7", "g20", "weltbank",
        "iwf", "wto", "osze", "nato",
        "gipfel", "gipfeltreffen", "abkommen", "vertrag",
        "partnerschaft", "bündnis", "allianz", "kooperation",
        "frieden", "friedensprozess", "waffenstillstand",
    },

    TopicCategory.DIGITAL: {
        "digital", "digitalisierung", "internet", "online",
        "netz", "netzwerk", "breitband", "glasfaser",
        "mobilfunk", "5g", "netzausbau", "funkloch",
        "daten", "datenschutz", "dsgvo", "datensicherheit",
        "datensouveränität", "algorithmus", "algorithmen",
        "big-data", "datenverarbeitung", "datenbank",
        "technologie", "künstliche-intelligenz", "ki",
        "maschinelles-lernen", "automatisierung", "roboter",
        "software", "hardware", "computer", "chip", "halbleiter",
        "plattform", "plattformen", "social-media", "e-commerce",
        "onlinehandel", "streaming", "cloud", "server",
        "rechenzentrum", "digitalwirtschaft",
        "e-government", "onlinezugangsgesetz", "bürgerportal",
        "digitale-verwaltung", "registermodernisierung",
        "elektronische-patientenakte", "e-rezept",
        "startup", "startups", "gründerszene",
        "forschung-und-entwicklung", "venture-capital",
        "cybersicherheit", "cyberangriff", "hacker", "hackerangriff",
        "it-sicherheit", "verschlüsselung", "malware",
        "öffentlich-rechtlich", "rundfunk", "pressefreiheit",
        "desinformation", "fake-news", "medienkompetenz",
    },

    TopicCategory.BILDUNG: {
        "bildung", "bildungspolitik", "bildungssystem",
        "schule", "schulen", "schüler", "schülerin", "schülerinnen",
        "grundschule", "gymnasium", "realschule", "hauptschule",
        "gesamtschule", "berufsschule", "schulpflicht", "schulabschluss",
        "abitur", "mittlere-reife", "schulreform",
        "lehrer", "lehrerin", "lehrkraft", "lehrkräfte",
        "lehrermangel", "unterricht", "lehrplan", "bildungsplan",
        "klassenzimmer", "schulklasse", "digitaler-unterricht",
        "universität", "universitäten", "hochschule", "hochschulen",
        "studium", "student", "studenten", "studentin",
        "studierende", "professor", "professorin", "dozent",
        "bafög", "studiengebühren", "semesterbeitrag",
        "bachelor", "master", "promotion", "doktorand",
        "forschung", "wissenschaft", "wissenschaftler",
        "wissenschaftlerin", "wissenschaftsfreiheit",
        "grundlagenforschung", "forschungsförderung",
        "exzellenzinitiative", "drittmittel", "dfg",
        "ausbildung", "azubi", "auszubildende", "berufsausbildung",
        "duale-ausbildung", "lehrling", "meister", "meisterbrief",
        "ausbildungsplatz", "ausbildungsplätze", "betriebliche-ausbildung",
        "kita", "kindergarten", "kinderbetreuung", "krippe",
        "vorschule", "erzieher", "erzieherin", "frühkindliche-bildung",
        "weiterbildung", "fortbildung", "qualifizierung",
        "erwachsenenbildung", "volkshochschule", "umschulung",
    },

    TopicCategory.FINANZEN: {
        "steuer", "steuern", "steuerzahler", "steuersenkung",
        "steuererhöhung", "einkommensteuer", "mehrwertsteuer",
        "unternehmenssteuer", "körperschaftsteuer", "gewerbesteuer",
        "erbschaftsteuer", "vermögensteuer", "steuerpolitik",
        "steuergerechtigkeit", "steuerhinterziehung", "steuerflucht",
        "haushalt", "bundeshaushalt", "haushaltsentwurf",
        "haushaltsplan", "etat", "finanzplan", "haushaltsausschuss",
        "haushaltssperre", "haushaltsdefizit", "finanzierung",
        "schulden", "staatsschulden", "verschuldung", "neuverschuldung",
        "schuldenbremse", "tilgung", "schuldenstand",
        "maastricht-kriterien", "defizit", "überschuss",
        "investition", "investitionen", "öffentliche-investitionen",
        "infrastrukturinvestition", "sondervermögen",
        "konjunkturpaket", "konjunkturprogramm",
        "bank", "banken", "sparkasse", "finanzmarkt",
        "börse", "aktie", "aktien", "zinsen", "leitzins",
        "inflation", "geldpolitik", "währung",
        "subvention", "subventionen", "fördermittel",
        "zuschuss", "finanzhilfe", "staatshilfe", "rettungspaket",
        "entlastung", "steuerentlastung", "kosten",
        "finanzminister", "finanzministerium", "bundesbank",
        "rechnungshof", "bundesrechnungshof", "finanzamt",
    },

    TopicCategory.JUSTIZ: {
        "gericht", "gerichte", "richter", "richterin",
        "bundesverfassungsgericht", "bundesgerichtshof",
        "verwaltungsgericht", "amtsgericht", "landgericht",
        "oberlandesgericht", "europäischer-gerichtshof",
        "gesetzgebung", "gesetzesänderung", "novelle", "verordnung", "vorschrift",
        "rechtsprechung", "urteil", "urteile", "beschluss",
        "grundgesetz", "verfassung", "verfassungsrecht",
        "grundrechte", "menschenrechte", "rechtsstaatlichkeit",
        "rechtsstaat", "verfassungswidrig", "verfassungskonform",
        "strafe", "strafen", "strafrecht", "straftat", "straftaten",
        "strafverfolgung", "staatsanwaltschaft", "staatsanwalt",
        "anklage", "angeklagte", "verurteilung", "freispruch",
        "haft", "gefängnis", "bewährung", "strafmaß",
        "zivilrecht", "klage", "kläger", "beklagte",
        "schadenersatz", "haftung", "vertragsrecht", "mietrecht",
        "anwalt", "anwälte", "rechtsanwalt", "verteidiger",
        "justizminister", "justizministerium", "justizreform",
        "datenschutz", "verbraucherschutz",
        "diskriminierung", "gleichstellung", "gleichberechtigung",
    },

    TopicCategory.ARBEIT: {
        "arbeitnehmer", "arbeitnehmerin", "arbeitnehmerinnen",
        "beschäftigte", "belegschaft", "angestellte", "arbeiter",
        "arbeiterin", "arbeitskraft", "arbeitskräfte",
        "lohn", "löhne", "gehalt", "gehälter", "einkommen",
        "mindestlohn", "tariflohn", "lohnerhöhung", "lohndumping",
        "lohnfortzahlung", "lohngerechtigkeit", "niedriglohn",
        "gewerkschaft", "gewerkschaften", "tarifvertrag",
        "tarifverhandlung", "tarifkonflikt", "arbeitskampf",
        "streik", "warnstreik", "betriebsrat", "mitbestimmung",
        "arbeitgeberverband", "sozialpartner", "tarifbindung",
        "arbeitsplatz", "arbeitsplätze", "beschäftigung",
        "vollzeit", "teilzeit", "minijob", "leiharbeit",
        "zeitarbeit", "befristung", "unbefristet", "festanstellung",
        "arbeitsvertrag", "kündigung", "kündigungsschutz",
        "arbeitslosigkeit", "arbeitslose", "erwerbslose",
        "arbeitslosenquote", "langzeitarbeitslose", "jobcenter",
        "arbeitsagentur", "bundesagentur-für-arbeit",
        "arbeitszeit", "überstunden", "homeoffice", "telearbeit",
        "arbeitsschutz", "arbeitssicherheit", "gesundheitsschutz",
        "work-life-balance", "vereinbarkeit", "burnout",
        "sozialversicherung", "rentenversicherung", "arbeitslosenversicherung",
        "unfallversicherung", "sozialabgaben", "beitragssatz",
    },

    TopicCategory.MOBILITAET: {
        "öpnv", "nahverkehr", "fernverkehr", "personenverkehr",
        "bahnhof", "haltestelle", "busverkehr", "straßenbahn",
        "s-bahn", "u-bahn", "regionalbahn", "ice",
        "bahn", "deutsche-bahn", "schiene", "schienennetz",
        "gleise", "bahnstrecke", "zugverkehr", "schienenverkehr",
        "bahnverbindung", "zugverbindung", "pünktlichkeit",
        "auto", "autos", "pkw", "fahrzeug", "fahrzeuge",
        "autobahn", "straße", "straßen", "straßenverkehr",
        "verkehr", "stau", "tempolimit", "geschwindigkeitsbegrenzung",
        "führerschein", "fahrerlaubnis", "kfz",
        "elektromobilität", "e-auto", "elektroauto", "elektrofahrzeug",
        "ladesäule", "ladeinfrastruktur", "ladepunkt", "wallbox",
        "flughafen", "flugzeug", "flugverkehr", "luftverkehr",
        "fluglinie", "flug", "fliegen", "inlandsflüge",
        "schiff", "schiffe", "schifffahrt", "hafen", "häfen",
        "binnenschifffahrt", "seeverkehr", "containerhafen",
        "fahrrad", "fahrräder", "radverkehr", "radweg", "radwege",
        "fußverkehr", "fußgänger", "gehweg",
        "verkehrswende", "verkehrspolitik", "mobilitätswende",
        "infrastruktur", "verkehrsinfrastruktur", "verkehrsminister",
        "deutschlandticket", "49-euro-ticket",
    },
}


# Multi-label support for terms spanning multiple topics
TOPIC_MULTI_LABEL: dict[str, list[tuple[TopicCategory, float]]] = {
    "pflege": [(TopicCategory.GESUNDHEIT, 1.0), (TopicCategory.SOZIALES, 0.7)],
    "pflegekraft": [(TopicCategory.GESUNDHEIT, 1.0), (TopicCategory.ARBEIT, 0.5)],
    "pflegekräfte": [(TopicCategory.GESUNDHEIT, 1.0), (TopicCategory.ARBEIT, 0.5)],
    "pflegeheim": [(TopicCategory.GESUNDHEIT, 0.8), (TopicCategory.SOZIALES, 0.8)],
    "altenpflege": [(TopicCategory.GESUNDHEIT, 0.8), (TopicCategory.SOZIALES, 0.8)],
    "rente": [(TopicCategory.SOZIALES, 1.0), (TopicCategory.FINANZEN, 0.5)],
    "renten": [(TopicCategory.SOZIALES, 1.0), (TopicCategory.FINANZEN, 0.5)],
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
