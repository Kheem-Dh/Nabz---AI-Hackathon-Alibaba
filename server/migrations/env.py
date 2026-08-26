"""Alembic environment for Nabz.

Reads DATABASE_URL from the environment so the same migrations run against the
local SQLite dev DB and a managed Postgres later. Metadata comes from the app's
SQLAlchemy models, so `alembic revision --autogenerate` stays in sync with them.
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

# Make the server package importable (env.py runs from server/migrations).
SERVER_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(SERVER_DIR))

try:
    from dotenv import load_dotenv

    load_dotenv(SERVER_DIR / ".env")
except Exception:  # noqa: BLE001
    pass

from db import Base  # noqa: E402
import models_db  # noqa: E402,F401  (registers all tables on Base.metadata)

config = context.config
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# The app is the single source of truth for the URL.
_DEFAULT_SQLITE = f"sqlite:///{SERVER_DIR / 'nabz.db'}"
config.set_main_option("sqlalchemy.url", os.getenv("DATABASE_URL", _DEFAULT_SQLITE))

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        literal_binds=True,
        compare_type=True,
        render_as_batch=True,  # SQLite needs batch mode to ALTER tables
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            render_as_batch=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
