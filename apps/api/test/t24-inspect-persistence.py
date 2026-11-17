#!/usr/bin/env python3
"""Read-only canary inspection of the owned cluster, WAL, log and logical dump."""

import json
import re
import sys
from pathlib import Path


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("One explicit private harness directory is required")
    task_dir = Path(sys.argv[1])
    if (
        task_dir.parent != Path("/tmp")
        or not task_dir.name.startswith("safethrift-t24-harness.")
        or not re.fullmatch(r"[a-f0-9]{32}", (task_dir / "owner").read_text())
        or not (task_dir / "data" / "PG_VERSION").is_file()
        or not (task_dir / "persistent-data.sql").is_file()
    ):
        raise SystemExit("Private disposable cluster identity was not established")
    needles = [
        b"T24-FORBIDDEN-DOCUMENT-20261116",
        b"T24-FORBIDDEN-NATIONAL-ID-20261116",
        b"T24-FORBIDDEN-ONFIDO-CREDENTIAL-20261116",
        b'"eventId":',
        b"x-synthetic-signature",
        b'"onfidoApiKey":',
    ]
    paths = sorted(p for p in (task_dir / "data").rglob("*") if p.is_file())
    paths.extend([task_dir / "postgres.log", task_dir / "persistent-data.sql"])
    inspected_bytes = 0
    for path in paths:
        tail = b""
        with path.open("rb") as stream:
            while True:
                chunk = stream.read(1024 * 1024)
                if not chunk:
                    break
                inspected_bytes += len(chunk)
                combined = tail + chunk
                if any(needle in combined for needle in needles):
                    raise SystemExit(f"Forbidden persistence found in {path.relative_to(task_dir)}")
                tail = combined[-128:]
    print("PASS: " + json.dumps({
        "inspection": "PostgreSQL files, WAL, server log and logical data dump",
        "files_inspected": len(paths),
        "bytes_inspected": inspected_bytes,
        "forbidden_canaries_or_raw_protocol_values": 0,
    }, sort_keys=True))


if __name__ == "__main__":
    main()
