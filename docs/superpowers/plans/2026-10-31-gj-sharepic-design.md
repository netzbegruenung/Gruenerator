# GJ-Sharepic-Design (DE + AT) — Mapping und Plan

Stand 31.10.2026. Grundlage: `design/styleguide-gj-de-2024.*`, `design/styleguide-gj-at-2026.*` und `design/social-korpus-gj/` im intern-Repo.

## Wo die Marke heute entschieden wird

| Einstieg | Stelle | Heute | Neu |
| --- | --- | --- | --- |
| Chat | `apps/api/routes/chat/services/intentHandlers/sharepic.ts` `runSharepicGeneration` | `locale` aus `state.userLocale` | `brand` aus den eigenen Worten der Person (`ownWords`), nur hier — diese Funktion läuft nur bei erkannter Sharepic-Bestellung |
| Chat, Überarbeitung | `reviseCreatorSharepic` → `draftSharepic(current)` | behält `current.locale` | behält zusätzlich `current.brand` |
| Chat, Vorlage | `resolveVorlage` | Vorlage muss zum Land passen | Vorlage bringt `spec.brand` mit |
| Creator (Studio) | `routes/sharepicCreator/sharepicCreatorContractRouter.ts` | `body.locale ?? Profil` | `body.brand` optional (additiv) |
| Draft-Agent | `services/sharepicCreator/draftAgent.ts` | `locale` → Kapitel, Beispiele, Palette, Schema | `look = {locale, brand}` → `brandIdFor` |
| Vorlagen | `services/sharepicVorlagen/catalog.ts` `FILES` | `de.json`/`at.json` | zusätzlich `gj-de.json`/`gj-at.json`; Prüfung auf `locale` **und** `brand` |
| Editor | `canvasTemplateDescriptors.ts`, `freeform*` Configs, `composeSharepic.ts:160` | `freeform` / `freeform-at` | dazu `freeform-gj` / `freeform-gj-at` |
| Composer | `composeSharepic.ts:186-188` `getBrandPack(locale)`, `isAt` | Land = Marke | `getBrandPack(locale, brand)`; `isAt` → Pack-Flags |

## Modell

- `sharepicBrandSchema = z.enum(['gruene', 'gruene-jugend'])`, `SharepicSpec.brand` optional (fehlt = `gruene`).
- `GrueneBrandId` = `gruene-de | gruene-at | gj-de | gj-at`; `brandIdFor(locale, brand)` ist die einzige Übersetzung.
- Tabellen, die heute `Record<SharepicCreatorLocale, …>` sind und Gestaltung tragen, werden `Record<GrueneBrandId, …>`.
- Neue Grundfarben (F0, additiv): `limette`, `apricot`, `lavendel`, `pink`, `schwarz` (GJ DE); `waldgruen`, `maigruen`, `gelb`, `veilchen` (GJ AT); `creme` und `weiss` werden geteilt.
- `isAt`-Gruppen → Flags in `ComposerBrand.layout` (ggraphic-core): Zentrierrand, Blockzentrierung, Listenkarte, Fotostreifen-Tönung, Logo-Platz, Wischpfeil, Datumskreis, Vergleichsfläche, Sonnenblume, Petitionshinweis, Frage-Präfix; dazu `headlineCase`, `stoerer.shape`, `cardStyle`.

## Reihenfolge

1. Contracts: Brand-Enum, Farben, Packs, `brandIdFor`, Spec-Regeln. Goldens unverändert.
2. Composer: `isAt` → Flags (Goldens byteweise gleich), dann GJ-Fähigkeiten (Balken, Zackenstern, Ellipse, Brutalismus-Karte, Versal-Headline, Logo rechts).
3. Editor: Config-IDs, Assets (Logo schwarz/hellgrün/weiß), Schriften (Wix Madefor, Ersatz für GJ AT).
4. API: Draft-Agent, Prompt-Kapitel `grundlagen-gj-*.md`, Beispiele, Palette, Review, Chat-Erkennung, Vorlagen-Katalog.
5. Vorlagen `gj-de.json`/`gj-at.json` (intern), Nachbauten rendern, Artifact.
6. Dev-Bypass: Chat, Vorlagen, Canvas-Editor.
