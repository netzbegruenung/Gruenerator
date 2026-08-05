# Fine-Tuning Reference

> Referenced from `CLAUDE.md`. LoRA fine-tuning of GPT-OSS and Gemma 4 on party document data via Together AI.

## Models

| Adapter | Together AI Model Name | Job ID | Base | Data |
|---------|----------------------|--------|------|------|
| Germany Gemma 4 v2 (data-limited; wins directness, loses Genderstern) | `moritzius007_971c/gemma-4-31B-it-gruenerator-de-gemma4-31b-v2-0fec8a6d` | `ft-41ae0876-4da1` | `google/gemma-4-31B-it` | 750 train + 84 val |
| Germany Gemma 4 v1 | `moritzius007_971c/gemma-4-26B-A4B-it-gruenerator-de-gemma4-v1-40802c1d` | `ft-8c5f2d71-bcae` | `google/gemma-4-26B-A4B-it` | 750 train + 84 val |
| Germany v2 | `moritzius007_971c/gpt-oss-20b-gruenerator-de-v2-e2d67068` | `ft-10191744-dbbf` | `openai/gpt-oss-20b` | 750 train + 84 val |
| Germany v1 (deprecated) | `moritzius007_971c/gpt-oss-20b-gruenerator-de-v1-40c19966` | `ft-8f0086c8-1811` | `openai/gpt-oss-20b` | 750 train + 84 val |
| Austria | Not yet trained | — | `openai/gpt-oss-20b` | Data ready at `data/at/` |

### Adapter downloads

Together returns weights via a **302 redirect to a short-lived signed R2 URL** (not a permanent link — see "Download API quirk" below). The durable, reusable "download link" is the job-ID command, which re-resolves a fresh signed URL each time:

```bash
# from apps/api/ — re-resolves a fresh signed URL on each run
TOGETHER_API_KEY=... scripts/.venv/bin/python scripts/togetherFineTune.py \
  --download ft-8c5f2d71-bcae --download-type adapter \
  --download-dir data/models/gemma-4-de-gemma4-v1
```

| Adapter | Download command (job ID) | Local path | Size |
|---------|---------------------------|-----------|------|
| Germany Gemma 4 v1 | `--download ft-8c5f2d71-bcae --download-type adapter` | `apps/api/data/models/gemma-4-de-gemma4-v1/gruenerator-de-gemma4-v1/` | 45.9 MB |

**Gemma 4 v1 training notes (LoRA `r=16, alpha=32`, 2 epochs, lr 1e-5):** Together's default LoRA targeted **attention only** (`q/k/v/o_proj`) — not the MLP modules. Final eval loss `7.69` (from `9.63`) — a modest descent. A v2 should consider more epochs, higher rank, and adding `gate/up/down_proj` to `target_modules` for stronger voice transfer.

## Gemma 4 evaluation: the verdict is data-bound, not method-bound

A blind A/B eval (12 prompts × Presse/Insta/Antrag/Rede, `mistral-large-latest`, positions swapped, 2 passes — `scripts/evalGemma4.py`, reports in `data/eval/`) scored **base `google/gemma-4-31B-it` over the v2 fine-tune 12/12** on five dimensions (Genderstern, Positionen, Struktur, Ton, Authentizität). **But that verdict is incomplete and partly an artifact** — root-cause investigation found:

1. **The rubric missed the most production-critical dimension — directness.** Base opens with a chatty meta-preamble (`"Hier ist ein Entwurf für eine Pressemitteilung…"`) in **10/12** outputs; v2 does this **0/12** (it writes the publishable document directly). In the product, base's preamble is a defect — and the fine-tune *fixed* it (`train_on_inputs=False` taught it to *be* the document). The judge gave zero credit for this.
2. **v2's losses are training-data bugs, not method failure.** The DE training set: **59% of docs have NO Genderstern** (so the data contradicts the system prompt → v2 unlearned `*innen`); **~11–20% is scraper-contaminated** (date prefixes `"Veröffentlicht am…"`, URLs, navigation text, missing-space concatenation). v2 faithfully learned the data's flaws.
3. **Low loss (`1.46`) ≠ better voice** — it meant good reconstruction of (flawed) training docs.

**Adding the `directness` dimension and re-judging (free, `--judge-only`) moved the verdict to base 9 / v2 2 / tie 1** (was 12–0). v2 won directness on average (2.79 vs 2.21) — its one real edge (no meta-preamble) — but lost the five data-fixable dimensions.

