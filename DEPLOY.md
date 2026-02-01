# Agent007 API - Deployment Guide

## Quick Deploy Options

### Option 1: Railway (Recommended)

1. Connect GitHub repo to Railway
2. Set environment variables in Railway dashboard
3. Deploy

```bash
# Or via CLI
npm install -g @railway/cli
railway login
railway init
railway up
```

**Required secrets in Railway:**
```
DATABASE_URL=postgresql://...
JWT_SECRET=...
ENCRYPTION_MASTER_KEY=...
BLOCKCHAIN_PRIVATE_KEY=...
```

### Option 2: Fly.io

```bash
# Install Fly CLI
curl -L https://fly.io/install.sh | sh

# Login and deploy
fly auth login
fly launch --no-deploy
fly secrets set DATABASE_URL="postgresql://..."
fly secrets set JWT_SECRET="..."
fly secrets set ENCRYPTION_MASTER_KEY="..."
fly secrets set BLOCKCHAIN_PRIVATE_KEY="..."
fly deploy
```

### Option 3: Docker

```bash
# Build
docker build -t agent007-api .

# Run
docker run -d \
  -p 3000:3000 \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -e ENCRYPTION_MASTER_KEY="..." \
  -e BLOCKCHAIN_PRIVATE_KEY="..." \
  -e BLOCKCHAIN_CONTRACT_ADDRESS="0x471C4c43672be2d49A2ceC79203c23b7194A22Fa" \
  agent007-api
```

### Option 4: Docker Compose (with DB)

```bash
# Set secrets in .env file
cp .env.production.example .env.production

# Start everything
docker-compose up -d
```

---

## Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` |
| `JWT_SECRET` | Secret for JWT signing (min 32 chars) | Random string |
| `ENCRYPTION_MASTER_KEY` | 64-char hex key for encryption | Random hex |
| `BLOCKCHAIN_PRIVATE_KEY` | Wallet private key for anchoring | `0x...` |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | V1 contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |

---

## Database Setup

The API needs PostgreSQL. Run the schema:

```bash
psql $DATABASE_URL < database/schema.sql
```

Or use a managed PostgreSQL:
- **Supabase**: https://supabase.com
- **Neon**: https://neon.tech
- **Railway PostgreSQL**: Add as service in Railway

---

## Verify Deployment

```bash
# Health check
curl https://your-api-url/health

# API info
curl https://your-api-url/api/v1

# Blockchain stats
curl https://your-api-url/api/v1/blockchain/stats
```

---

## Contract Info

- **Chain**: Base Mainnet (8453)
- **Contract**: `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa`
- **Basescan**: https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
