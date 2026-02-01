# Agent007 - Implementation Status

**Data:** 2026-02-01
**Versão:** V1 Production + V2 Experimental (locked)
**Último commit:** 7435a28

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
