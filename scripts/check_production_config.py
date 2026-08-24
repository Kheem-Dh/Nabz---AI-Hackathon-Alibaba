#!/usr/bin/env python3
"""Validate a production environment file without printing any secrets."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
SERVER_DIR = ROOT / "server"
sys.path.insert(0, str(SERVER_DIR))

from dotenv import load_dotenv  # noqa: E402
from runtime import (  # noqa: E402
    RuntimeConfigurationError,
    RuntimeSettings,
    validate_startup_configuration,
)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("env_file", nargs="?", default=".env.production")
    args = parser.parse_args()
    env_file = Path(args.env_file).resolve()
    if not env_file.is_file():
        print(f"FAIL: environment file not found: {env_file}", file=sys.stderr)
        return 1
    load_dotenv(env_file, override=True)
    try:
        settings = RuntimeSettings.from_env()
        validate_startup_configuration(settings)
    except RuntimeConfigurationError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        return 1
    print(
        "Production configuration passed: production mode, live AI, private "
        "object storage, database, and signing configuration are present"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
