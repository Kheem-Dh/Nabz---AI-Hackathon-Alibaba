# Database migrations (Alembic)

Nabz uses **Alembic** for versioned schema changes. The URL is read from
`DATABASE_URL` (env), so the same migrations run on SQLite today and on a
managed **Postgres** after the cutover.

- Dev/demo on SQLite keeps using `init_db()` (`create_all` + additive columns)
  for zero-config startup — you don't have to run Alembic locally.
- For a managed database, Alembic is the source of truth.

Run all commands from the `server/` directory (venv active).

## Postgres cutover (fresh database)

```bash
# 1. Point at the new database
export DATABASE_URL="postgresql+psycopg://user:pass@host:5432/nabz"

# 2. Install the Postgres driver (not needed for SQLite)
pip install "psycopg[binary]"

# 3. Create the full schema
alembic upgrade head
```

## Existing SQLite DB that already has the tables

The dev `nabz.db` was created by `create_all`, so it already matches the
baseline. Tell Alembic it's current (do NOT run `upgrade` on it):

```bash
alembic stamp head
```

## Making a new schema change

1. Edit the SQLAlchemy models in `models_db.py`.
2. Autogenerate a migration and review it:

```bash
alembic revision --autogenerate -m "describe the change"
```

3. Note: Alembic **cannot** autogenerate expression-based indexes (e.g. the
   case-insensitive `uq_accounts_email_lower` on `lower(email)`). Add those by
   hand in the generated file — see `versions/bc1f9e04e748_baseline_schema.py`.
4. Apply it: `alembic upgrade head` (or `alembic downgrade -1` to roll back).

## Handy

```bash
alembic current      # what revision is applied
alembic history      # list migrations
alembic downgrade -1 # roll back one
```
