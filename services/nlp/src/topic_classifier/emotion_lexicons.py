"""Emotion lexicons for German political news analysis.

7 emotion categories with German terms for detecting the emotional
register of news coverage. Designed for political communication monitoring.

Based on bundestag-analysis adjective/verb lexicons, adapted for news text.

Note: Terms are chosen to express emotional *stance*, not mere description.
Descriptive/factual news vocabulary (e.g. "Krise", "Risiko", "Rückgang")
is intentionally excluded to reduce false positives in journalistic text.
"""

from enum import Enum


class EmotionCategory(Enum):
    ANGST = "angst"
    WUT = "wut"
    HOFFNUNG = "hoffnung"
    ENTTAEUSCHUNG = "enttaeuschung"
    VERTRAUEN = "vertrauen"
    SOLIDARITAET = "solidaritaet"
    STOLZ = "stolz"


EMOTION_CATEGORY_INFO: dict[EmotionCategory, dict] = {
    EmotionCategory.ANGST: {
        "name": "Angst",
        "description": "Furcht, Bedrohung, Unsicherheit",
        "color": "#ef4444",
        "comms": "Beruhigen. Kompetenz zeigen. 'Wir haben einen Plan.'",
    },
    EmotionCategory.WUT: {
        "name": "Wut",
        "description": "Empörung, Skandal, Zorn",
        "color": "#f97316",
        "comms": "Wut kanalisieren oder Distanz wahren.",
    },
    EmotionCategory.HOFFNUNG: {
        "name": "Hoffnung",
        "description": "Zuversicht, Fortschritt, Optimismus",
        "color": "#22c55e",
        "comms": "Verstärken. Eigene Marke mit Optimismus verbinden.",
    },
    EmotionCategory.ENTTAEUSCHUNG: {
        "name": "Enttäuschung",
        "description": "Frustration, Versagen, Ernüchterung",
        "color": "#3b82f6",
        "comms": "Alternative sein (wenn nicht über uns). Anerkennen (wenn über uns).",
    },
    EmotionCategory.VERTRAUEN: {
        "name": "Vertrauen",
        "description": "Stabilität, Verlässlichkeit, Kompetenz",
        "color": "#8b5cf6",
        "comms": "Guter Moment für mutige Vorschläge.",
    },
    EmotionCategory.SOLIDARITAET: {
        "name": "Solidarität",
        "description": "Zusammenhalt, Gemeinschaft, Einigkeit",
        "color": "#10b981",
        "comms": "Koalitionsaufbau. 'Wir alle zusammen.'",
    },
    EmotionCategory.STOLZ: {
        "name": "Stolz",
        "description": "Erfolg, Anerkennung, Leistung",
        "color": "#eab308",
        "comms": "Erfolge beanspruchen. Eigene Arbeit sichtbar machen.",
    },
}


