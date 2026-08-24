# Alibaba Cloud deployment

This is the lowest-complexity production deployment for Nabz: one small Alibaba
Cloud ECS instance running Docker Compose. Nginx serves the React build and
proxies `/api/*` to FastAPI on the private Compose network. SQLite lives in a
named Docker volume and medical uploads live in a private S3-compatible object
storage bucket so container rebuilds do not erase them.

## Cost boundary

This deployment is **not guaranteed to be permanently free**. Eligible new
Alibaba Cloud users can claim an ECS trial, but eligibility requires identity
verification, a supported payment method, and no previous ECS or Simple
Application Server purchase/trial. Stop or release the instance before the
trial expires if you do not want pay-as-you-go charges.

Function Compute can be cheaper when idle, but the current single-node setup
uses SQLite. Scaling beyond one API replica requires a managed SQL database.

## Inputs required from the owner

1. An Alibaba Cloud International account with identity verification and an
   attached payment method.
2. Confirmation that the account is eligible for the ECS free trial.
3. Preferred region. Singapore is the default recommendation for Pakistan.
4. A domain or subdomain for HTTPS, such as `demo.nabz.pk`.
5. A production `DASHSCOPE_API_KEY`.
6. A private AWS S3 or Cloudflare R2 bucket and workload identity or access
   credentials.

Do not send secret values in chat or commit them. Enter them directly into the
deployment host's `.env.production` file or the Alibaba Cloud secret manager.

## ECS requirements

- Ubuntu 24.04 or Alibaba Cloud Linux
- 2 vCPU and 2 GB RAM recommended for image builds
- 20 GB system disk
- inbound TCP 22 restricted to the administrator IP
- inbound TCP 80 and 443 open to the internet
- Docker Engine with the Compose v2 plugin

## Deploy

Clone the repository on the ECS host, then run:

```bash
cp .env.production.example .env.production
openssl rand -hex 32
```

Put the generated value in `.env.production` as `JWT_SECRET`. Replace the
DashScope, database, bucket, region/endpoint, and credential placeholders.
Production cannot start with mock mode, demo routes, local uploads, or a
missing AI key. For an AWS-hosted bucket, prefer an instance role instead of
static credentials. S3-compatible providers such as R2 require their endpoint
and access credentials.

```bash
server/venv/bin/python scripts/check_production_config.py .env.production
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
docker compose --env-file .env.production -f compose.prod.yaml ps
server/venv/bin/python scripts/production_smoke.py http://127.0.0.1
```

The frontend and API share one origin. Only Nginx is publicly exposed; port
8000 remains inside the Compose network. `/docs`, `/redoc`, `/openapi.json`,
and `/api/demo/*` return 404 in production.

## Persistence and backup

The `nabz-data` volume contains SQLite data. Back it up before replacing or
deleting the ECS instance:

```bash
docker run --rm -v nabz_nabz-data:/source -v "$PWD":/backup alpine \
  tar czf /backup/nabz-data.tgz -C /source .
```

Enable encryption, versioning, retention, and lifecycle rules on the private
medical-document bucket. Database archives also contain health information;
store them encrypted and never commit them.

## HTTPS is mandatory for the voice demo

Remote browser microphone and geolocation APIs require a secure context. The
HTTP deployment is only a connectivity check. Before the demo, point the
chosen domain at the ECS public IP and terminate TLS using an Alibaba Cloud
managed certificate/load balancer or a host-level Let's Encrypt setup. After
HTTPS is live, set `CORS_ORIGINS` to the exact HTTPS origin and verify the full
60-second flow from a phone.

## Update and rollback

```bash
git pull --ff-only
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
```

Images are rebuilt locally. Persistent volumes are retained. Keep the previous
Git commit hash so application code can be rolled back without touching data.
