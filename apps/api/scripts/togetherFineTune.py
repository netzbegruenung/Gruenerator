#!/usr/bin/env python3
"""
Together AI Fine-Tuning — GPT-OSS LoRA Workflow

Uploads training data and launches a LoRA fine-tuning job on Together AI.
Designed to work with output from transformTrainingData.ts.

Usage:
    python scripts/togetherFineTune.py
    python scripts/togetherFineTune.py --training data/training-data.jsonl --validation data/validation-data.jsonl
    python scripts/togetherFineTune.py --model openai/gpt-oss-120b --suffix v2
    python scripts/togetherFineTune.py --skip-deploy
    python scripts/togetherFineTune.py --status JOB_ID
    python scripts/togetherFineTune.py --download JOB_ID --download-type adapter
    python scripts/togetherFineTune.py --download JOB_ID --download-type merged --download-dir data/models

Requires:
    pip install "together>=2.0.0"
    export TOGETHER_API_KEY=your_key
"""

import argparse
import os
import sys
import time
from pathlib import Path

from together import Together

client = Together()

DEFAULT_MODEL = "openai/gpt-oss-20b"
DEFAULT_SUFFIX = "gruenerator-v1"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Together AI LoRA fine-tuning for Grünerator")
    parser.add_argument(
        "--training",
        default="data/training-data.jsonl",
        help="Path to training JSONL (default: data/training-data.jsonl)",
    )
    parser.add_argument(
        "--validation",
        default="data/validation-data.jsonl",
        help="Path to validation JSONL (default: data/validation-data.jsonl)",
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help=f"Base model to fine-tune (default: {DEFAULT_MODEL})",
    )
    parser.add_argument(
        "--suffix",
        default=DEFAULT_SUFFIX,
        help=f"Suffix for the fine-tuned model name (default: {DEFAULT_SUFFIX})",
    )
    parser.add_argument("--n-epochs", type=int, default=2, help="Number of training epochs (default: 2)")
    parser.add_argument("--learning-rate", type=float, default=1e-5, help="Learning rate (default: 1e-5)")
    parser.add_argument("--lora-r", type=int, default=64, help="LoRA rank (default: 64)")
    parser.add_argument("--lora-alpha", type=int, default=16, help="LoRA alpha (default: 16)")
    parser.add_argument("--batch-size", default="max", help="Batch size or 'max' for auto (default: max)")
    parser.add_argument(
        "--poll-interval", type=int, default=30, help="Seconds between status checks (default: 30)"
    )
    parser.add_argument("--skip-deploy", action="store_true", help="Stop after training, don't deploy")
    parser.add_argument(
        "--hardware",
        default="4x_nvidia_h100_80gb_sxm",
        help="Hardware for deployment (default: 4x_nvidia_h100_80gb_sxm)",
    )
    parser.add_argument("--status", metavar="JOB_ID", help="Check status of an existing job instead of creating one")
    parser.add_argument("--list-jobs", action="store_true", help="List recent fine-tuning jobs")
    parser.add_argument("--list-models", action="store_true", help="List fine-tuned model names (for Multi-LoRA routing)")
    parser.add_argument(
        "--download",
        metavar="JOB_ID",
        help="Download model weights for a completed job (e.g. --download ft-xxx)",
    )
    parser.add_argument(
        "--download-type",
        choices=["adapter", "merged"],
        default="adapter",
        help="Checkpoint type to download: adapter (LoRA only, small) or merged (full model, large). Default: adapter",
    )
    parser.add_argument(
        "--download-dir",
        default="data/models",
        help="Directory to save downloaded model (default: data/models)",
    )
    return parser.parse_args()


def count_lines(path: Path) -> int:
    with open(path) as f:
        return sum(1 for line in f if line.strip())


def check_status(job_id: str) -> None:
    status = client.fine_tuning.retrieve(id=job_id)
    print(f"Job: {job_id}")
    print(f"  Model: {status.model}")
    print(f"  Status: {status.status}")
    if status.x_model_output_name:
        print(f"  Output model: {status.x_model_output_name}")

    events = client.fine_tuning.list_events(id=job_id)
    if events.data:
        print("\n  Recent events:")
        for event in events.data[-10:]:
            print(f"    [{event.created_at}] {event.message}")


