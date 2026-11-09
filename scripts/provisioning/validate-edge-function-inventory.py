"""Inventory Edge Functions and referenced environment variable NAMES only.

This file never reads secret values and never connects to any provider.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ENV_PATTERNS = (
    re.compile(r"""Deno\.env\.get\s*\(\s*["']([A-Z][A-Z0-9_]*)["']\s*\)"""),
    re.compile(r"""Deno\.env\s*\[\s*["']([A-Z][A-Z0-9_]*)["']\s*\]"""),
    re.compile(r"""process\.env\.([A-Z][A-Z0-9_]*)"""),
)
LOCAL_IMPORT_RE = re.compile(r"""from\s*["'](\.{1,2}/[^"']+)["']""")
EXPECTED_COUNT = 30


def inventory_functions(functions_root: Path) -> dict:
    if not functions_root.is_dir():
        raise ValueError(f"Functions directory not found: {functions_root}")

    entries = []
    for folder in sorted(p for p in functions_root.iterdir() if p.is_dir() and not p.name.startswith("_")):
        entrypoint = folder / "index.ts"
        if not entrypoint.is_file():
            continue
        source = entrypoint.read_text(encoding="utf-8")
        env_names = sorted({
            name
            for pattern in ENV_PATTERNS
            for name in pattern.findall(source)
        })
        local_imports = sorted(set(LOCAL_IMPORT_RE.findall(source)))
        entries.append({
            "name": folder.name,
            "entrypoint": f"{folder.name}/index.ts",
            "environment_variable_names": env_names,
            "relative_imports": local_imports,
        })

    names = [item["name"] for item in entries]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate Edge Function names")
    return {
        "scope": "metadata_only",
        "secret_values_read": False,
        "count": len(entries),
        "functions": entries,
    }


def validate_inventory(functions_root: Path, expected_count: int = EXPECTED_COUNT) -> dict:
    result = inventory_functions(functions_root)
    if result["count"] != expected_count:
        raise ValueError(
            f"Expected {expected_count} Edge Functions, found {result['count']}"
        )
    if any(not item["name"] or not item["entrypoint"].endswith("/index.ts") for item in result["functions"]):
        raise ValueError("Invalid Edge Function entrypoint")
    return result


def main() -> None:
    if len(sys.argv) not in (2, 3):
        raise SystemExit(
            "Usage: validate-edge-function-inventory.py FUNCTIONS_DIR [OUTPUT_JSON]"
        )
    manifest = validate_inventory(Path(sys.argv[1]))
    payload = json.dumps(manifest, ensure_ascii=False, indent=2)
    if len(sys.argv) == 3:
        Path(sys.argv[2]).write_text(payload + "\\n", encoding="utf-8")
    print(payload)


if __name__ == "__main__":
    main()
