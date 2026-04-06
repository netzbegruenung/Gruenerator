# Fine-Tuning gpt-oss with Grünerator Document Data

## Background

### Why fine-tune?

Grünerator uses gpt-oss as its primary text generation model. Out of the box, gpt-oss is a strong general-purpose model — it can write German text, follow instructions, and adapt to system prompts. But it doesn't inherently _know_ what a Green Party press release sounds like, how a Parteitagsbeschluss is structured, or what tone an Instagram post from Bündnis 90/Die Grünen should strike.

Fine-tuning bridges that gap. By training the model on thousands of real party documents — press releases, resolutions, social media posts, policy texts — we teach it the specific patterns of Green Party communication: the vocabulary, the rhetorical structures, the use of Genderstern, the balance between urgency and pragmatism that characterizes Grüne messaging.

### What is LoRA fine-tuning?

Traditional fine-tuning updates all of a model's parameters — for a 20-billion-parameter model, that means retraining 20 billion weights. This is expensive, slow, and risks catastrophic forgetting (the model "forgets" its general capabilities while learning the new domain).

**LoRA** (Low-Rank Adaptation) takes a different approach. It freezes all original weights and injects small, trainable matrices alongside them — typically less than 0.1% of the model's parameters. The result is a lightweight "adapter" that shifts the model's behavior toward the target domain while preserving everything it already knows. Training is fast (minutes to hours instead of days), cheap (~$6 per run), and the adapter file is small enough to hot-swap at inference time.

### Our approach: Multi-LoRA by country and content type

The Grünerator platform serves two distinct Green parties:

- **Bündnis 90/Die Grünen** (Germany) — the larger party, with extensive press, Bundestag, and social media content
- **Die Grünen – Die Grüne Alternative** (Austria) — a separate party with its own communication style and political context

These are not regional variants of the same voice — they are different organizations with different names, structures, and messaging. Mixing their training data would produce a model that awkwardly straddles both identities. Instead, we train **separate LoRA adapters** for each country, served on the same base model via Together AI's Multi-LoRA infrastructure. The user's locale (`de-DE` or `de-AT`) determines which adapter handles their request — at no extra inference cost.

Within each country adapter, the training data is balanced across content types (press releases, social media, resolutions) and biased toward recent content (`--min-date 2022-01-01`) to capture modern communication style. Collections that don't reflect party voice — such as the Heinrich-Böll-Stiftung (academic/analytical tone) or the Kommunalwiki (neutral encyclopedia style) — are excluded from training.

### Data pipeline

The fine-tuning pipeline has three stages:

1. **Export** (`exportNotebookData.ts`) — Pulls documents from Qdrant vector collections, reconstructs full texts from chunks, and writes raw JSONL with metadata (title, content type, collection, publication date).

2. **Transform** (`transformTrainingData.ts`) — Converts raw documents into chat-format training pairs: a system prompt establishing the Green Party expert role, a user prompt requesting a specific content type, and the actual document as the assistant's response. Applies quality filters (minimum length, deduplication, generic title removal) and balances the dataset across collections and content types using `--max-per-bucket`. Newer documents are preferred.

3. **Train** (`togetherFineTune.py`) — Uploads the JSONL to Together AI and launches a LoRA fine-tuning job. Monitors progress, reports training events, and outputs the adapter model name for use in inference.

### Cost structure

Together AI charges per token processed during training, with a $6 minimum per job. A well-balanced training dataset of ~700-800 examples at 1 epoch fits comfortably within that minimum. Inference with fine-tuned adapters costs the same as the base model — no premium for using custom weights.

| What                              | Cost               |
| --------------------------------- | ------------------ |
| One country adapter (Phase 1)     | ~$6                |
| Both countries                    | ~$12               |
| Content-type specialist (Phase 2) | ~$6 each           |
| Inference                         | Same as base model |

---

## Prerequisites

- Access to Qdrant (credentials in `.env`)
- Node.js 20+ with `npx tsx`

For training, choose one:

- **Together AI** (recommended) — managed LoRA fine-tuning, no GPU infra to manage. Requires `pip install "together>=2.0.0"` and `TOGETHER_API_KEY`
- **RunPod** — self-managed GPU training with Unsloth. More control, more setup

## Step 1: Export Documents

```bash
cd apps/api

# Preview what's available (no files written)
npx tsx scripts/exportNotebookData.ts --dry-run

# Full export
npx tsx scripts/exportNotebookData.ts

# Export specific collections only
npx tsx scripts/exportNotebookData.ts --collection landesverbaende_documents --collection bundestag_content
```

Output: `data/raw-documents.jsonl` — one JSON object per reconstructed document with metadata (title, content_type, collection, etc.).

## Step 2: Transform to Training Format

```bash
# Preview stats
npx tsx scripts/transformTrainingData.ts --dry-run

# Generate training data
npx tsx scripts/transformTrainingData.ts

# Custom settings
npx tsx scripts/transformTrainingData.ts --min-length 300 --max-length 12000 --split 0.9
```

Output:

- `data/training-data.jsonl` — 90% of examples
- `data/validation-data.jsonl` — 10% held out

Each line is OpenAI Harmony chat format:

```json
{
  "messages": [
    {
      "role": "system",
      "content": "Du bist ein erfahrener Kommunikationsexperte von Bündnis 90/Die Grünen..."
    },
    { "role": "user", "content": "Schreibe eine Pressemitteilung zum Thema: Klimaschutzgesetz" },
    { "role": "assistant", "content": "<actual document text>" }
  ]
}
```

### Validate Output

```bash
# Check format
head -3 data/training-data.jsonl | jq .

# Count examples
wc -l data/training-data.jsonl data/validation-data.jsonl

# Check a random example
shuf -n 1 data/training-data.jsonl | jq '.messages[1].content, .messages[2].content[:200]'
```

## Step 3: Fine-Tune on Together AI (Recommended)

Managed LoRA fine-tuning — no GPU infrastructure to manage.

```bash
# Install Together SDK
pip install "together>=2.0.0"
export TOGETHER_API_KEY=your_key

# Start fine-tuning (uploads data, creates LoRA job, monitors progress)
python scripts/togetherFineTune.py

# Use gpt-oss-120b instead of 20b
python scripts/togetherFineTune.py --model openai/gpt-oss-120b

# Custom training parameters
python scripts/togetherFineTune.py --n-epochs 3 --learning-rate 2e-5 --suffix gruenerator-v2

# Skip deployment (just train, use serverless inference)
python scripts/togetherFineTune.py --skip-deploy
```

### Managing Jobs

```bash
# List recent jobs
python scripts/togetherFineTune.py --list-jobs

# Check status of a running job
python scripts/togetherFineTune.py --status ft-abc123
```

### Together AI Model Options

| Model                           | API String            | Context | Cost   |
| ------------------------------- | --------------------- | ------- | ------ |
| GPT-OSS 20B (recommended start) | `openai/gpt-oss-20b`  | 24K     | Lower  |
| GPT-OSS 120B                    | `openai/gpt-oss-120b` | 16K     | Higher |

### Default LoRA Parameters

| Parameter         | Default | Notes                             |
| ----------------- | ------- | --------------------------------- |
| `--lora-r`        | 64      | LoRA rank                         |
| `--lora-alpha`    | 16      | Scaling factor                    |
| `--n-epochs`      | 2       | Conservative to avoid overfitting |
| `--learning-rate` | 1e-5    | Standard for LoRA                 |
| `--batch-size`    | max     | Together auto-determines optimal  |

### Integrating the Fine-Tuned Model

After training completes, the script prints the output model name (e.g. `your-org/gpt-oss-20b-gruenerator-v1`). To use it:

1. **Serverless** (simplest): Use the model name directly in Together AI API calls
2. **Dedicated endpoint**: Omit `--skip-deploy` to auto-create an endpoint
3. **Via LiteLLM**: Add the fine-tuned model to your LiteLLM proxy config

---