### FINAL CONCLUSION: don't fine-tune — base + a prompt tweak wins (`scripts/promptFixTest.py`)

The fine-tune's only advantage was directness (base prepended `"Hier ist ein Entwurf…"` in 10/12). That's an instruction gap, not a capability gap. Adding two sentences to the system prompt —

> *"Gib ausschließlich den fertigen, veröffentlichungsreifen Text aus — ohne Einleitung, ohne Meta-Kommentar und ohne Anrede an die Nutzer\*in. Beginne direkt mit dem Text. Verwende durchgängig gendergerechte Sprache mit Genderstern."*

— and re-testing **base** gave: **meta-preambles 10/12 → 0/12**, Genderstern total 29 → 40, and **base+prompt beats the v2 fine-tune 12/0/0** on the same blind 6-dim rubric.

**So: use stock `google/gemma-4-31B-it` + this system-prompt addition. Do NOT deploy any Gemma 4 fine-tune.** base+prompt wins every dimension *and* is serverless (no dedicated-endpoint bill). A fine-tune would have to beat this — it can't, because base already does everything once instructed.

**When fine-tuning *would* be worth it:** a capability the base genuinely lacks (a private output format it can't follow, a domain it doesn't know) — not voice/tone/gendering, which prompting handles. The cleaned dataset (`data/de-clean/`, 494+57) and hardened `transformTrainingData.ts` are banked for that case.

**Meta-lesson:** loss 1.46 said "great", A/B 0/12 said "terrible", root-cause said "data problem", and a $0 prompt tweak said "you never needed the fine-tune". Validate against the base with a production-relevant rubric *before* training — and always test the prompt-only fix first.

### ⚠️ REVERSAL: the LLM judge was blind to authentic structure — fine-tuning DOES win on house style

Genderstern is NOT the production priority; **PM structure and voice are.** The Mistral judge can't assess authentic Bündnis-90/Die-Grünen house style (it rewards generic polish), so its verdicts above are unreliable on the dimension that matters. A **reference-based** comparison against 91 real training PMs (`scripts/combineTest.py`) tells the real story:

| Marker | REAL PMs | base+prompt | v2+prompt |
|---|---|---|---|
| quote density (avg „/doc) | 3.3 | **0.7** | 3.1 ✓ |
| generic corporate template | 0/91 | **3/12** | 0/12 ✓ |
| meta-preamble | 0 | 0 | 0 |
| Genderstern total | 102 | 40 | **15** |

**The fine-tune captures the authentic quote-driven, no-corporate-template PM structure; base — even prompted — defaults to a generic press-release template.** The LLM judge scored base+prompt 11–0 over v2+prompt precisely *because* it can't see this. The combination (v2+prompt) delivered structure + directness, but Genderstern stayed low — the fine-tune's dirty-data bias (59% ungendered) fighting the prompt.

**Net corrected recommendation:** fine-tuning is worth it *for structure/voice* (the priority) — but the data must be clean. And **evaluate structure/voice reference-based or by a domain expert, never by a generic LLM judge.**

### v3 result + the cleaning trap (CONFIRMED)

clean-v3 (`…v3-clean-cfc5d532`, lr 5e-5/2ep/r16) + prompt, reference-based vs real PMs:

| Marker | REAL | base+prompt | v2+prompt | v3+prompt |
|---|---|---|---|---|
| quote density (avg „/doc) | 3.3 | 0.7 | 3.1 | **1.0** ⬇ |
| corporate template | 0/91 | 3/12 | 0/12 | **4/12** ⬇ |
| Genderstern total | 102 | 40 | 15 | **38** ⬆ |

**Trade-off, not a win:** clean data + prompt *restored Genderstern* (15→38) but *lost the quote-driven structure* (3.1→1.0). **Root cause (confirmed):** the `UNGENDERED_GENERIC` filter in `cleanTrainingData.py`/`transformTrainingData.ts` drops docs with masculine-generic plurals — but those docs average **3.1 quotes/doc vs 1.3 for kept docs**, i.e. they ARE the press releases (spokespeople say "Bürger" generically inside quotes). Filtering for Genderstern silently filtered out PM structure.

**Fix for v4:** do NOT drop masculine-generic docs — **gender-normalize** them (`Bürger`→`Bürger*innen` for common plurals, word-boundary-safe) so structure AND gendering survive; then train with v2's *aggressive* recipe (lr 1e-4, 3ep, r32 — the over-cook is what imprints structure) on that structure-preserving gendered set. Both models also under-produce Funktion-attribution (real 99% vs ~35%) — a remaining gap.

