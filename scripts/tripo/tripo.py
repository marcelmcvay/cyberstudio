# /// script
# requires-python = ">=3.10"
# dependencies = ["tripo3d==0.4.2"]
# ///
"""Tripo API client for CyberStudio.

  uv run scripts/tripo/tripo.py check
  uv run scripts/tripo/tripo.py image-to-model --image PATH [--out DIR] [--asset-id ID]
                                               [--model-version V] [--note TEXT] [--dry-run]
  uv run scripts/tripo/tripo.py get TASK_ID [--out DIR]

Submit writes _gen/tripo/<task_id>.json right away. `get` resumes and downloads.
It never resubmits. Spend goes through scripts/ledger.mjs (the single writer).
"""
from __future__ import annotations

import argparse
import asyncio
import datetime as dt
import hashlib
import json
import os
import re
import subprocess
import sys
from pathlib import Path

KIT_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_MODEL_VERSION = "v2.5-20250123"  # SDK 0.4.2 default for image_to_model
EXIT_NO_KEY = 2


def project_root() -> Path:
    return Path(os.environ.get("CYBERSTUDIO_PROJECT_ROOT") or os.getcwd()).resolve()


def parse_env(text: str) -> dict[str, str]:
    out: dict[str, str] = {}
    for raw in text.splitlines():
        line = raw.strip()
        if not line or line.startswith("#"):
            continue
        m = re.match(r"^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$", line)
        if not m:
            continue
        val = m.group(2)
        if val[:1] in ("'", '"'):
            q = val[0]
            end = val.find(q, 1)
            val = val[1:end] if end > 0 else val[1:]
        else:
            val = re.sub(r"\s+#.*$", "", val).strip()
        out[m.group(1)] = val
    return out


def load_env() -> None:
    """Same lookup as scripts/lib/env.mjs: real env, then project .env, then kit .env."""
    seen = set()
    for f in (project_root() / ".env", KIT_ROOT / ".env"):
        if f in seen or not f.is_file():
            continue
        seen.add(f)
        try:
            pairs = parse_env(f.read_text())
        except OSError:
            continue
        for k, v in pairs.items():
            if not os.environ.get(k) and v != "":
                os.environ[k] = v


def die(msg: str, code: int = 1) -> "None":
    print(msg, file=sys.stderr)
    sys.exit(code)


def need_key() -> str:
    key = os.environ.get("TRIPO_API_KEY", "").strip()
    if not key:
        die("TRIPO_API_KEY is not set. Paste it into .env (see .env.example). Nothing was sent.", EXIT_NO_KEY)
    if not key.startswith("tsk_"):
        die("TRIPO_API_KEY looks wrong. Tripo keys start with tsk_. Nothing was sent.", EXIT_NO_KEY)
    return key


def import_sdk():
    try:
        import tripo3d  # noqa: F401
        from tripo3d import TripoClient, TaskStatus
        return tripo3d, TripoClient, TaskStatus
    except Exception as e:  # pragma: no cover
        die(f"tripo3d SDK failed to import: {e}. Run with `uv run scripts/tripo/tripo.py`.")


def gen_dir() -> Path:
    d = project_root() / "_gen" / "tripo"
    d.mkdir(parents=True, exist_ok=True)
    return d


def record_path(task_id: str) -> Path:
    return gen_dir() / f"{task_id}.json"


def write_record(task_id: str, rec: dict) -> None:
    p = record_path(task_id)
    tmp = p.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(rec, indent=2, default=str))
    tmp.replace(p)


def read_record(task_id: str) -> dict:
    p = record_path(task_id)
    if p.is_file():
        try:
            return json.loads(p.read_text())
        except json.JSONDecodeError:
            pass
    return {"task_id": task_id}


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def now() -> str:
    return dt.datetime.now(dt.timezone.utc).isoformat()


async def safe_balance(client):
    try:
        b = await client.get_balance()
        return {"balance": b.balance, "frozen": b.frozen}
    except Exception as e:
        return {"error": str(e)}


async def raw_task(client, task_id: str) -> dict | None:
    """Unparsed task JSON. The SDK Task dataclass drops unknown fields (possible credit info)."""
    try:
        resp = await client._impl._request("GET", f"/task/{task_id}")  # private, SDK 0.4.2
        return resp.get("data")
    except Exception:
        return None