## Step 3 (Alternative): GPU Setup on RunPod

### Option A: gpt-oss-20B (recommended starting point)

| Requirement   | Value                                   |
| ------------- | --------------------------------------- |
| GPU           | 1× RTX 4090 (24GB) or A40 (48GB)        |
| VRAM needed   | ~14GB with QLoRA                        |
| Cost          | ~$0.44/hr (RTX 4090) or ~$0.76/hr (A40) |
| Training time | ~2-6h depending on dataset size         |

### Option B: gpt-oss-120B

| Requirement   | Value                                   |
| ------------- | --------------------------------------- |
| GPU           | 1× A100 80GB                            |
| VRAM needed   | ~65GB with QLoRA                        |
| Cost          | ~$1.89/hr (on-demand), ~$1.19/hr (spot) |
| Training time | ~8-24h depending on dataset size        |

### RunPod Setup

1. Go to [runpod.io](https://runpod.io), create a pod:
   - **Template**: RunPod PyTorch 2.x
   - **GPU**: RTX 4090 (20B) or A100 80GB (120B)
   - **Disk**: 100GB (20B) or 300GB (120B)

2. SSH into the pod and install Unsloth:

```bash
pip install --no-deps unsloth
pip install --no-deps trl peft accelerate bitsandbytes xformers
```

3. Upload training data:

```bash
# From your local machine
scp data/training-data.jsonl data/validation-data.jsonl runpod:/workspace/
```

## Step 4: Training with Unsloth

Create `train.py` on the RunPod instance:

```python
from unsloth import FastLanguageModel
from trl import SFTTrainer
from transformers import TrainingArguments
from datasets import load_dataset

# ============================================================================
# Config — adjust model name for 20B vs 120B
# ============================================================================
MODEL_NAME = "unsloth/gpt-oss-20b-bnb-4bit"  # or "unsloth/gpt-oss-120b-bnb-4bit"
MAX_SEQ_LENGTH = 8192
LORA_R = 16
LORA_ALPHA = 16
EPOCHS = 3
BATCH_SIZE = 1                    # increase if VRAM allows
GRADIENT_ACCUMULATION = 4         # effective batch = BATCH_SIZE * GRADIENT_ACCUMULATION
LEARNING_RATE = 2e-4
OUTPUT_DIR = "/workspace/output"

# ============================================================================
# Load model with 4-bit quantization
# ============================================================================
model, tokenizer = FastLanguageModel.from_pretrained(
    model_name=MODEL_NAME,
    max_seq_length=MAX_SEQ_LENGTH,
    dtype=None,           # auto-detect (float16 on most GPUs)
    load_in_4bit=True,
)

# ============================================================================
# Configure LoRA adapters
# ============================================================================
model = FastLanguageModel.get_peft_model(
    model,
    r=LORA_R,
    lora_alpha=LORA_ALPHA,
    lora_dropout=0,
    target_modules=[
        "q_proj", "k_proj", "v_proj", "o_proj",
        "gate_proj", "up_proj", "down_proj",
    ],
    bias="none",
    use_gradient_checkpointing="unsloth",  # 30% less VRAM
    random_state=42,
)

# ============================================================================
# Load dataset
# ============================================================================
dataset = load_dataset("json", data_files={
    "train": "/workspace/training-data.jsonl",
    "validation": "/workspace/validation-data.jsonl",
})

def format_chat(example):
    """Convert our JSONL chat format to the model's chat template."""
    return {"text": tokenizer.apply_chat_template(
        example["messages"], tokenize=False, add_generation_prompt=False
    )}

train_dataset = dataset["train"].map(format_chat)
eval_dataset = dataset["validation"].map(format_chat)

# ============================================================================
# Train
# ============================================================================
trainer = SFTTrainer(
    model=model,
    tokenizer=tokenizer,
    train_dataset=train_dataset,
    eval_dataset=eval_dataset,
    dataset_text_field="text",
    max_seq_length=MAX_SEQ_LENGTH,
    packing=True,           # pack short examples together for efficiency
    args=TrainingArguments(
        output_dir=OUTPUT_DIR,
        per_device_train_batch_size=BATCH_SIZE,
        gradient_accumulation_steps=GRADIENT_ACCUMULATION,
        warmup_steps=10,
        num_train_epochs=EPOCHS,
        learning_rate=LEARNING_RATE,
        fp16=True,
        logging_steps=10,
        eval_strategy="steps",
        eval_steps=100,
        save_strategy="steps",
        save_steps=200,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="cosine",
        seed=42,
    ),
)

print(f"Training examples: {len(train_dataset)}")
print(f"Validation examples: {len(eval_dataset)}")
print(f"Trainable parameters: {model.print_trainable_parameters()}")

trainer.train()

# ============================================================================
# Save
# ============================================================================
# Save LoRA adapter
model.save_pretrained(f"{OUTPUT_DIR}/lora")
tokenizer.save_pretrained(f"{OUTPUT_DIR}/lora")

# Save merged GGUF for llama.cpp deployment
model.save_pretrained_gguf(
    f"{OUTPUT_DIR}/gguf",
    tokenizer,
    quantization_method="q4_k_m",  # good quality/size balance
)

print(f"\nDone! Model saved to {OUTPUT_DIR}/")
print(f"  LoRA adapter: {OUTPUT_DIR}/lora/")
print(f"  GGUF (Q4_K_M): {OUTPUT_DIR}/gguf/")
```

Run training:

```bash
python train.py
```

### Monitoring

Training logs print every 10 steps. Watch for:

- **Training loss** should decrease steadily (start ~2.0, end ~0.5-1.0)
- **Eval loss** should track training loss — if it diverges upward, you're overfitting (reduce epochs)
- **Runtime**: expect ~1-3 min/epoch for small datasets, longer for large ones

## Step 5: Export the Model

After training, download the GGUF file from RunPod:

```bash
# From your local machine — download the quantized model
scp runpod:/workspace/output/gguf/*.gguf ./gruenerator-20b-q4_k_m.gguf
```

### Alternative quantizations

If you want different quality/size tradeoffs, re-quantize on the RunPod instance before downloading:

```python
# In Python on RunPod, after training
model.save_pretrained_gguf(f"{OUTPUT_DIR}/gguf-q8", tokenizer, quantization_method="q8_0")     # highest quality, largest
model.save_pretrained_gguf(f"{OUTPUT_DIR}/gguf-q2", tokenizer, quantization_method="q2_k_xl")   # smallest, for constrained RAM
```

### Push to HuggingFace (optional)

```python
model.push_to_hub_gguf("your-username/gruenerator-gpt-oss-20b", tokenizer, quantization_method="q4_k_m")
```

## Step 6: Running the Fine-Tuned Model

### With llama.cpp

```bash
# Install llama.cpp
git clone https://github.com/ggml-org/llama.cpp && cd llama.cpp
cmake -B build -DGGML_CUDA=ON && cmake --build build --config Release -j

# Run inference
./build/bin/llama-cli \
  -m /path/to/gruenerator-20b-q4_k_m.gguf \
  -p "Schreibe eine Pressemitteilung zum Thema: Erneuerbare Energien" \
  -n 1024 \
  --temp 0.7 \
  --ctx-size 8192
```

### With llama.cpp server (OpenAI-compatible API)

```bash
./build/bin/llama-server \
  -m /path/to/gruenerator-20b-q4_k_m.gguf \
  --port 8080 \
  --ctx-size 8192

# Then use it like any OpenAI API:
curl http://localhost:8080/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "system", "content": "Du bist ein Kommunikationsexperte von Bündnis 90/Die Grünen."},
      {"role": "user", "content": "Schreibe eine Pressemitteilung zum Thema: Klimaschutzgesetz"}
    ],
    "temperature": 0.7,
    "max_tokens": 1024
  }'
```

### 120B: MoE Expert Offloading

The 120B model is a Mixture of Experts (128 experts, 4 active per token). For machines with limited VRAM, offload the MoE layers to CPU:

```bash
./build/bin/llama-server \
  -m /path/to/gruenerator-120b-q4_k_m.gguf \
  --port 8080 \
  --ctx-size 4096 \
  -ot ".ffn_.*_exps.=CPU"   # offload MoE experts to CPU, keep attention on GPU
```

This needs ~64GB+ system RAM but only ~8GB VRAM for the attention layers.

## Tips

### Dataset Quality

- **Spot-check examples** before training: `shuf -n 10 data/training-data.jsonl | jq -r '.messages[1].content'`
- **Remove low-quality sources** if needed: re-run export with `--collection` to exclude noisy collections
- **Increase `--min-length`** (e.g., 500) to filter out stub documents
- **Decrease `--max-length`** (e.g., 8000) if you want the model to learn concise writing

### Training

- **Start with 1 epoch** to test the pipeline end-to-end, then increase to 3
- **Watch eval loss** — if it starts increasing while train loss keeps dropping, stop early or reduce epochs
- **LoRA rank (`r`)**: 16 is a good default. Try 32 for more capacity if you have enough data (5000+ examples)
- **Learning rate**: 2e-4 works well for QLoRA. If loss is unstable, try 1e-4

### Cost Optimization on RunPod

- Use **spot instances** (~37% cheaper) for training runs you can restart
- **Pre-download the model** to a network volume so you don't re-download on restart
- Start with a **small subset** (`--limit 100` on export) to validate the pipeline before full training
- **Shut down immediately** after downloading the trained model

### Integrating with Grünerator

Once the model is running via llama.cpp server, you can point Grünerator's API at it by configuring it as an OpenAI-compatible provider. The server exposes `/v1/chat/completions` which works with any OpenAI SDK client.

---

## Multi-LoRA Adapter Strategy

All adapters share the same GPT-OSS base model. Together AI serves them serverlessly at base model price — no extra cost per adapter.

### Phase 1: Country Adapters (Germany + Austria)

Germany and Austria are **separate parties** with different names, structures, and political contexts. They get separate adapters from the start.

#### Phase 1a: Germany — `gruenerator-de-v1`

Core data: party communication voice (no Böll-Stiftung, no Kommunalwiki).

```bash
cd apps/api

# Export German party collections only
npx tsx scripts/exportNotebookData.ts \
  --collection landesverbaende_documents \
  --collection bundestag_content \
  --collection gruene_de_documents \
  --collection grundsatz_documents \
  --collection social_media_examples

# Transform with balanced buckets, recent content, quality floor
# --min-date filters for modern communication style (formatting, topics)
npx tsx scripts/transformTrainingData.ts \
  --max-per-bucket 100 --min-length 500 --min-date 2022-01-01 \
  --output-dir data/de

# Fine-tune
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --training data/de/training-data.jsonl \
  --validation data/de/validation-data.jsonl \
  --suffix gruenerator-de-v1 --n-epochs 1 --skip-deploy
```

**Collections used:**
| Collection | Content | Est. examples after bucket cap |
|---|---|---|
| `landesverbaende_documents` | Presse, Beschlüsse, Anträge | ~300 |
| `bundestag_content` | Bundestagsfraktion texts | ~100 |
| `social_media_examples` | Facebook, Instagram | ~200 |
| `gruene_de_documents` | Official website | ~100 |
| `grundsatz_documents` | Grundsatzprogramm | ~30-60 |
| **Total** | | **~730-760** |

**Collections excluded:**

- `boell_stiftung_documents` — think tank / academic tone, not party voice
- `kommunalwiki_documents` — neutral wiki style, not political communication
- Austrian collections — separate adapter

Estimated cost: **~$6** (minimum charge)

#### Phase 1b: Austria — `gruenerator-at-v1`

```bash
# Export Austrian collections
npx tsx scripts/exportNotebookData.ts \
  --collection oesterreich_gruene_documents \
  --collection gruene_at_documents

# Transform (Austrian content uses SYSTEM_PROMPT_AT automatically)
npx tsx scripts/transformTrainingData.ts \
  --min-length 500 --output-dir data/at

# Fine-tune
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --training data/at/training-data.jsonl \
  --validation data/at/validation-data.jsonl \
  --suffix gruenerator-at-v1 --n-epochs 1 --skip-deploy
```

**Collections used:**
| Collection | Content | Docs |
|---|---|---|
| `oesterreich_gruene_documents` | Party programs | 3 (large, sliding window → ~60) |
| `gruene_at_documents` | News, Themen, Organisation | 161 |
| **Total** | | **~220** |

Estimated cost: **~$6** (minimum charge). Smaller dataset, but 220 examples is enough for LoRA style adaptation.

### Phase 2: Content-Type Specialists (Optional)

If Phase 1 quality review shows style bleed between content types (e.g. social media outputs sound too formal), split further:

```bash
# German press release specialist
npx tsx scripts/exportNotebookData.ts --collection landesverbaende_documents --collection bundestag_content
npx tsx scripts/transformTrainingData.ts --max-per-bucket 100 --min-length 500 --min-date 2023-01-01 --output-dir data/de-presse
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --training data/de-presse/training-data.jsonl \
  --validation data/de-presse/validation-data.jsonl \
  --suffix gruenerator-de-presse-v1 --n-epochs 1 --skip-deploy

# German social media specialist
npx tsx scripts/exportNotebookData.ts --collection social_media_examples
npx tsx scripts/transformTrainingData.ts --output-dir data/de-social
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py \
  --training data/de-social/training-data.jsonl \
  --validation data/de-social/validation-data.jsonl \
  --suffix gruenerator-de-social-v1 --n-epochs 1 --skip-deploy
```

Each specialist adapter: ~$6.

### Using Adapters at Inference Time

Each fine-tuned adapter gets a model name. Use it directly — Together handles routing:

```python
from together import Together
client = Together()

# German adapter
response = client.chat.completions.create(
    model="your-org/gpt-oss-20b-gruenerator-de-v1",
    messages=[
        {"role": "system", "content": "Du bist ein Kommunikationsexperte von Bündnis 90/Die Grünen."},
        {"role": "user", "content": "Schreibe eine Pressemitteilung zum Thema: Klimaschutzgesetz"},
    ],
)

# Austrian adapter — same base model, different adapter
response = client.chat.completions.create(
    model="your-org/gpt-oss-20b-gruenerator-at-v1",
    messages=[
        {"role": "system", "content": "Du bist ein Kommunikationsexperte von Die Grünen – Die Grüne Alternative."},
        {"role": "user", "content": "Verfasse eine Presseaussendung zum Thema: Klimaschutz"},
    ],
)
```

List all trained adapter names:

```bash
TOGETHER_API_KEY=... .venv/bin/python scripts/togetherFineTune.py --list-models
```

### Routing in Grünerator

Map user locale to adapter in the API config or LiteLLM proxy:

```
# Primary axis: country (from user locale / domain)
locale=de-DE  →  gruenerator-de-v1
locale=de-AT  →  gruenerator-at-v1

# Phase 2 refinement: country + content type
locale=de-DE, type=presse     →  gruenerator-de-presse-v1
locale=de-DE, type=social     →  gruenerator-de-social-v1
locale=de-DE, type=*          →  gruenerator-de-v1 (fallback)
```

This maps cleanly to the existing `extractLocaleFromRequest(req)` in `services/localization/index.ts`.

### Cost Summary

| Phase                | Adapters | Training cost | Inference cost           |
| -------------------- | -------- | ------------- | ------------------------ |
| Phase 1a: Germany    | 1        | ~$6           | Base model price         |
| Phase 1b: Austria    | 1        | ~$6           | Base model price         |
| Phase 2: Specialists | 2-4      | ~$6 each      | Base model price (same!) |
| **Total Phase 1**    | **2**    | **~$12**      | **Base model price**     |

Inference cost is identical regardless of how many adapters you have — you only pay per-token at base model rates.