**Standing lesson:** validate fine-tunes with a blind A/B against the base, never on loss alone — **and make sure the rubric scores what production actually needs** (here, "output usable content, not a preamble"), or the verdict can invert reality.

**Eval harness gotchas baked into `evalGemma4.py`:** call a dedicated endpoint via `endpoint.name` (NOT the model ID — fine-tunes are non-serverless); `create_endpoint` deletes its own endpoint on startup failure (a timeout before the caller registers the id would otherwise leak a billing endpoint); `2x_h100` dense-31B cold start runs ~15 min (timeout set to 30); base serverless 31B is slow (~70s/gen → `timeout=600`); `--reuse-base` + `--temperature` allow cheap re-tests that only re-spin the v2 endpoint.

## Pipeline Scripts

All scripts in `apps/api/scripts/`. Run from `apps/api/`:

```bash
# 1. Export documents from Qdrant → raw JSONL
npx tsx scripts/exportNotebookData.ts --collection <name> --output data/<locale>-raw-documents.jsonl

# 2. Transform to training format with quality filters
npx tsx scripts/transformTrainingData.ts --input data/<locale>-raw-documents.jsonl \
  --max-per-bucket 100 --min-length 500 --min-date 2022-01-01 --output-dir data/<locale>

# 3. Fine-tune on Together AI
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --training data/<locale>/training-data.jsonl \
  --validation data/<locale>/validation-data.jsonl \
  --suffix gruenerator-<locale>-v1 --n-epochs 1 --skip-deploy

# 4. Download adapter weights
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --download <JOB_ID> --download-type adapter
```

## Transform Script Flags

| Flag | Purpose |
|------|---------|
| `--max-per-bucket N` | Cap examples per `collection × content_type` pair. Prefers newest docs within each bucket. Prevents any single source from dominating. |
| `--min-date DATE` | Drop documents published before DATE. Undated docs (Grundsatzprogramm) are kept. Use `2022-01-01` for modern style. |
| `--min-length N` | Minimum document length in chars. Social media posts get a lower threshold (100) automatically. |
| `--max-per-type N` | Cap per content_type globally (applied after `--max-per-bucket`). |

## Data Strategy

### Germany — Collections to include

| Collection | Content | Why |
|---|---|---|
| `landesverbaende_documents` | Presse, Beschlüsse, Anträge | Core party voice |
| `bundestag_content` | Bundestagsfraktion | Federal-level communication |
| `social_media_examples` | Facebook, Instagram | Social media tone |
| `gruene_de_documents` | Official website | Party positions |
| `grundsatz_documents` | Grundsatzprogramm | Policy backbone |

### Germany — Collections to EXCLUDE

| Collection | Why |
|---|---|
| `boell_stiftung_documents` | Academic/analytical tone — "Die Analyse zeigt..." ≠ party voice "Wir fordern..." |
| `kommunalwiki_documents` | Neutral wiki style, not political communication |
| Austrian collections | Separate adapter (different party, different voice) |

### Austria — Collections to include

| Collection | Content |
|---|---|
| `oesterreich_gruene_documents` | Party programs (3 large docs → ~60 sliding-window examples) |
| `gruene_at_documents` | News, Themen, Organisation (~160 docs) |

The transform script auto-selects `SYSTEM_PROMPT_AT` for Austrian collections.

## Data Quality: Known Issues & Fixes

### Boilerplate in scraped content

Landesverbände documents often start with website navigation: `KontaktPresseJobsTermineLeichte Sprache GRÜNE Berlin...`. The `stripBoilerplate()` function in `transformTrainingData.ts` removes these patterns. If new boilerplate patterns appear, add regexes to `BOILERPLATE_PATTERNS`.

### Broken titles from sliding windows

Large documents (Grundsatzprogramm, Wahlprogramme) get split into sliding-window training examples. The first paragraph of each window is used as a heading for the prompt. Filter `isGenericTitle()` rejects:
- Pure numbers (`34`, `35`)
- Markdown headings (`# Antragstext`)
- Titles shorter than 5 characters

### Social media: no title field

Social media posts have `title: null` and `primary_category: null`. The transform checks `doc.platform` as a fallback. Min-length threshold is lowered to 100 chars for platform docs (social posts are naturally short).