def list_jobs() -> None:
    jobs = client.fine_tuning.list()
    if not jobs.data:
        print("No fine-tuning jobs found.")
        return

    print(f"{'ID':<40} {'Model':<30} {'Status':<12} {'Suffix'}")
    print("-" * 100)
    for job in jobs.data[:20]:
        suffix = getattr(job, "suffix", "") or ""
        print(f"{job.id:<40} {job.model:<30} {job.status:<12} {suffix}")


def list_models() -> None:
    """List all completed fine-tuned model names for Multi-LoRA routing."""
    jobs = client.fine_tuning.list()
    if not jobs.data:
        print("No fine-tuning jobs found.")
        return

    completed = [j for j in jobs.data if j.status == "completed"]
    if not completed:
        print("No completed fine-tuning jobs.")
        return

    print("Fine-tuned models available for inference:\n")
    for job in completed:
        output_name = getattr(job, "x_model_output_name", None) or getattr(job, "output_name", None)
        suffix = getattr(job, "suffix", "") or ""
        if output_name:
            print(f"  model=\"{output_name}\"")
            print(f"    Base: {job.model}  Suffix: {suffix}")
            print()

    print("Use any model name above in Together API calls:")
    print('  client.chat.completions.create(model="<model-name>", messages=[...])')


def download_model(job_id: str, checkpoint_type: str, output_dir: str) -> None:
    """Download fine-tuned model weights via REST API.

    Together AI returns ZSTD-compressed tar archives.
    """
    import httpx

    status = client.fine_tuning.retrieve(id=job_id)
    if status.status != "completed":
        print(f"Job {job_id} is not completed (status: {status.status})")
        sys.exit(1)

    suffix = getattr(status, "suffix", "") or job_id
    out_dir = Path(output_dir) / suffix
    out_dir.mkdir(parents=True, exist_ok=True)

    out_file = out_dir / f"{checkpoint_type}.tar.zst"

    api_key = os.environ.get("TOGETHER_API_KEY", "")
    url = f"https://api.together.xyz/v1/finetune/download?ft_id={job_id}&checkpoint={checkpoint_type}"

    print(f"Downloading {checkpoint_type} checkpoint for {job_id}...")
    print(f"  Output: {out_file}")

    with httpx.stream("GET", url, headers={"Authorization": f"Bearer {api_key}"}, timeout=600, follow_redirects=True) as response:
        if response.status_code != 200:
            print(f"  Error {response.status_code}: {response.text}")
            sys.exit(1)

        total = int(response.headers.get("content-length", 0))
        downloaded = 0

        with open(out_file, "wb") as f:
            for chunk in response.iter_bytes(chunk_size=1024 * 1024):
                f.write(chunk)
                downloaded += len(chunk)
                if total:
                    pct = downloaded / total * 100
                    print(f"\r  {downloaded / 1024 / 1024:.1f} MB / {total / 1024 / 1024:.1f} MB ({pct:.0f}%)", end="", flush=True)
                else:
                    print(f"\r  {downloaded / 1024 / 1024:.1f} MB", end="", flush=True)

    print()
    size_mb = out_file.stat().st_size / 1024 / 1024
    print(f"  Downloaded: {out_file} ({size_mb:.1f} MB)")

    print(f"\n  Extract with: tar -xf {out_file}")
    print(f"  Or decompress: zstd -d {out_file} && tar -xf {out_file.with_suffix('')}")


