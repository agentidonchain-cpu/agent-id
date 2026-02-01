# Agent007 - Implementation Status

**Data:** 2026-02-01
**Versão:** V1 Production + V2 Experimental (locked)

---

## V1 LAUNCH STATUS

| # | Item | Status | Detalhes |
|---|------|--------|----------|
| 1 | Smart Contract V1 | ✅ DEPLOYED | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| 2 | Endereço no backend | ✅ DONE | `.env` atualizado |
| 3 | Deploy backend | ⏳ READY | Dockerfile, Railway, Fly.io configs prontos |
| 4 | CLI no npm | ✅ PUBLISHED | `npx agentidbase` |
| 5 | Landing page | ✅ DONE | `website/` - Next.js |

---

## Contract V1 (Base Mainnet)

```
Address:  0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Chain:    Base Mainnet (8453)
Deployer: 0xBD707b0cbf2A204B287a25c42C59C0612eeE3293
Basescan: https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
```

---

## CLI (npm)

**Package:** https://www.npmjs.com/package/agentidbase

```bash
npx agentidbase init          # Cria agent.json
npx agentidbase register      # Registra via API
npx agentidbase anchor <hash> # Ancora on-chain
npx agentidbase verify <hash> # Verifica on-chain
npx agentidbase proof <hash>  # Gera proof
```

---

## Deploy Backend

Arquivos prontos:
- `Dockerfile` - Multi-stage build
- `docker-compose.yml` - Local com PostgreSQL + Redis
- `railway.json` - Railway config
- `fly.toml` - Fly.io config
- `.env.production.example` - Template de variáveis
- `DEPLOY.md` - Guia completo

### Quick Deploy (Railway)
```bash
# Conectar GitHub repo ao Railway
# Configurar secrets no dashboard
# Deploy automático
```

### Quick Deploy (Fly.io)
```bash
fly launch
fly secrets set DATABASE_URL="..." JWT_SECRET="..."
fly deploy
```

---

## Wallet

```
Address: 0xBD707b0cbf2A204B287a25c42C59C0612eeE3293
Balance: ~0.02 ETH (Base)
```

---

## V2 Lockdown Status

**Todos os endpoints V2 estão bloqueados por default.**

Para habilitar (apenas desenvolvimento/teste):
```bash
ENABLE_V2_EXPERIMENTAL=true
```

Endpoints bloqueados:
- `POST /blockchain/anchor-v2` → 404
- `POST /blockchain/update-version` → 404
- `GET /blockchain/versions/:agentId` → 404
- `GET /blockchain/current-version/:agentId` → 404
- `GET /blockchain/verify-v2/:identityHash` → 404
- `GET /agents/by-agent-id/:agentId` → 404

---

## Website Counter Endpoint

```
GET /blockchain/stats
```

Retorna:
```json
{
  "data": {
    "onChain": {
      "totalAnchored": 0,
      "totalRevoked": 0,
      "totalActive": 0
    },
    "display": {
      "totalAgents": 0,
      "chain": "Base Mainnet",
      "contractAddress": "0x..."
    }
  }
}
```

Use `data.display.totalAgents` para o contador do site.

---

## WebSocket Real-Time (Website)

**Endpoint:** `ws://api.agentid.xyz/ws`

### Canais Disponíveis

| Canal | Descrição |
|-------|-----------|
| `all` | Todos os eventos (default) |
| `stats` | Stats públicos do site (totalAgents, totalAnchored) |
| `visitors` | Contagem de visitantes em tempo real |
| `alerts` | Alertas de verificação |
| `verifications` | Eventos de verificação |
| `system` | Health e stats do sistema |
| `agent:{hash}` | Eventos específicos de um agente |

### Mensagens

**Conectar:**
```javascript
const ws = new WebSocket('ws://api.agentid.xyz/ws');
ws.onopen = () => {
  // Subscribe ao canal de stats
  ws.send(JSON.stringify({ action: 'subscribe', channel: 'stats' }));
};
```

**Stats Update (`stats.update`):**
```json
{
  "type": "stats.update",
  "timestamp": "2026-02-01T00:00:00.000Z",
  "data": {
    "totalAgents": 1234,
    "totalAnchored": 1000,
    "lastUpdated": "2026-02-01T00:00:00.000Z"
  }
}
```

**Visitor Count (`visitor.count`):**
```json
{
  "type": "visitor.count",
  "timestamp": "2026-02-01T00:00:00.000Z",
  "data": {
    "current": 42,
    "peak": 150,
    "total": 10000
  }
}
```

**Agent Anchored (`agent.anchored`):**
```json
{
  "type": "agent.anchored",
  "timestamp": "2026-02-01T00:00:00.000Z",
  "data": {
    "identityHash": "0x...",
    "displayName": "My Agent",
    "anchoredAt": "2026-02-01T00:00:00.000Z",
    "txHash": "0x..."
  }
}
```

### Features

- Stats broadcast a cada 5 segundos (configurável)
- Stats enviados imediatamente ao subscrever no canal
- Atualização instantânea quando novo agente é ancorado
- Tracking de visitantes: current, peak, total
- Ping/pong para manter conexão viva