## Local Testing with Ollama

### Setup

```bash
# Install ollama
curl -fsSL https://ollama.com/install.sh | sh

# Pull base model (13GB)
ollama pull gpt-oss:20b
```

### Loading a fine-tuned model

Together AI's merged checkpoint includes both merged safetensors AND adapter artifacts. **You must remove adapter files before importing**, or ollama treats it as a LoRA adapter (which GPT-OSS doesn't support in llama.cpp).

```bash
# Download merged checkpoint
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --download <JOB_ID> --download-type merged --download-dir data/models/<name>

# Extract
cd data/models/<name>
tar --zstd -xf merged.tar.zst

# CRITICAL: Remove adapter artifacts — ollama mistakes them for LoRA
rm -f adapter_config.json adapter_model.safetensors trainer_state.json

# Create Modelfile
cat > Modelfile << 'EOF'
FROM /absolute/path/to/data/models/<name>

SYSTEM """Du bist ein erfahrener Kommunikationsexperte von Bündnis 90/Die Grünen..."""

PARAMETER temperature 0.7
PARAMETER num_ctx 8192
EOF

# Import into ollama (uses --experimental for safetensors)
ollama create gruenerator-de -f Modelfile --experimental

# Test
ollama run gruenerator-de "Schreibe eine Pressemitteilung zum Thema: Klimaschutz"
```

### Known limitations

- **LoRA adapters not supported** for GPT-OSS in ollama/llama.cpp — the MoE architecture lacks runtime LoRA support. Always use the **merged** checkpoint, not the adapter.
- **No Q4_K_M quantization** via `ollama create -q` on Linux for GPT-OSS — fails with "requires MLX support" (MLX is Mac-only). The model runs at bf16/MXFP4 (~13GB) which fits in 32GB RAM.
- **`adapter_config.json` must be removed** from the merged checkpoint directory or ollama will try (and fail) to load it as a LoRA adapter.

### Converting LoRA adapter to GGUF (for other inference tools)

If needed for llama.cpp or other tools that support LoRA on GPT-OSS in the future:

```bash
# Clone llama.cpp (keep outside /tmp — WSL cleans it)
git clone --depth 1 https://github.com/ggml-org/llama.cpp apps/api/scripts/llama.cpp

# Patch adapter_config.json to use public model name
# (Together uses private "togethercomputer/gpt-oss-20b-bf16", change to "openai/gpt-oss-20b")

# Convert
.venv/bin/python scripts/llama.cpp/convert_lora_to_gguf.py \
  --outfile adapter.gguf \
  /path/to/adapter/directory
```

## Together AI API

### Python venv

```bash
# Create/activate (in apps/api/)
python3 -m venv scripts/.venv
scripts/.venv/bin/pip install "together>=2.0.0"
```

### Useful commands

```bash
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py --list-jobs
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py --list-models
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py --status <JOB_ID>
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py --download <JOB_ID> --download-type adapter
```

### Dedicated endpoints for testing

GPT-OSS fine-tuned models require dedicated endpoints (not available serverlessly). Cheapest available hardware: `1x_nvidia_h100_80gb_sxm` at ~6.65¢/min.

```python
from together import Together
client = Together()

endpoint = client.endpoints.create(
    display_name="Test",
    model="moritzius007_971c/gpt-oss-20b-gruenerator-de-v2-e2d67068",
    hardware="1x_nvidia_h100_80gb_sxm",
    autoscaling={"min_replicas": 1, "max_replicas": 1},
)
# Wait for STARTED state, test, then delete immediately
client.endpoints.delete(endpoint.id)
```

### Download API quirk

The `GET /v1/finetune/download` endpoint returns a **302 redirect** to a signed Cloudflare R2 URL, not the file directly. Always use `curl -L` (follow redirects) or `httpx` with `follow_redirects=True`.

## Cost Reference

| Item | Cost |
|------|------|
| LoRA training (GPT-OSS 20B, ~800 examples, 1 epoch) | ~$1.74 |
| Dedicated endpoint for testing (H100 SXM) | ~$0.07/min |
| Inference on dedicated endpoint | Per-token at base model rate |

## Phase 2: Multi-LoRA Specialists

See `apps/api/scripts/FINETUNING-GUIDE.md` for the full Multi-LoRA strategy — content-type specialists (presse, social, beschluss) as separate adapters, routed by locale via `extractLocaleFromRequest()`.