CREDIT_KEYS = ("consumed_credit", "credit", "credits", "cost", "consumed_credits", "credit_cost")


def credits_from_raw(raw: dict | None):
    if not isinstance(raw, dict):
        return None
    for k in CREDIT_KEYS:
        v = raw.get(k)
        if isinstance(v, (int, float)) and not isinstance(v, bool):
            return float(v)
    return None


def ledger_append(rec: dict, asset_id: str, note: str) -> None:
    """Log one row. Observed credits first, then balance delta, else estimated 0."""
    if rec.get("ledger_logged"):
        return
    usd_per_credit = os.environ.get("TRIPO_USD_PER_CREDIT", "")
    try:
        rate = float(usd_per_credit) if usd_per_credit else None
    except ValueError:
        rate = None
    notes = [f"status={rec.get('status')}"]
    credits = rec.get("credits_observed")
    basis = "observed"
    if credits is None:
        before = (rec.get("balance_before") or {}).get("balance")
        after = (rec.get("balance_after") or {}).get("balance")
        if isinstance(before, (int, float)) and isinstance(after, (int, float)) and before >= after:
            credits = round(before - after, 4)
            notes.append("credits from balance delta (concurrent jobs would skew it)")
        else:
            basis = "estimated"
            notes.append("no credit data from API")
    cost = 0.0
    if credits is not None and rate is not None:
        cost = round(credits * rate, 4)
    elif credits is not None:
        notes.append("TRIPO_USD_PER_CREDIT unset, usd=0")
    if note:
        notes.append(note)
    cmd = [
        "node", str(KIT_ROOT / "scripts" / "ledger.mjs"), "append",
        "--tool", "tripo",
        "--model", str(rec.get("model_version") or ""),
        "--job-id", rec["task_id"],
        "--units", "" if credits is None else str(credits),
        "--unit-type", "credits",
        "--cost-usd", str(cost),
        "--basis", basis,
        "--note", "; ".join(notes),
    ]
    if asset_id:
        cmd += ["--asset-id", asset_id]
    r = subprocess.run(cmd, env={**os.environ, "CYBERSTUDIO_PROJECT_ROOT": str(project_root())})
    if r.returncode == 0:
        rec["ledger_logged"] = now()
        write_record(rec["task_id"], rec)
    else:
        print(f"ledger append failed (exit {r.returncode}). Record kept in {record_path(rec['task_id'])}.", file=sys.stderr)


async def finish(client, TaskStatus, task_id: str, out: Path | None, asset_id: str, note: str) -> int:
    rec = read_record(task_id)
    print(f"waiting on task {task_id} ...", file=sys.stderr)
    task = await client.wait_for_task(task_id, verbose=sys.stderr.isatty())
    rec["status"] = getattr(task.status, "value", str(task.status))
    rec["task"] = {
        "type": task.type, "progress": task.progress, "create_time": task.create_time,
        "error_code": task.error_code, "error_msg": task.error_msg,
        "output": {k: v for k, v in vars(task.output).items() if v is not None},
    }
    raw = await raw_task(client, task_id)
    if raw is not None:
        rec["raw_task"] = raw
    obs = credits_from_raw(raw)
    if obs is not None:
        rec["credits_observed"] = obs
    if "balance_before" in rec and "balance_after" not in rec:
        rec["balance_after"] = await safe_balance(client)
    rec["updated"] = now()
    write_record(task_id, rec)

    if task.status != TaskStatus.SUCCESS:
        print(f"task {task_id} ended {rec['status']}: {task.error_msg or 'no message'}", file=sys.stderr)
        ledger_append(rec, asset_id or rec.get("asset_id", ""), note or rec.get("note", ""))
        return 1

    out_dir = (out or (gen_dir() / task_id)).resolve()
    out_dir.mkdir(parents=True, exist_ok=True)
    files = await client.download_task_models(task, str(out_dir))
    try:
        img = await client.download_rendered_image(task, str(out_dir))
        if img:
            files["rendered_image"] = img
    except Exception:
        pass
    rec["files"] = {
        k: {"path": str(Path(p).resolve()), "sha256": sha256(Path(p)), "bytes": Path(p).stat().st_size}
        for k, p in files.items() if p and Path(p).is_file()
    }
    rec["out_dir"] = str(out_dir)
    rec["updated"] = now()
    write_record(task_id, rec)
    ledger_append(rec, asset_id or rec.get("asset_id", ""), note or rec.get("note", ""))
    print(json.dumps({"task_id": task_id, "status": rec["status"], "files": rec["files"], "record": str(record_path(task_id))}, indent=2))
    return 0


