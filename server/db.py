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
