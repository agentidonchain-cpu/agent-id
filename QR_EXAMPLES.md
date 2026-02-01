# QR Code - Exemplos Práticos de Uso

Exemplos reais e práticos de como usar o sistema de QR Code do AgentID.

---

## 📱 Exemplos CLI

### Básico - Gerar QR padrão
```bash
npx agentidbase qr 0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef
```

**Output**:
```
✓ QR code generated successfully!

✓ QR Code Details:
────────────────────────────────────────────────────────────
  Identity Hash: 0x1234567890abcdef...
  Verify URL:    https://id-agent.org/verify/0x1234...
  Image Size:    512x512
  Saved to:      /current/dir/agent-12345678.png
────────────────────────────────────────────────────────────
```

---

### Custom - Nome e tamanho personalizados
```bash
npx agentidbase qr 0x123... \
  --output my-agent-qr.png \
  --size 1024
```

**Resultado**: `my-agent-qr.png` com 1024x1024 pixels

---

### Organizado - Salvar em diretório específico
```bash
# Criar diretório
mkdir -p ./agent-qr-codes

# Gerar QR
npx agentidbase qr 0x123... \
  --output agent-smith.png \
  --dir ./agent-qr-codes \
  --size 512
```

**Resultado**: `./agent-qr-codes/agent-smith.png`

---

### Lote - Múltiplos agentes
```bash
#!/bin/bash
# Script para gerar QRs de múltiplos agentes

AGENTS=(
  "0x1111111111111111111111111111111111111111111111111111111111111111"
  "0x2222222222222222222222222222222222222222222222222222222222222222"
  "0x3333333333333333333333333333333333333333333333333333333333333333"
)

mkdir -p qr-codes

for hash in "${AGENTS[@]}"; do
  short=$(echo $hash | cut -c1-10)
  npx agentidbase qr $hash \
    --output "agent-${short}.png" \
    --dir ./qr-codes \
    --size 512
done

echo "Generated ${#AGENTS[@]} QR codes in ./qr-codes"
```

---

### Alta Resolução - Para impressão
```bash
npx agentidbase qr 0x123... \
  --output print-qr.png \
  --size 2048
```

**Uso**: Cartões de visita, pôsteres, materiais físicos

---

## 🌐 Exemplos API

### PNG - Download direto
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr" \
  -o agent.png
```

---

### Base64 - Para embedding
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr?format=base64" \
  | jq -r '.data.qrCode'
```

**Output**: `data:image/png;base64,iVBORw0KGgo...`

---

### JSON - Dados completos
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr?format=json" \
  | jq .
```

**Output**:
```json
{
  "success": true,
  "data": {
    "identityHash": "0x123...",
    "qrCode": "data:image/png;base64,...",
    "url": "https://id-agent.org/verify/0x123...",
    "size": 256
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2024-02-01T12:00:00Z"
  }
}
```

---

### Custom Size - 512x512
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr?size=512" \
  -o large-qr.png
```

---

### Multiple Sizes - Batch download
```bash
#!/bin/bash
HASH="0x123..."
SIZES=(128 256 512 1024)

for size in "${SIZES[@]}"; do
  curl "https://api.agentid.xyz/agents/${HASH}/qr?size=${size}" \
    -o "qr-${size}.png"
done
```

**Resultado**: `qr-128.png`, `qr-256.png`, `qr-512.png`, `qr-1024.png`

---

## ⚛️ Exemplos React

### Básico - Componente simples
```tsx
import QRCode from '@/components/QRCode';

export default function AgentProfile({ agent }) {
  return (
    <div>
      <h1>{agent.name}</h1>
      <QRCode identityHash={agent.hash} />
    </div>
  );
}
```

---

### Downloadable - Com botão de download
```tsx
import QRCode from '@/components/QRCode';

export default function AgentCard({ agent }) {
  return (
    <div className="card">
      <h2>{agent.name}</h2>
      <p>Hash: {agent.hash.slice(0, 10)}...</p>

      <QRCode
        identityHash={agent.hash}
        size={256}
        downloadable
      />
    </div>
  );
}
```

---

### Compact - Para listas
```tsx
import { QRCodeCompact } from '@/components/QRCode';

export default function AgentList({ agents }) {
  return (
    <ul>
      {agents.map(agent => (
        <li key={agent.hash}>
          <QRCodeCompact identityHash={agent.hash} size={64} />
          <span>{agent.name}</span>
        </li>
      ))}
    </ul>
  );
}
```

---

### Large - Modal completo
```tsx
import { useState } from 'react';
import QRCode from '@/components/QRCode';

export default function AgentModal({ agent }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(true)}>
        Show QR Code
      </button>

      {isOpen && (
        <div className="modal">
          <QRCode
            identityHash={agent.hash}
            size={512}
            downloadable
          />
          <button onClick={() => setIsOpen(false)}>
            Close
          </button>
        </div>
      )}
    </>
  );
}
```

