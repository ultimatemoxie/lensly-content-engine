# Lensly Render Deployment Guide

This guide covers deploying Lensly to Render using Docker and Neon PostgreSQL.

## Prerequisites

- GitHub repository connected to Render
- Neon PostgreSQL database provisioned
- AI provider API keys (Groq, Cerebras, Gemini)
- Render account with web service permissions

## Step 1: Connect Repository

1. In Render dashboard, click **New +** → **Web Service**
2. Select your GitHub repository
3. Set **Branch** to `main` (or your deployment branch)
4. Set **Runtime** to **Docker**
5. Set **Region** to your preferred location (e.g., Ohio, Frankfurt)

## Step 2: Configure Environment Variables

In the Render web service **Environment** tab, add the following variables.

### Required

| Variable | Value | Notes |
|----------|-------|-------|
| `NODE_ENV` | `production` | |
| `STORAGE_PROVIDER` | `postgres` | Must match PostgreSQL provider |
| `DATABASE_URL` | `<your-neon-connection-string>` | Copy from Neon dashboard → **Connection Details** |
| `DATABASE_SSL` | `true` | Required for Neon and most cloud PostgreSQL providers |
| `TIMEZONE` | `Africa/Lagos` | |

### AI Provider Keys (Optional but Recommended)

| Variable | Value | Notes |
|----------|-------|-------|
| `GROQ_API_KEY` | `<your-groq-key>` | Primary AI provider |
| `CEREBRAS_API_KEY` | `<your-cerebras-key>` | Fallback provider |
| `GEMINI_API_KEY` | `<your-gemini-key>` | Optional fallback |

### X Publishing (Keep Disabled Initially)

| Variable | Value | Notes |
|----------|-------|-------|
| `X_PUBLISHING_ENABLED` | `false` | **Do not enable until ready** |
| `X_DRY_RUN` | `true` | Keep `true` for safe testing |
| `X_AUTH_MODE` | `oauth2` | OAuth 2.0 with PKCE |
| `MAX_POSTS_PER_RUN` | `1` | |

### Optional X OAuth Credentials

Only add these when you are ready to enable live X posting:

| Variable | Value | Notes |
|----------|-------|-------|
| `X_CLIENT_ID` | `<your-client-id>` | |
| `X_CLIENT_SECRET` | `<your-client-secret>` | **Never commit to repo** |
| `X_ACCESS_TOKEN` | `<user-access-token>` | |
| `X_REFRESH_TOKEN` | `<refresh-token>` | |
| `X_ACCESS_TOKEN_EXPIRES_AT` | `<iso-date>` | |
| `X_USER_ID` | `<x-user-id>` | |

### Other Settings

| Variable | Value | Notes |
|----------|-------|-------|
| `AI_PROVIDER` | `groq` | Primary provider |
| `AI_FALLBACK_ORDER` | `cerebras,gemini` | Fallback order |
| `MAX_AI_CALLS_PER_RUN` | `5` | Budget limit per run |
| `MAX_POSTS_PER_RUN` | `1` | Posts per publish cycle |

## Step 3: Deploy

1. Click **Create Web Service** in Render
2. Render will build the Docker image and deploy
3. Set **autoDeploy: false** in `render.yaml` to prevent automatic redeploys on every push

## Step 4: Run Database Migration

After the first deploy, run the migration command:

```bash
render exec lensly-content-engine npm run db:migrate
```

Or use the Render shell:

1. In Render dashboard, open your web service
2. Click **Shell**
3. Run: `npm run db:migrate`

## Step 5: Import Existing Data (Optional)

If you have local JSON data to import:

```bash
render exec lensly-content-engine npm run db:import-json
```

Or use the Render shell to run the command.

To preview without modifying data:

```bash
render exec lensly-content-engine npm run db:import-json -- --dry-run
```

## Step 6: Test Health Check

After deployment, test the health endpoint:

```bash
curl https://your-service.onrender.com/health
```

Expected response:

```json
{
  "status": "ok",
  "service": "lensly-content-engine",
  "storageProvider": "postgres",
  "timestamp": "2026-07-24T19:00:00.000Z"
}
```

The health check must **never** expose:
- `DATABASE_URL`
- API keys (`GROQ_API_KEY`, `CEREBRAS_API_KEY`, `GEMINI_API_KEY`)
- X tokens (`X_ACCESS_TOKEN`, `X_CLIENT_SECRET`, etc.)

## Step 7: Run Scheduled Jobs

Render does not run scheduled jobs automatically. Use one of these approaches:

### Option A: Render Cron Jobs

Create separate Render **Cron Job** services for each scheduled task:

- `collect` — every 6 hours
- `evaluate` — every 6 hours (after collect)
- `replenish` — every 6 hours (after evaluate)
- `export:buffer` — daily at 08:00 Africa/Lagos
- `publish:due` — every 15 minutes during active hours

Each cron job runs the same Docker image with a different command:

```yaml
# Example cron job in render.yaml
services:
  - type: cron
    name: lensly-collect
    runtime: docker
    schedule: "0 */6 * * *"
    command: npm run collect
    envVars:
      - key: DATABASE_URL
        fromDatabase:
          name: lensly-db
          property: connectionString
      - key: STORAGE_PROVIDER
        value: postgres
```

### Option B: External Scheduler

Use an external cron service (e.g., EasyCron, cron-job.org) to call Render webhooks or the Render API to trigger jobs.

## Step 8: Review Logs

In Render dashboard:

1. Open your web service
2. Click **Logs**
3. Filter by event type (build, deploy, request)

**Never** log:
- `DATABASE_URL`
- API keys
- X tokens
- Full request/response bodies containing credentials

Lensly startup logs only show sanitized configuration names and redacted values.

## Step 9: Enable X Publishing (When Ready)

Only after testing in dry-run mode:

1. Set `X_PUBLISHING_ENABLED=true` in Render environment
2. Set `X_DRY_RUN=false`
3. Add valid X OAuth credentials (`X_CLIENT_ID`, `X_CLIENT_SECRET`, `X_ACCESS_TOKEN`, `X_REFRESH_TOKEN`)
4. Test with `publish:dry` first
5. Monitor `publish:status` for failures

## Security Notes

- **Never** commit `.env` or `data/*.json` to version control
- **Never** hard-code `DATABASE_URL` in `render.yaml`
- **Never** expose API keys in logs or health responses
- Use Render's **Environment** tab for all secrets
- Rotate `X_CLIENT_SECRET` and `X_ACCESS_TOKEN` periodically
- Keep `X_PUBLISHING_ENABLED=false` until fully tested

## Troubleshooting

### Database connection fails
- Verify `DATABASE_URL` is set correctly in Render environment
- Verify `DATABASE_SSL=true` for Neon
- Verify Neon database allows connections from Render IPs

### Health check returns 502
- Check Render logs for startup errors
- Verify `PORT` is set correctly (Render sets this automatically)
- Verify the server started successfully

### Migrations fail
- Ensure `DATABASE_URL` is set
- Ensure the database user has DDL permissions
- Check Render logs for SQL errors

### Import fails
- Ensure `STORAGE_PROVIDER=postgres`
- Run `npm run db:import-json -- --dry-run` first to preview
- Check for unique constraint violations in logs
