# QR Code System - Quick Start

Complete QR code implementation for AgentID verification.

## Quick Links

- **Full Documentation**: [QR_CODE_GUIDE.md](./QR_CODE_GUIDE.md)
- **Website**: https://id-agent.org
- **Contract**: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa (Base Mainnet)

---

## Features

### 1. React Component
Reusable QR code component for web applications.

```tsx
import QRCode from '@/components/QRCode';

<QRCode identityHash="0x123..." size={256} downloadable />
```

### 2. Verification Page
Dedicated page for each agent at:
```
https://id-agent.org/verify/{identityHash}
```

### 3. API Endpoint
Generate QR codes programmatically:
```bash
curl https://api.agentid.xyz/agents/0x123.../qr > agent.png
```

### 4. CLI Command
Generate QR codes from terminal:
```bash
npx agentidbase qr 0x123... --output agent.png --size 512
```

---

## Installation

### Website (React)
```bash
cd website
npm install qrcode.react
```

### Backend (API)
```bash
npm install qrcode
npm install --save-dev @types/qrcode
```

### CLI
```bash
cd cli
npm install qrcode
npm install --save-dev @types/qrcode
npm run build
```

---

## Usage Examples

### 1. Generate QR with CLI
```bash
# Basic usage
npx agentidbase qr 0x1234567890abcdef...

# Output: agent-12345678.png (512x512)

# Custom options
npx agentidbase qr 0x123... \
  --output my-agent.png \
  --size 1024 \
  --dir ./qr-codes
```

### 2. API Usage
```bash
# Get PNG image
curl "https://api.agentid.xyz/agents/0x123.../qr" > agent.png

# Get base64 JSON
curl "https://api.agentid.xyz/agents/0x123.../qr?format=base64"

# Custom size
curl "https://api.agentid.xyz/agents/0x123.../qr?size=512" > large.png
```

### 3. React Component
```tsx
import QRCode from '@/components/QRCode';

function AgentCard({ agent }) {
  return (
    <div>
      <h2>{agent.name}</h2>
      <QRCode
        identityHash={agent.hash}
        size={256}
        downloadable
      />
    </div>
  );
}
```

### 4. Verification Page
Visit or share this URL:
```
https://id-agent.org/verify/0x1234567890abcdef...
```

The page shows:
- Large QR code (downloadable)
- Agent identity details
- Creator address (link to BaseScan)
- Transaction hash (link to BaseScan)
- CLI verification command

---

## Testing

### Run Test Script
```bash
cd /home/lumen/Downloads/Agent007
./scripts/test-qr.sh
```

This will:
1. Build CLI
2. Generate test QR code
3. Test API endpoint (if server running)
4. Verify website component

### Manual Testing

#### 1. Test CLI
```bash
cd cli
npm run build
node dist/index.js qr 0xTEST... --output test.png
```

#### 2. Test API
```bash
# Start backend
npm run dev

# Generate QR
curl http://localhost:3000/agents/0xTEST.../qr > test.png
```

#### 3. Test Website
```bash
# Start website
cd website
npm run dev

# Visit page
open http://localhost:3001/verify/0xTEST...
```

---

## Files Reference

### Created Files
```
website/
├── src/
│   ├── components/
│   │   └── QRCode.tsx                    # React component
│   └── app/
│       └── verify/
│           └── [hash]/
│               └── page.tsx               # Verification page
└── public/
    └── logo-a.svg                         # AgentID logo

src/
└── routes/
    └── agents.ts                          # Updated: Added /qr endpoint

cli/
└── src/
    ├── commands/
    │   └── qr.ts                          # QR command
    └── index.ts                           # Updated: Registered qr command

docs/
├── QR_CODE_GUIDE.md                       # Full documentation
└── QR_CODE_README.md                      # This file

scripts/
└── test-qr.sh                             # Test script
```

### Modified Files
- `/home/lumen/Downloads/Agent007/src/routes/agents.ts` - Added QR endpoint
- `/home/lumen/Downloads/Agent007/cli/src/index.ts` - Registered QR command
- `/home/lumen/Downloads/Agent007/website/package.json` - Added qrcode.react
- `/home/lumen/Downloads/Agent007/cli/package.json` - Added qrcode
- `/home/lumen/Downloads/Agent007/package.json` - Added qrcode

---

## Design Specifications

### QR Code
- **Size**: Default 512px (CLI), 256px (Web), 128px (Compact)
- **Colors**: Black on white, green accent border
- **Error Correction**: Level H (30% - allows logo overlay)
- **URL**: `https://id-agent.org/verify/{identityHash}`

### Verification Page
- **Theme**: Dark mode, terminal aesthetic
- **Colors**: Black background, green text (#22c55e)
- **Font**: Monospace (system-ui)
- **Layout**: Responsive grid (2 columns desktop, 1 mobile)

### Logo (Optional)
- **Format**: SVG or PNG
- **Size**: 128x128px
- **Position**: Center of QR code (15% of QR size)
- **Background**: White square

---

## Environment Variables

### Website (.env.local)
```bash
NEXT_PUBLIC_API_URL=https://api.agentid.xyz
NEXT_PUBLIC_SITE_URL=https://id-agent.org
NEXT_PUBLIC_CONTRACT_ADDRESS=0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
NEXT_PUBLIC_BASESCAN_URL=https://basescan.org
```

### Development
```bash
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_SITE_URL=http://localhost:3001
```

---

## Troubleshooting

### QR Not Scanning
- Increase size: `--size 1024`
- Ensure good contrast (black on white)
- Use error correction level H
- Test with multiple QR scanner apps

### API 404 Error
- Check agent exists: `curl https://api.agentid.xyz/agents/{hash}`
- Verify hash format: Must start with `0x` and be 64 chars
- Check server logs for errors

### Website Build Error
- Clear Next.js cache: `rm -rf .next`
- Reinstall dependencies: `npm install`
- Check Node version: `node -v` (needs >=18.0.0)

### CLI Build Error
- Install types: `npm install --save-dev @types/qrcode`
- Clear dist: `rm -rf dist`
- Rebuild: `npm run build`

---

## Performance Tips

### Web Component
```tsx
// Lazy load for better performance
import { lazy, Suspense } from 'react';
const QRCode = lazy(() => import('@/components/QRCode'));

<Suspense fallback={<div>Loading QR...</div>}>
  <QRCode identityHash={hash} />
</Suspense>
```

### API Caching
The API endpoint sets cache headers:
```
Cache-Control: public, max-age=86400
```
QR codes are cached for 24 hours.

### Size Optimization
- **Cards**: 128px
- **Modals**: 256px
- **Full Page**: 512px
- **Print**: 2048px

---

## Security

### Input Validation
All hash inputs are validated:
```typescript
const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
```

### Rate Limiting
API endpoint is rate-limited:
- 100 requests per minute per IP

### XSS Protection
- All user inputs sanitized
- Next.js built-in XSS protection
- No direct HTML rendering

---

## Next Steps

1. **Test**: Run `./scripts/test-qr.sh`
2. **Deploy**: Update production environment variables
3. **Logo**: Add PNG logo at `/public/logo-a.png`
4. **Analytics**: Track QR scans and verifications
5. **Documentation**: Add to main README

---

## Support

- **Documentation**: [QR_CODE_GUIDE.md](./QR_CODE_GUIDE.md)
- **GitHub**: https://github.com/agentidonchain-cpu/agent-id
- **Website**: https://id-agent.org

---

## License

MIT License - See LICENSE file for details
