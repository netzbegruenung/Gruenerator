# Fine-Tuning Reference

> Referenced from `CLAUDE.md`. LoRA fine-tuning of GPT-OSS on party document data via Together AI.

## Models

| Adapter | Together AI Model Name | Job ID | Base | Data |
|---------|----------------------|--------|------|------|
| Germany v2 | `moritzius007_971c/gpt-oss-20b-gruenerator-de-v2-e2d67068` | `ft-10191744-dbbf` | `openai/gpt-oss-20b` | 750 train + 84 val |
| Germany v1 (deprecated) | `moritzius007_971c/gpt-oss-20b-gruenerator-de-v1-40c19966` | `ft-8f0086c8-1811` | `openai/gpt-oss-20b` | 750 train + 84 val |
| Austria | Not yet trained | — | `openai/gpt-oss-20b` | Data ready at `data/at/` |

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