EMOTION_LEXICONS: dict[EmotionCategory, set[str]] = {
    EmotionCategory.ANGST: {
        # Nouns — emotional, not merely descriptive
        "angst", "panik", "schrecken", "furcht",
        "eskalation", "katastrophe", "zusammenbruch", "kollaps",
        "bedrängnis", "notlage", "existenzangst", "kriegsangst",
        "schreckensszenario", "ohnmacht",
        # Verbs
        "befürchten", "fürchten", "bangen",
        "eskalieren", "bedrohen", "gefährden", "alarmieren",
        # Adjectives — emotionally charged
        "bedrohlich", "prekär",
        "instabil", "existenzbedrohend", "alarmierend", "beunruhigend",
        "besorgniserregend", "beängstigend", "dramatisch",
        "verheerend", "fatal",
    },

    EmotionCategory.WUT: {
        # Nouns — expressing outrage, not just events
        "skandal", "empörung", "wut", "ärger", "aufschrei",
        "entrüstung", "zorn", "aufruhr",
        "wutbürger", "shitstorm", "hassrede", "hetze",
        # Verbs
        "empören", "anprangern", "attackieren",
        "beschuldigen", "vorwerfen", "brandmarken", "geißeln",
        # Adjectives
        "skandalös", "empörend", "unverantwortlich", "unerhört",
        "unverschämt", "dreist", "ungeheuerlich", "schändlich",
        "inakzeptabel", "schamlos", "unentschuldbar", "verwerflich",
        "rücksichtslos", "skrupellos", "verantwortungslos",
        "fassungslos",
    },

    EmotionCategory.HOFFNUNG: {
        # Nouns — expressing optimism/forward momentum
        "chance", "hoffnung", "fortschritt", "durchbruch",
        "aufbruch", "zukunft", "perspektive",
        "innovation", "wende", "aufstieg", "aufschwung",
        "lichtblick", "zuversicht", "mutmacher",
        # Verbs
        "gelingen", "vorankommen", "erreichen",
        "ermöglichen", "stärken", "aufbauen",
        "voranbringen", "verwirklichen",
        # Adjectives
        "optimistisch", "vielversprechend", "zukunftsfähig",
        "konstruktiv", "ermutigend", "hoffnungsvoll",
        "zuversichtlich", "chancenreich",
    },

    EmotionCategory.ENTTAEUSCHUNG: {
        # Nouns — expressing emotional frustration
        "enttäuschung", "frustration", "versagen",
        "rückschlag", "niederlage", "misserfolg",
        "resignation", "desillusionierung", "vertrauensverlust",
        # Verbs
        "scheitern", "versagen", "verfehlen", "enttäuschen",
        "resignieren", "aufgeben",
        # Adjectives
        "gescheitert", "verfehlt", "ernüchternd", "desillusioniert",
        "resigniert", "erfolglos", "wirkungslos", "mangelhaft",
        "unzureichend", "enttäuschend", "frustrierend", "bitter",
    },

    EmotionCategory.VERTRAUEN: {
        # Nouns — expressing trust/reliability
        "vertrauen", "stabilität", "verlässlichkeit",
        "kompetenz", "glaubwürdigkeit", "seriosität", "beständigkeit",
        "zuverlässigkeit", "integrität",
        "rückhalt", "planungssicherheit", "vertrauensvorschuss",
        # Verbs
        "vertrauen", "stabilisieren", "gewährleisten",
        "garantieren", "bewähren",
        # Adjectives
        "verlässlich", "stabil", "kompetent", "glaubwürdig",
        "bewährt", "solide", "verantwortungsvoll", "seriös",
        "professionell", "zuverlässig", "beständig", "integer",
    },

    EmotionCategory.SOLIDARITAET: {
        # Nouns — expressing togetherness
        "solidarität", "zusammenhalt", "gemeinschaft", "einigkeit",
        "hilfsbereitschaft", "beistand", "schulterschluss",
        "mitgefühl", "zusammenarbeit",
        "teamgeist", "gemeinsinn", "wir-gefühl",
        "brandmauer", "solidarpakt",
        # Verbs
        "zusammenstehen", "unterstützen", "helfen", "vereinen",
        "zusammenhalten", "kooperieren", "beistehen", "beitragen",
        "mithelfen", "zusammenwirken",
        # Adjectives
        "solidarisch", "gemeinsam", "vereint", "geschlossen",
        "partnerschaftlich", "verbunden", "miteinander",
        "überparteilich", "einig", "hilfsbereit", "füreinander",
    },

    EmotionCategory.STOLZ: {
        # Nouns — expressing pride/achievement
        "stolz", "anerkennung", "vorbild",
        "meilenstein", "meisterleistung",
        "auszeichnung", "triumph", "errungenschaft", "ehre",
        "vorreiterrolle", "aushängeschild", "glanzleistung",
        # Verbs
        "würdigen", "anerkennen", "feiern", "loben", "gratulieren",
        "ehren", "auszeichnen", "meistern", "brillieren",
        # Adjectives
        "herausragend", "vorbildlich", "beispielgebend", "historisch",
        "beeindruckend", "verdient", "exzellent", "preisgekrönt",
        "gefeiert", "überwältigend", "großartig", "bemerkenswert",
    },

}


# Pre-built reverse lookup
_EMOTION_LOOKUP: dict[str, EmotionCategory] | None = None


def _build_emotion_lookup() -> dict[str, EmotionCategory]:
    lookup: dict[str, EmotionCategory] = {}
    for emotion, terms in EMOTION_LEXICONS.items():
        for term in terms:
            lookup[term] = emotion
    return lookup


def get_emotion(lemma: str) -> EmotionCategory | None:
    global _EMOTION_LOOKUP
    if _EMOTION_LOOKUP is None:
        _EMOTION_LOOKUP = _build_emotion_lookup()
    return _EMOTION_LOOKUP.get(lemma.lower())
