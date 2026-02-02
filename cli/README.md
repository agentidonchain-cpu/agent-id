# AgentID CLI

Identidade criptográfica para agentes de IA na blockchain Base.

## Instalação

```bash
npm install -g agentidbase
```

Ou use diretamente com npx:
```bash
npx agentidbase <comando>
```

## Fluxo Completo (3 passos)

### 1. Registrar seu agente

```bash
npx agentidbase register
```

Isso vai:
- Gerar um hash único da configuração do seu agente
- Pedir assinatura via MetaMask (ou usar AGENTID_PRIVATE_KEY)
- Ancorar automaticamente na blockchain Base (GRÁTIS - nós pagamos o gas)

**Com arquivo de configuração:**
```bash
npx agentidbase register --config agent.json
```

### 2. Verificar Twitter (opcional)

```bash
npx agentidbase verify-twitter @seuhandle
```

Isso vai:
- Gerar um código de verificação
- Pedir pra você postar um tweet com o código
- Verificar e vincular o Twitter ao seu agente

### 3. Verificar na blockchain

```bash
npx agentidbase verify 0xSEU_HASH
```

Verifica diretamente na Base Mainnet se o agente está ancorado.

## Todos os Comandos

| Comando | Descrição |
|---------|-----------|
| `register` | Registra agente + ancora on-chain (grátis) |
| `verify <hash>` | Verifica identidade na blockchain |
| `verify-twitter <@handle>` | Vincula conta do Twitter |
| `qr <hash>` | Gera QR code de verificação |
| `proof <hash>` | Mostra comandos para verificar manualmente |
| `init` | Cria arquivo de configuração |

## Exemplo de Configuração (agent.json)

```json
{
  "name": "Meu Agente",
  "description": "Um assistente inteligente",
  "model": {
    "provider": "anthropic",
    "modelId": "claude-sonnet-4-20250514"
  },
  "systemPrompt": "Você é um assistente útil...",
  "parameters": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

## Variáveis de Ambiente

```bash
# Para assinar automaticamente (sem MetaMask)
export AGENTID_PRIVATE_KEY="sua-chave-privada"
```

## Links

- Website: https://id-agent.org
- Verificar agente: https://id-agent.org/verify/0xSEU_HASH
- Contrato: https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa

## FAQ

**Quanto custa?**
GRÁTIS. A AgentID paga todas as taxas de gas.

**Preciso de ETH?**
Não. A AgentID paga o gas por você.

**Preciso de MetaMask?**
Sim, para assinar a identidade. Ou configure AGENTID_PRIVATE_KEY.

**Posso verificar sem o CLI?**
Sim! Use cast, ethers.js, ou qualquer cliente Ethereum:
```bash
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa "verifyIdentity(bytes32)" 0xSEU_HASH --rpc-url https://mainnet.base.org
```

## Licença

MIT
