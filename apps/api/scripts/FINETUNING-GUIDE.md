# Fine-Tuning gpt-oss with Grünerator Document Data

Fine-tune gpt-oss (20B or 120B) on Green party documents to generate authentic party-style content — press releases, resolutions, social media posts, and policy texts.

## Prerequisites

- Access to Qdrant (credentials in `.env`)
- Node.js 20+ with `npx tsx`
- RunPod account for GPU training

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

## Step 3: GPU Setup on RunPod

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
