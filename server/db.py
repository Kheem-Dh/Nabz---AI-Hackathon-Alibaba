"""SQLite + SQLAlchemy setup for Nabz.

Structured so a managed database (Postgres/MySQL/RDS) can be swapped in later
just by changing DATABASE_URL — models and sessions do not depend on SQLite.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker

SERVER_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = SERVER_DIR / "nabz.db"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")

_connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=_connect_args, future=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


class Base(DeclarativeBase):
    """Declarative base for all ORM models."""


def get_db():
    """FastAPI dependency yielding a scoped session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def init_db() -> None:
    """Create tables at startup. Idempotent — safe to call every launch."""
    # Import models_db so all mapped classes are registered on Base.metadata.
    import models_db  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()


# Lightweight additive migration for the hackathon build: create_all() never
# ALTERs an existing table, so new columns on a shipped SQLite DB would be
# missing. Add them idempotently. (A managed DB would use Alembic instead.)
_EXPECTED_COLUMNS: dict[str, dict[str, str]] = {
    "accounts": {
        "email": "VARCHAR(160)",
        "phone_verified": "BOOLEAN NOT NULL DEFAULT 0",
        "phone_verified_at": "DATETIME",
        "email_verified": "BOOLEAN NOT NULL DEFAULT 0",
        "email_verified_at": "DATETIME",
    },
}


def _ensure_sqlite_columns() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        return
    from sqlalchemy import inspect, text

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    with engine.begin() as conn:
        for table, columns in _EXPECTED_COLUMNS.items():
            if table not in existing_tables:
                continue
            have = {col["name"] for col in inspector.get_columns(table)}
            for name, ddl in columns.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {ddl}"))
