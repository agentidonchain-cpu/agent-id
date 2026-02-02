# AgentID - Estado Atual

**Última atualização:** 2026-02-02

## Resumo

Sistema de identidade criptográfica para agentes de IA na blockchain Base.

## URLs

| Serviço | URL |
|---------|-----|
| API | https://agent007-api-production.up.railway.app |
| Website | https://id-agent.org |
| Contrato | https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa |
| NPM | https://www.npmjs.com/package/agentidbase |
| GitHub | https://github.com/agentidonchain-cpu/agent-id |

## CLI (v0.1.7)

```bash
# Instalar
npm install -g agentidbase

# Ou usar direto
npx agentidbase <comando>
```

### Comandos Principais

| Comando | Descrição |
|---------|-----------|
| `attest` | Registra agente de plataforma fechada (ChatGPT, etc.) |
| `register` | Registra agente com config JSON |
| `verify <hash>` | Verifica identidade on-chain |
| `verify-twitter` | Vincula conta do Twitter |
| `qr <hash>` | Gera QR code de verificação |
| `init` | Cria arquivo agent.json |

### Fluxo Recomendado

```bash
# 1. Registrar (auto-ancora on-chain, GRÁTIS)
npx agentidbase attest

# 2. Vincular Twitter (opcional)
npx agentidbase verify-twitter @handle

# 3. Verificar
npx agentidbase verify 0xHASH
```

## API Endpoints

### V2 (Atual)

```
POST /api/v2/agents/attest        - Attestation (plataformas fechadas)
POST /api/v2/agents/fingerprint   - Fingerprint (config aberta)
POST /api/v2/agents/self-register - Self-claim (agentes autônomos)
GET  /api/v2/agents/:hash         - Detalhes do agente
GET  /api/v2/agents               - Lista todos os agentes
GET  /api/v2/agents/stats         - Estatísticas
GET  /api/v2/agents/recent        - Agentes recentes
```

### V1 (Legacy)

```
POST /api/v1/agents/register/config      - Registro com config
POST /api/v1/agents/register/attestation - Registro attestation
GET  /api/v1/agents/:hash                - Detalhes
POST /api/v1/verify/twitter/init         - Iniciar verificação Twitter
POST /api/v1/verify/twitter/confirm      - Confirmar verificação Twitter
GET  /api/v1/blockchain/status           - Status blockchain
```

## Credenciais (Railway)

| Variável | Descrição |
|----------|-----------|
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `BLOCKCHAIN_PRIVATE_KEY` | Wallet para pagar gas |
| `BLOCKCHAIN_CONTRACT_ADDRESS` | 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa |
| `TWITTER_API_KEY` | API key do twitterapi.io |
| `JWT_SECRET` | Secret para JWT |
| `ENCRYPTION_MASTER_KEY` | Chave de criptografia |

## Blockchain

- **Chain:** Base Mainnet (Chain ID: 8453)
- **Contrato:** 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
- **Wallet:** 0xBD707b0cbf2A204B287a25c42C59C0612eeE3293
- **Balance:** ~0.02 ETH
- **Total Ancorado:** 13 agentes

## Features Implementadas

- [x] Registro de agentes (3 tipos: attestation, fingerprint, self-claim)
- [x] Auto-anchor on-chain (grátis, servidor paga gas)
- [x] Verificação on-chain via CLI
- [x] Verificação Twitter
- [x] QR Code generation
- [x] Website com /docs, /agents, /verify/[hash], /verify/twitter
- [x] WebSocket para live feed
- [x] PostgreSQL persistence

## Arquivos Importantes

```
/home/lumen/Downloads/Agent007/
├── .env                          # Variáveis locais
├── .credentials-backup           # Backup de credenciais (gitignored)
├── cli/
│   ├── src/index.ts             # CLI entry point
│   ├── src/commands/            # Comandos CLI
│   └── package.json             # v0.1.7
├── src/
│   ├── routes/agents.ts         # Rotas V1 (com auto-anchor)
│   ├── routes/agents-v2.ts      # Rotas V2
│   ├── routes/verify.ts         # Twitter verification
│   ├── services/blockchain/     # Blockchain service
│   └── services/twitter/        # Twitter API client
└── website/
    └── src/app/
        ├── docs/page.tsx        # Documentação
        ├── verify/twitter/      # Twitter verification page
        └── agents/page.tsx      # Lista de agentes
```

## Tokens Salvos

> **NOTA:** Tokens estão salvos em `.credentials-backup` (gitignored) e nas variáveis de ambiente do Railway.

- NPM_TOKEN: Automation token para publicar no NPM (bypass 2FA)
- TWITTER_API_KEY: API key do twitterapi.io para verificação Twitter

## Próximos Passos

- [ ] Testar fluxo completo em produção (attest → verify-twitter → verify)
- [ ] Corrigir erro de coluna no WebSocket stats
- [ ] Adicionar mais plataformas no attest (Discord, Telegram, etc.)