---

## Fases Implementadas

| Phase | Status | Arquivos |
|-------|--------|----------|
| 1. Types | ✅ Código pronto | `src/types/identity.ts` |
| 2. Database Migration | ✅ SQL pronto | `database/migrations/001_add_agentid_versioning.sql` |
| 3. Hash Service | ✅ Código pronto | `src/services/identity/hash.ts` |
| 4. Smart Contract V2 | ⚠️ Não compilado | `contracts/Agent007RegistryV2.sol` |
| 5. Blockchain Service | ⚠️ Não testado | `src/services/blockchain/base-chain.ts` |
| 6. API Routes | ⚠️ Depende de migration | `src/routes/blockchain.ts`, `src/routes/agents.ts` |
| 7. Fingerprint Signatures | ✅ Código pronto | `src/services/autonomy/fingerprint.ts` |

---

## O Que Foi Adicionado

### Types (Phase 1)
- `ToolDependencyType` enum (CRITICAL, UTILITY)
- `IdentityRoles` interface (creator, owner, operator)
- `AgentIdentity` com `agentId`, `previousVersion`, `versionNumber`, `roles`
- `ComponentHashes` com `toolDependenciesHash`
- `ToolDefinition` com `dependencyType`, `agentIdentityHash`

### Database (Phase 2)
- Migration SQL para novas colunas em `agent_identities`
- Tabela `agent_versions` para histórico
- Colunas em `agent_tools` para dependency tracking

### Hash Service (Phase 3)
- `hashToolDependencies()` - inclui apenas CRITICAL tools que são agentes
- `COMPONENT_ORDER` atualizado
- `detectChanges()` atualizado

### Smart Contract V2 (Phase 4)
- `Identity` struct com agentId, versioning, roles
- `anchorIdentity(hash, agentId)`
- `updateAgentVersion(agentId, newHash)`
- `transferAgentOwnership()`, `setOperator()`
- `getVersionHistory()`, `getCurrentVersion()`

### Blockchain Service (Phase 5)
- `REGISTRY_V2_ABI`
- `VerifyResultV2` type
- Métodos V2: `anchorIdentityWithAgentId`, `updateAgentVersion`, `getCurrentVersionV2`, `getVersionHistory`, `verifyIdentityV2`, `transferAgentOwnership`, `setAgentOperator`

### API Routes (Phase 6)
- `POST /blockchain/anchor-v2`
- `POST /blockchain/update-version`
- `GET /blockchain/versions/:agentId`
- `GET /blockchain/current-version/:agentId`
- `GET /blockchain/verify-v2/:identityHash`
- `GET /agents/by-agent-id/:agentId`
- Respostas atualizadas com campos V2

### Fingerprint Signatures (Phase 7)
- `SignedFingerprint` interface
- `signFingerprint()` - Ed25519
- `verifySignedFingerprint()`
- `generateSigningKeyPair()`

---

## Auditoria Técnica

### O Que Está Pronto para Produção
- Registration flow (create → validate)
- Identity hash verification (read-only)
- Blockchain anchoring V1
- API de consulta básica
- WebSocket real-time stats e visitor tracking
- Endpoint `/blockchain/stats` para contador

### O Que É Experimental
- Todo o sistema V2 (agentId, versioning, roles)
- Fingerprint signatures
- Composição de agentes (CRITICAL/UTILITY)

### Riscos Conhecidos

| Risco | Severidade | Status |
|-------|------------|--------|
| DB pode divergir do blockchain | Alta | Não mitigado |
| AgentId squatting (first-come) | Média | By design |
| Version flooding | Baixa | Gas cost mitiga |
| CRITICAL/UTILITY é self-declared | Média | Não mitigado |
| Fingerprint não tem binding ao runtime | Média | Trust-based |

### Dependências Pendentes
```bash
npm install @noble/ed25519
```

### Ações Necessárias para V2
1. Executar migration SQL no PostgreSQL
2. Compilar e testar contrato V2
3. Deploy em Base Sepolia
4. Configurar `BLOCKCHAIN_CONTRACT_V2_ADDRESS`
5. Escrever testes para novos endpoints

---

## Fonte de Verdade

**Atual:** Database (API lê do DB)
**Ideal:** Blockchain
**Gap:** Não há verificação automática DB↔chain

### Verificação Independente
Com o `identityHash`, terceiros podem:
- ✅ Chamar `verifyIdentity(hash)` direto no contrato
- ✅ Ver se existe e não foi revogado
- ❌ Reconstruir identidade (dados off-chain)
- ❌ Verificar fingerprint (não está on-chain)

---

## Decisões de Design

1. **agentId:** UUID v4 gerado primeiro, não derivado do hash
2. **versionNumber:** uint16 (max 65535), linear, sem rollback silencioso
3. **Roles:** creator=owner por padrão, operator opcional
4. **Critical tools:** Incluídas no hash, utility não
5. **Contract migration:** V2 paralelo, V1 permanece válido
