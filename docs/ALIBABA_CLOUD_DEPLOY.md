# Alibaba Cloud deployment

This is the lowest-complexity demo deployment for Nabz: one small Alibaba
Cloud ECS instance running Docker Compose. Nginx serves the React build and
proxies `/api/*` to FastAPI on the private Compose network. SQLite and
prescription uploads live in named Docker volumes so container rebuilds do not
erase them.

## Cost boundary

This deployment is **not guaranteed to be permanently free**. Eligible new
Alibaba Cloud users can claim an ECS trial, but eligibility requires identity
verification, a supported payment method, and no previous ECS or Simple
Application Server purchase/trial. Stop or release the instance before the
trial expires if you do not want pay-as-you-go charges.

Function Compute can be cheaper when idle, but the current Nabz build uses
SQLite and local prescription uploads. Deploying it there safely also requires
persistent NAS/RDS and object storage, increasing both complexity and cost.

## Inputs required from the owner

1. An Alibaba Cloud International account with identity verification and an
   attached payment method.
2. Confirmation that the account is eligible for the ECS free trial.
3. Preferred region. Singapore is the default recommendation for Pakistan.
4. A domain or subdomain for HTTPS, such as `demo.nabz.pk`.
5. A production `DASHSCOPE_API_KEY`, or approval to deploy with
   `MOCK_MODE=true` and zero AI credentials.

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

Put the generated value in `.env.production` as `JWT_SECRET`. Set
`MOCK_MODE=true` for the zero-credential demo, or set `MOCK_MODE=false` and
enter the DashScope key directly on the host.

```bash
docker compose --env-file .env.production -f compose.prod.yaml up -d --build
docker compose --env-file .env.production -f compose.prod.yaml ps
curl -fsS http://127.0.0.1/api/health
```

The frontend and API share one origin. Only Nginx is publicly exposed; port
8000 remains inside the Compose network.

## Persistence and backup

The `nabz-data` volume contains SQLite data and `nabz-uploads` contains saved
prescription images. Back up both before replacing or deleting the ECS
instance:

```bash
docker run --rm -v nabz_nabz-data:/source -v "$PWD":/backup alpine \
  tar czf /backup/nabz-data.tgz -C /source .
docker run --rm -v nabz_nabz-uploads:/source -v "$PWD":/backup alpine \
  tar czf /backup/nabz-uploads.tgz -C /source .
```

These archives contain health information. Store them encrypted and do not
commit them.

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