def main() -> None:
    args = parse_args()

    if args.list_jobs:
        list_jobs()
        return

    if args.list_models:
        list_models()
        return

    if args.download:
        download_model(args.download, args.download_type, args.download_dir)
        return

    if args.status:
        check_status(args.status)
        return

    # Validate input files
    train_path = Path(args.training)
    val_path = Path(args.validation)

    if not train_path.exists():
        print(f"Training file not found: {train_path}")
        print("Run the export + transform pipeline first:")
        print("  npx tsx scripts/exportNotebookData.ts")
        print("  npx tsx scripts/transformTrainingData.ts")
        sys.exit(1)

    train_count = count_lines(train_path)
    print(f"Training file: {train_path} ({train_count} examples)")

    if train_count < 10:
        print(f"Warning: Only {train_count} training examples. Minimum recommended is ~50 for meaningful results.")
        response = input("Continue anyway? [y/N] ")
        if response.lower() != "y":
            sys.exit(0)

    val_file_id = None
    if val_path.exists():
        val_count = count_lines(val_path)
        print(f"Validation file: {val_path} ({val_count} examples)")
    else:
        print(f"No validation file at {val_path}, training without validation set.")

    print(f"\nModel: {args.model}")
    print(f"Suffix: {args.suffix}")
    print(f"LoRA rank: {args.lora_r}, alpha: {args.lora_alpha}")
    print(f"Epochs: {args.n_epochs}, LR: {args.learning_rate}")
    print(f"Batch size: {args.batch_size}")

    # Upload training file
    print("\nUploading training file...")
    train_response = client.files.upload(file=str(train_path), purpose="fine-tune", check=True)
    train_file_id = train_response.id
    print(f"  Uploaded: {train_file_id}")

    # Upload validation file
    if val_path.exists():
        print("Uploading validation file...")
        val_response = client.files.upload(file=str(val_path), purpose="fine-tune", check=True)
        val_file_id = val_response.id
        print(f"  Uploaded: {val_file_id}")

    # Parse batch_size
    batch_size = args.batch_size
    if batch_size != "max":
        batch_size = int(batch_size)

    # Create LoRA fine-tuning job
    print("\nCreating LoRA fine-tuning job...")
    job_params = dict(
        training_file=train_file_id,
        model=args.model,
        n_epochs=args.n_epochs,
        learning_rate=args.learning_rate,
        lora=True,
        lora_r=args.lora_r,
        lora_alpha=args.lora_alpha,
        batch_size=batch_size,
        suffix=args.suffix,
        train_on_inputs=False,
        n_evals=4,
        n_checkpoints=3,
    )
    if val_file_id:
        job_params["validation_file"] = val_file_id

    job = client.fine_tuning.create(**job_params)
    print(f"  Job ID: {job.id}")
    print(f"\n  To check status later: python scripts/togetherFineTune.py --status {job.id}")

    # Monitor training
    print("\nMonitoring training...")
    while True:
        status = client.fine_tuning.retrieve(id=job.id)
        print(f"  [{time.strftime('%H:%M:%S')}] Status: {status.status}")

        if status.status == "completed":
            print(f"\nTraining complete!")
            print(f"  Output model: {status.x_model_output_name}")
            break
        if status.status in ("failed", "cancelled"):
            print(f"\nJob ended with status: {status.status}")

            events = client.fine_tuning.list_events(id=job.id)
            if events.data:
                print("\n  Events:")
                for event in events.data[-5:]:
                    print(f"    [{event.created_at}] {event.message}")
            sys.exit(1)

        time.sleep(args.poll_interval)

    # Print training events
    events = client.fine_tuning.list_events(id=job.id)
    if events.data:
        print("\nTraining events:")
        for event in events.data:
            print(f"  [{event.created_at}] {event.message}")

    if args.skip_deploy:
        print("\nSkipping deployment. Model is available for serverless inference:")
        print(f"  {status.x_model_output_name}")
        return

    # Deploy as dedicated endpoint
    output_model = status.x_model_output_name
    print(f"\nDeploying {output_model} as dedicated endpoint...")

    endpoint = client.endpoints.create(
        display_name=f"Grünerator {args.suffix}",
        model=output_model,
        hardware=args.hardware,
        autoscaling={"min_replicas": 1, "max_replicas": 1},
    )
    print(f"  Endpoint ID: {endpoint.id}")

    while True:
        ep = client.endpoints.retrieve(endpoint.id)
        print(f"  [{time.strftime('%H:%M:%S')}] Endpoint state: {ep.state}")
        if ep.state == "STARTED":
            break
        if ep.state in ("FAILED", "STOPPED"):
            print(f"\nEndpoint {ep.state}")
            sys.exit(1)
        time.sleep(args.poll_interval)

    # Quick test
    print("\nTesting endpoint with a sample prompt...")
    response = client.chat.completions.create(
        model=endpoint.name,
        messages=[
            {
                "role": "system",
                "content": (
                    "Du bist ein erfahrener Kommunikationsexperte von Bündnis 90/Die Grünen. "
                    "Du schreibst authentische Texte im Stil der Grünen Partei."
                ),
            },
            {"role": "user", "content": "Schreibe eine kurze Pressemitteilung zum Thema Klimaschutz."},
        ],
        max_tokens=512,
    )
    print(f"\nSample response:\n{response.choices[0].message.content}")
    print(f"\nEndpoint is running. Delete when done to avoid charges:")
    print(f'  python -c "from together import Together; Together().endpoints.delete(\'{endpoint.id}\')"')


if __name__ == "__main__":
    main()