async def cmd_check(_args) -> int:
    tripo3d, TripoClient, _ = import_sdk()
    print(f"tripo3d {getattr(tripo3d, '__version__', '?')} imports ok")
    key = os.environ.get("TRIPO_API_KEY", "").strip()
    if not key:
        print("TRIPO_API_KEY not set. Paste it into .env.", file=sys.stderr)
        return EXIT_NO_KEY
    if not key.startswith("tsk_"):
        print("TRIPO_API_KEY set but does not start with tsk_.", file=sys.stderr)
        return EXIT_NO_KEY
    async with TripoClient(api_key=key) as client:
        bal = await safe_balance(client)
    if "error" in bal:
        print(f"key set. balance call failed: {bal['error']}", file=sys.stderr)
        return 1
    print(f"key ok. balance {bal['balance']} credits, frozen {bal['frozen']}")
    return 0


async def cmd_image_to_model(args) -> int:
    image = Path(args.image).expanduser()
    if not image.is_file():
        die(f"image not found: {image}")
    if args.dry_run:
        print(json.dumps({
            "would_call": "TripoClient.image_to_model",
            "image": str(image.resolve()),
            "model_version": args.model_version,
            "out": str(Path(args.out).resolve()) if args.out else str(project_root() / "_gen" / "tripo" / "<task_id>"),
            "asset_id": args.asset_id or None,
            "ledger": str(project_root() / "ledger" / "spend.csv"),
        }, indent=2))
        return 0
    key = need_key()
    _, TripoClient, TaskStatus = import_sdk()
    async with TripoClient(api_key=key) as client:
        before = await safe_balance(client)
        task_id = await client.image_to_model(image=str(image), model_version=args.model_version)
        rec = {
            "task_id": task_id, "tool": "tripo", "kind": "image_to_model",
            "model_version": args.model_version, "image": str(image.resolve()),
            "image_sha256": sha256(image), "asset_id": args.asset_id or "",
            "note": args.note or "", "submitted": now(), "status": "submitted",
            "balance_before": before,
        }
        write_record(task_id, rec)  # immediately, so `get` can resume
        print(f"submitted {task_id}. record {record_path(task_id)}", file=sys.stderr)
        return await finish(client, TaskStatus, task_id, Path(args.out) if args.out else None, args.asset_id, args.note)


async def cmd_get(args) -> int:
    key = need_key()
    _, TripoClient, TaskStatus = import_sdk()
    async with TripoClient(api_key=key) as client:
        return await finish(client, TaskStatus, args.task_id, Path(args.out) if args.out else None, "", "")


def main() -> int:
    load_env()
    p = argparse.ArgumentParser(prog="tripo.py", description="CyberStudio Tripo client (tripo3d 0.4.2)")
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("check", help="key present, SDK imports, balance if key")
    i2m = sub.add_parser("image-to-model", help="submit an image, wait, download, ledger")
    i2m.add_argument("--image", required=True)
    i2m.add_argument("--out")
    i2m.add_argument("--asset-id", default="")
    i2m.add_argument("--model-version", default=DEFAULT_MODEL_VERSION)
    i2m.add_argument("--note", default="")
    i2m.add_argument("--dry-run", action="store_true")
    g = sub.add_parser("get", help="resume a task and download. never resubmits")
    g.add_argument("task_id")
    g.add_argument("--out")
    args = p.parse_args()
    fn = {"check": cmd_check, "image-to-model": cmd_image_to_model, "get": cmd_get}[args.cmd]
    try:
        return asyncio.run(fn(args))
    except KeyboardInterrupt:
        print("interrupted. Resume with `get <task_id>`.", file=sys.stderr)
        return 130
    except Exception as e:
        print(f"tripo: {type(e).__name__}: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