---

### Lazy Loading - Performance otimizada
```tsx
import { lazy, Suspense } from 'react';

const QRCode = lazy(() => import('@/components/QRCode'));

export default function AgentPage({ agent }) {
  return (
    <div>
      <h1>{agent.name}</h1>

      <Suspense fallback={<div>Loading QR...</div>}>
        <QRCode
          identityHash={agent.hash}
          size={320}
          downloadable
        />
      </Suspense>
    </div>
  );
}
```

---

### Conditional - Apenas para verified
```tsx
import QRCode from '@/components/QRCode';

export default function AgentProfile({ agent }) {
  return (
    <div>
      <h1>{agent.name}</h1>

      {agent.status === 'verified' ? (
        <QRCode
          identityHash={agent.hash}
          size={256}
          downloadable
        />
      ) : (
        <p>Agent not yet verified</p>
      )}
    </div>
  );
}
```

---

## 🔗 Exemplos de Integração

### Email - Notificação com QR
```html
<!DOCTYPE html>
<html>
<body>
  <h1>Agent Verified!</h1>
  <p>Your agent has been verified on-chain.</p>

  <img
    src="https://api.agentid.xyz/agents/{{HASH}}/qr?size=256"
    alt="Agent QR Code"
    width="256"
    height="256"
  />

  <p>
    <a href="https://id-agent.org/verify/{{HASH}}">
      View Verification Page
    </a>
  </p>
</body>
</html>
```

---

### Dashboard - Widget de QR
```tsx
import QRCode from '@/components/QRCode';

export default function QRWidget({ agentHash }) {
  return (
    <div className="widget">
      <h3>Agent QR Code</h3>

      <QRCode
        identityHash={agentHash}
        size={200}
        showUrl={true}
      />

      <div className="actions">
        <button>Share</button>
        <button>Download</button>
      </div>
    </div>
  );
}
```

---

### Mobile App - Scanner e Display
```typescript
// React Native / Expo
import { Camera } from 'expo-camera';
import { useState } from 'react';

export default function QRScanner() {
  const [scanned, setScanned] = useState(false);
  const [agentHash, setAgentHash] = useState('');

  const handleBarCodeScanned = ({ data }) => {
    // data = "https://id-agent.org/verify/0x123..."
    const match = data.match(/verify\/(.+)$/);

    if (match) {
      setAgentHash(match[1]);
      setScanned(true);

      // Navigate to agent details
      navigation.navigate('AgentDetails', { hash: match[1] });
    }
  };

  return (
    <Camera
      onBarCodeScanned={scanned ? undefined : handleBarCodeScanned}
      barCodeScannerSettings={{
        barCodeTypes: ['qr']
      }}
    />
  );
}
```

---

### Social Share - Compartilhar QR
```tsx
import QRCode from '@/components/QRCode';

export default function ShareAgent({ agent }) {
  const shareUrl = `https://id-agent.org/verify/${agent.hash}`;

  const handleShare = async () => {
    if (navigator.share) {
      await navigator.share({
        title: `${agent.name} - AgentID`,
        text: 'Verify this AI agent on-chain',
        url: shareUrl
      });
    }
  };

  return (
    <div>
      <QRCode identityHash={agent.hash} size={256} />

      <button onClick={handleShare}>
        Share Agent
      </button>
    </div>
  );
}
```

---

### Profile Card - Business card digital
```tsx
import QRCode from '@/components/QRCode';

export default function ProfileCard({ agent }) {
  return (
    <div className="profile-card">
      <div className="left">
        <h1>{agent.name}</h1>
        <p>Identity Hash: {agent.hash.slice(0, 10)}...</p>
        <p>Creator: {agent.creator.slice(0, 10)}...</p>
        <span className="badge">✓ Verified On-Chain</span>
      </div>

      <div className="right">
        <QRCode
          identityHash={agent.hash}
          size={180}
          showUrl={true}
        />
      </div>
    </div>
  );
}
```

---

## 🖨️ Exemplos de Impressão

### PDF Generation - Node.js
```typescript
import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import fs from 'fs';

