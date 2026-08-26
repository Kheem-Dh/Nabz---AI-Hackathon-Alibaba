"""SQLite + SQLAlchemy setup for Nabz.

Structured so a managed database (Postgres/MySQL/RDS) can be swapped in later
just by changing DATABASE_URL — models and sessions do not depend on SQLite.
"""
from __future__ import annotations

import os
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, sessionmaker

SERVER_DIR = Path(__file__).resolve().parent
DEFAULT_SQLITE_PATH = SERVER_DIR / "nabz.db"

DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{DEFAULT_SQLITE_PATH}")
_IS_SQLITE = DATABASE_URL.startswith("sqlite")

_connect_args = {"check_same_thread": False} if _IS_SQLITE else {}

# pool_pre_ping avoids stale-connection errors on managed databases (Postgres).
engine = create_engine(
    DATABASE_URL, connect_args=_connect_args, pool_pre_ping=True, future=True
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


@event.listens_for(engine, "connect")
def _sqlite_pragmas(dbapi_connection, _record):
    """Per-connection SQLite hardening.

    - foreign_keys=ON: SQLite ignores ON DELETE CASCADE unless this is set.
    - WAL: readers don't block the writer → far fewer "database is locked".
    - busy_timeout: wait instead of erroring when a write lock is briefly held.
    On Postgres/MySQL these are native/irrelevant, so we only touch SQLite.
    """
    if not _IS_SQLITE:
        return
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


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
    """Create tables at startup. Idempotent — safe to call every launch.

    For a managed database (Postgres) prefer `alembic upgrade head`; this
    create_all + additive path stays for the zero-config SQLite dev/demo build.
    """
    # Import models_db so all mapped classes are registered on Base.metadata.
    import models_db  # noqa: F401
    Base.metadata.create_all(bind=engine)
    _ensure_sqlite_columns()
    _ensure_indexes()
    _normalize_existing_phones()


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
    "profiles": {
        "date_of_birth": "DATE",
        "weight_kg": "FLOAT",
        "bp_systolic": "INTEGER",
        "bp_diastolic": "INTEGER",
        "bp_recorded_at": "DATE",
        "vitals_history": "JSON NOT NULL DEFAULT '[]'",
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


def _ensure_indexes() -> None:
    """Case-insensitive UNIQUE email (partial, so many NULL emails are allowed).

    create_all won't add a new index to an already-existing table, so we add it
    idempotently here. Works on SQLite and Postgres (both support expression +
    partial indexes). If existing rows already contain a case-insensitive
    duplicate, we log and skip rather than crash startup.
    """
    import logging

    stmt = (
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_accounts_email_lower "
        "ON accounts (lower(email)) WHERE email IS NOT NULL"
    )
    try:
        from sqlalchemy import text

        with engine.begin() as conn:
            conn.execute(text(stmt))
    except Exception as exc:  # noqa: BLE001
        logging.getLogger("nabz.db").warning(
            "Could not create unique email index (duplicate emails?): %s", exc
        )


def _normalize_existing_phones() -> None:
    """One-time backfill: canonicalize stored phones so pre-existing accounts
    can log in regardless of the format they were registered with.

    Skips a row whose canonical form would collide with another account's phone.
    """
    import logging

    from security import canonical_phone  # lazy import avoids an import cycle
    from models_db import Account

    session = SessionLocal()
    try:
        changed = 0
        accounts = session.query(Account).all()
        for account in accounts:
            canonical = canonical_phone(account.phone)
            if not canonical or canonical == account.phone:
                continue
            clash = (
                session.query(Account)
                .filter(Account.phone == canonical, Account.id != account.id)
                .first()
            )
            if clash is None:
                account.phone = canonical
                changed += 1
        if changed:
            session.commit()
            logging.getLogger("nabz.db").info("Normalized %d phone number(s).", changed)
    except Exception as exc:  # noqa: BLE001
        session.rollback()
        logging.getLogger("nabz.db").warning("Phone normalization skipped: %s", exc)
    finally:
        session.close()
