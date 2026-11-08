"""Render a tenant-specific Supabase config without carrying Oriximina's project ref."""
import argparse
import re
from pathlib import Path

PROJECT_REF = re.compile(r"^[a-z0-9]{20}$")
PROJECT_ID_LINE = re.compile(r"(?m)^project_id\s*=\s*([\"'])[^\r\n]*\1\s*$")


def render_config(source: str, tenant_project_id: str) -> str:
    if not PROJECT_REF.fullmatch(tenant_project_id):
        raise ValueError("Invalid Supabase project ref: expected 20 lowercase letters or digits")
    matches = list(PROJECT_ID_LINE.finditer(source))
    if len(matches) != 1:
        raise ValueError("Source config must contain exactly one project_id assignment")
    source_id = matches[0].group(0).split("=", 1)[1].strip().strip("\"'")
    if source_id == tenant_project_id:
        raise ValueError("Tenant project ref must differ from the Oriximina source project")
    return PROJECT_ID_LINE.sub(f'project_id = "{tenant_project_id}"', source, count=1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-config", required=True)
    parser.add_argument("--project-id", required=True)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    source = Path(args.source_config).read_text(encoding="utf-8")
    rendered = render_config(source, args.project_id)
    target = Path(args.output)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(rendered, encoding="utf-8")
    print(f"Tenant config written: {target}")


if __name__ == "__main__":
    main()