async function generateAgentPDF(agent) {
  const doc = new PDFDocument();
  doc.pipe(fs.createWriteStream('agent-card.pdf'));

  // Title
  doc.fontSize(25).text(agent.name, 100, 50);

  // QR Code
  const qrBuffer = await QRCode.toBuffer(
    `https://id-agent.org/verify/${agent.hash}`,
    { width: 300 }
  );
  doc.image(qrBuffer, 150, 100, { width: 300 });

  // Info
  doc.fontSize(12).text(`Hash: ${agent.hash}`, 100, 450);
  doc.text(`Creator: ${agent.creator}`, 100, 470);
  doc.text('Scan to verify on-chain', 100, 490);

  doc.end();
}
```

---

### Print Stylesheet - CSS
```css
@media print {
  /* Hide non-essential elements */
  header, footer, nav, .no-print {
    display: none !important;
  }

  /* Center QR on page */
  .qr-container {
    display: flex;
    justify-content: center;
    align-items: center;
    page-break-inside: avoid;
    padding: 2cm;
  }

  /* High contrast */
  .qr-code {
    filter: contrast(1.2);
  }

  /* Add print info */
  .qr-container::after {
    content: "Scan to verify at id-agent.org";
    display: block;
    text-align: center;
    margin-top: 1cm;
    font-size: 14pt;
  }

  @page {
    margin: 2cm;
    size: A4;
  }
}
```

---

## 📊 Exemplos de Análise

### Track QR Scans - Analytics
```typescript
// Add to verification page
import { useEffect } from 'react';

export default function VerifyPage({ hash }) {
  useEffect(() => {
    // Track QR scan
    analytics.track('qr_scanned', {
      identityHash: hash,
      timestamp: new Date().toISOString(),
      source: 'qr_code',
      userAgent: navigator.userAgent
    });
  }, [hash]);

  return (
    // Page content...
  );
}
```

---

### QR Stats Dashboard
```typescript
interface QRStats {
  totalScans: number;
  uniqueScans: number;
  topAgents: Array<{ hash: string; scans: number }>;
}

async function getQRStats(): Promise<QRStats> {
  const response = await fetch('/api/analytics/qr-stats');
  return response.json();
}

export default function StatsPage() {
  const [stats, setStats] = useState<QRStats>();

  useEffect(() => {
    getQRStats().then(setStats);
  }, []);

  return (
    <div>
      <h1>QR Code Statistics</h1>
      <p>Total Scans: {stats?.totalScans}</p>
      <p>Unique Scans: {stats?.uniqueScans}</p>

      <h2>Top Agents</h2>
      <ul>
        {stats?.topAgents.map(agent => (
          <li key={agent.hash}>
            {agent.hash}: {agent.scans} scans
          </li>
        ))}
      </ul>
    </div>
  );
}
```

---

## 🔧 Exemplos de Automação

### GitHub Actions - Auto-generate QRs
```yaml
name: Generate QR Codes

on:
  push:
    paths:
      - 'agents/*.json'

jobs:
  generate-qrs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2

      - name: Setup Node
        uses: actions/setup-node@v2
        with:
          node-version: '18'

      - name: Install CLI
        run: npm install -g agentidbase

      - name: Generate QRs
        run: |
          mkdir -p qr-codes
          for file in agents/*.json; do
            hash=$(jq -r '.identityHash' $file)
            npx agentidbase qr $hash \
              --output "qr-codes/$(basename $file .json).png" \
              --size 512
          done

      - name: Upload Artifacts
        uses: actions/upload-artifact@v2
        with:
          name: qr-codes
          path: qr-codes/
```

---

### Cron Job - Refresh QRs
```bash
#!/bin/bash
# refresh-qrs.sh
# Atualizar QR codes diariamente

cd /var/www/agentid/qr-codes

# Limpar QRs antigos
find . -name "*.png" -mtime +7 -delete

# Buscar agentes ativos
curl https://api.agentid.xyz/agents?status=active \
  | jq -r '.[].identityHash' \
  | while read hash; do
      npx agentidbase qr $hash --size 512
    done

echo "QR codes refreshed: $(date)"
```

**Crontab**:
```cron
0 2 * * * /path/to/refresh-qrs.sh >> /var/log/qr-refresh.log 2>&1
```

---

## 🎨 Exemplos de Customização

### Custom Colors - CSS Override
```tsx
import QRCode from '@/components/QRCode';

export default function BrandedQR({ hash }) {
  return (
    <div style={{
      '--qr-fg': '#1a1a1a',
      '--qr-bg': '#f5f5f5',
      '--qr-accent': '#ff6b35'
    }}>
      <QRCode identityHash={hash} size={256} />
    </div>
  );
}
```

---

## 🚀 Exemplos de Deploy

### Vercel Deployment
```json
{
  "builds": [
    { "src": "website/package.json", "use": "@vercel/next" }
  ],
  "env": {
    "NEXT_PUBLIC_API_URL": "https://api.agentid.xyz",
    "NEXT_PUBLIC_SITE_URL": "https://id-agent.org"
  }
}
```

---

Estes exemplos cobrem os casos de uso mais comuns. Para mais detalhes, consulte:
- [QR_CODE_GUIDE.md](./docs/QR_CODE_GUIDE.md)
- [QR_CODE_README.md](./docs/QR_CODE_README.md)
