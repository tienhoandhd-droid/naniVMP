#!/usr/bin/env python3
"""Run current CRUD/role/audit behavior tests only on a marked disposable DB."""
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import time

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--container", required=True)
parser.add_argument("--database", required=True)
parser.add_argument("--evidence-dir", type=Path, required=True)
args = parser.parse_args()
if not re.fullmatch(r"supabase_db_[a-zA-Z0-9_-]+", args.container):
    parser.error("Expected a local Supabase database container name")
if not re.fullmatch(r"vmp_crud_audit_[a-zA-Z0-9_]+", args.database):
    parser.error("Refusing a database outside the disposable vmp_crud_audit_ namespace")
root = Path(__file__).resolve().parents[1]
base = ["docker", "exec", "-i", args.container, "psql", "-U", "postgres",
        "-d", args.database, "-X", "-v", "ON_ERROR_STOP=1"]
probe = subprocess.run(base + ["-qAt"], input="select current_database() || '|' || coalesce(shobj_description(oid,'pg_database'),'') from pg_database where datname=current_database();",
                       text=True, capture_output=True, timeout=20)
if probe.returncode or probe.stdout.strip() != args.database + "|VMP_DISPOSABLE_CRUD_AUDIT":
    sys.exit("Refusing unmarked database; no test writes executed")
args.evidence_dir.mkdir(parents=True, exist_ok=True)
suites = [
    "tests/sql/crud-catalog-role-audit.sql",
    "tests/sql/crud-progress-account-roles.sql",
    "tests/sql/crud-people-plan-lifecycle.sql",
    "tests/sql/crud-admin-role-mode-matrix.sql",
    "tests/sql/crud-source-assignment-role-matrix.sql",
    "supabase/tests/crud_qualification_roles.sql",
    "supabase/tests/crud_qualification_all_forms.sql",
]
results = []
for suite in suites:
    started = time.monotonic()
    result = subprocess.run(base + ["-f", "/dev/stdin"], input=(root / suite).read_text(),
                            text=True, capture_output=True, timeout=180)
    log = args.evidence_dir / (Path(suite).stem + ".log")
    log.write_text(result.stdout + result.stderr)
    row = {"suite": suite, "exit_code": result.returncode,
           "seconds": round(time.monotonic() - started, 3), "log": log.name}
    results.append(row)
    print(("PASS" if result.returncode == 0 else "FAIL") + " " + suite, flush=True)
receipt = {"database": args.database, "disposable_marker_verified": True,
           "all_passed": all(row["exit_code"] == 0 for row in results), "results": results}
(args.evidence_dir / "results.json").write_text(json.dumps(receipt, indent=2) + "\n")
sys.exit(0 if receipt["all_passed"] else 1)
