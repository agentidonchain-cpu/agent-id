# QR Code System - AgentID

Complete implementation of QR code generation and verification for AI agents.

## Overview

The QR code system allows agents to have scannable codes that link to their on-chain verification page at `https://id-agent.org/verify/{identityHash}`.

## Features

- **React Component** - Reusable QR code component with download capability
- **Verification Page** - Dedicated page showing agent details and QR code
- **API Endpoint** - Generate QR codes programmatically
- **CLI Command** - Generate QR codes from terminal

---

## 1. React Component

### Installation

```bash
cd website
npm install qrcode.react
```

### Usage

```tsx
import QRCode from '@/components/QRCode';

// Basic usage
<QRCode identityHash="0x123..." />

// Custom size with download
<QRCode identityHash="0x123..." size={512} downloadable />

// Compact version (no URL label)
import { QRCodeCompact } from '@/components/QRCode';
<QRCodeCompact identityHash="0x123..." size={128} />
```

### Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `identityHash` | string | required | Agent's identity hash |
| `size` | number | 256 | QR code size in pixels |
| `showUrl` | boolean | true | Show "id-agent.org" label |
| `downloadable` | boolean | false | Show download button |
| `className` | string | '' | Additional CSS classes |

### Design Specifications

- **Colors**:
  - QR Code: Black (#000000)
  - Background: White (#ffffff)
  - Accent/Border: Green (#22c55e)
- **Error Correction**: Level H (30% - high, for logo overlay)
- **Border**: 2px green border with 20% opacity
- **Label**: "id-agent.org" in monospace font below QR

---

## 2. Verification Page

### URL Structure

```
https://id-agent.org/verify/{identityHash}
```

### Features

- **Large QR Code** - 320x320px with download button
- **Agent Details**:
  - Identity Hash (copyable)
  - Creator Address (link to BaseScan)
  - Registration Timestamp
  - Block Number (link to BaseScan)
  - Transaction Hash (link to BaseScan)
- **Quick Actions**:
  - View Contract on BaseScan
  - CLI Verification Command
- **Responsive Design** - Mobile-first, terminal aesthetic

### API Integration

The page fetches agent data from:
```
GET https://api.agentid.xyz/agents/{hash}
```

Response:
```json
{
  "identityHash": "0x...",
  "name": "Agent Name",
  "creator": "0x...",
  "timestamp": 1234567890,
  "blockNumber": 12345,
  "transactionHash": "0x...",
  "status": "verified",
  "metadata": {
    "model": "gpt-4",
    "version": "1.0",
    "capabilities": ["chat", "code"]
  }
}
```

---

## 3. API Endpoint

### Generate QR Code

```http
GET /agents/:identityHash/qr
```

#### Parameters

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `format` | query | 'png' | 'png', 'base64', or 'json' |
| `size` | query | '256' | Image size in pixels |

#### Examples

**PNG Image:**
```bash
curl https://api.agentid.xyz/agents/0x123.../qr > agent.png
```

**Base64 JSON:**
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr?format=base64"
```

Response:
```json
{
  "success": true,
  "data": {
    "identityHash": "0x...",
    "qrCode": "data:image/png;base64,...",
    "url": "https://id-agent.org/verify/0x...",
    "size": 256
  },
  "meta": {
    "requestId": "...",
    "timestamp": "2024-02-01T12:00:00Z"
  }
}
```

**Custom Size:**
```bash
curl "https://api.agentid.xyz/agents/0x123.../qr?size=512"
```

#### Response Headers (PNG)

```
Content-Type: image/png
Content-Length: 12345
Cache-Control: public, max-age=86400
X-Agent-Hash: 0x...
```

---

## 4. CLI Command

### Installation

```bash
npm install -g agentidbase
```

### Usage

```bash
# Basic - generates agent-{hash}.png
npx agentidbase qr 0x123...

# Custom filename
npx agentidbase qr 0x123... --output my-agent.png

# Custom size
npx agentidbase qr 0x123... --size 1024

# Custom directory
npx agentidbase qr 0x123... --dir ./qr-codes
```

### Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--output` | `-o` | agent-{hash}.png | Output filename |
| `--size` | `-s` | 512 | Image size in pixels |
| `--dir` | `-d` | current dir | Output directory |

### Output Example

```
✓ QR code generated successfully!

✓ QR Code Details:
────────────────────────────────────────────────────────────
  Identity Hash: 0x1234567890abcdef...
  Verify URL:    https://id-agent.org/verify/0x1234...
  Image Size:    512x512
  Saved to:      /path/to/agent-12345678.png
────────────────────────────────────────────────────────────

Scan this QR code to verify the agent on-chain!

Terminal Preview:
█████████████████████████████
█████████████████████████████
███ ▄▄▄▄▄ █▀▀█▄█ ▄▄▄▄▄ ███
███ █   █ █▄█▀▀█ █   █ ███
...
```

---

## 5. Integration Examples

### In Agent Dashboard

```tsx
import QRCode from '@/components/QRCode';

function AgentCard({ agent }) {
  return (
    <div className="card">
      <h2>{agent.name}</h2>
      <QRCode
        identityHash={agent.hash}
        size={200}
        downloadable
      />
    </div>
  );
}
```

### Email Notifications

```typescript
// Generate base64 QR for email
const response = await fetch(
  `https://api.agentid.xyz/agents/${hash}/qr?format=base64`
);
const { data } = await response.json();

// Use in HTML email
const html = `
  <img src="${data.qrCode}" alt="Agent QR Code" />
  <a href="${data.url}">Verify Agent</a>
`;
```

### Physical Printouts

```bash
# Generate high-res QR for printing
npx agentidbase qr 0x123... --size 2048 --output print-qr.png

# Print with details
convert print-qr.png \
  -gravity south \
  -pointsize 48 \
  -annotate +0+20 'id-agent.org' \
  final-print.png
```

### Mobile App Integration

```typescript
// React Native / Expo
import { Camera } from 'expo-camera';

function QRScanner() {
  const handleBarCodeScanned = ({ data }) => {
    // data = "https://id-agent.org/verify/0x123..."
    const hash = data.split('/verify/')[1];

    // Verify agent
    navigation.navigate('AgentVerify', { hash });
  };

  return (
    <Camera
      onBarCodeScanned={handleBarCodeScanned}
      barCodeScannerSettings={{
        barCodeTypes: ['qr'],
      }}
    />
  );
}
```

---

## 6. Testing

### Test QR Code Generation

```bash
# 1. Start backend
cd /home/lumen/Downloads/Agent007
npm run dev

# 2. Test API endpoint
curl http://localhost:3000/agents/0xTEST.../qr > test-qr.png

# 3. Test CLI
cd cli
npm run build
node dist/index.js qr 0xTEST...
```

### Test Verification Page

```bash
# 1. Start website
cd website
npm run dev

# 2. Visit page
open http://localhost:3001/verify/0xTEST...
```

### Accessibility Testing

```bash
# Install axe-core
npm install -D @axe-core/cli

# Test verification page
npx axe http://localhost:3001/verify/0xTEST...
```

**Required ARIA attributes:**
- QR image has `aria-label`
- Copyable fields have `aria-label="Copy to clipboard"`
- Links have descriptive text (not just "click here")

---

## 7. Performance

### QR Code Component

- **Memoization**: Use `React.memo()` for lists
- **Lazy Loading**: Dynamic import for qrcode.react
- **Size Optimization**: Use appropriate sizes (128px for cards, 256px for modals)

```tsx
// Lazy load QR component
const QRCode = lazy(() => import('@/components/QRCode'));

<Suspense fallback={<QRSkeleton />}>
  <QRCode identityHash={hash} />
</Suspense>
```

### API Caching

- **Cache-Control**: 24 hours for PNG responses
- **CDN**: Use Cloudflare or similar for static QR images
- **Rate Limiting**: 100 requests/minute per IP

---

## 8. Security Considerations

### Input Validation

```typescript
// Always validate identity hash
const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;

if (!HASH_REGEX.test(identityHash)) {
  throw new ValidationError('Invalid identity hash');
}
```

### XSS Prevention

- Never render user input directly in QR URL
- Always sanitize agent names and metadata
- Use Next.js built-in XSS protection

### Rate Limiting

```typescript
// API rate limiting (already implemented)
app.use('/agents/:hash/qr', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
}));
```

---

## 9. Troubleshooting

### QR Code Not Scanning

1. **Increase Error Correction**: Use level 'H' for damaged/small codes
2. **Increase Size**: Minimum 256px recommended
3. **Check Contrast**: Ensure dark/light colors have enough contrast
4. **Test with Multiple Apps**: Try different QR scanners

### Logo Not Displaying

1. Check logo file exists at `/public/logo-a.png`
2. Verify imageSettings in QRCodeCanvas
3. Ensure logo is square (1:1 aspect ratio)
4. Logo should be max 20% of QR size

### Verification Page Not Loading

1. **Check API URL**: Verify NEXT_PUBLIC_API_URL is set
2. **CORS Issues**: Ensure API allows website origin
3. **Network Tab**: Check browser console for errors
4. **Agent Not Found**: Verify hash exists in database

---

## 10. Constants Reference

```typescript
// Website URL
const SITE_URL = 'https://id-agent.org';

// Contract Address (Base Mainnet)
const CONTRACT_ADDRESS = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';

// BaseScan URLs
const BASESCAN_URL = 'https://basescan.org';

// Colors
const QR_COLOR = '#000000';      // Black
const BG_COLOR = '#ffffff';      // White
const ACCENT_COLOR = '#22c55e';  // Green-500

// Sizes
const DEFAULT_SIZE = 256;
const COMPACT_SIZE = 128;
const LARGE_SIZE = 512;
const PRINT_SIZE = 2048;
```

---

## Files Created

### Website
- `/home/lumen/Downloads/Agent007/website/src/components/QRCode.tsx`
- `/home/lumen/Downloads/Agent007/website/src/app/verify/[hash]/page.tsx`
- `/home/lumen/Downloads/Agent007/website/public/logo-a.svg`

### Backend
- Updated: `/home/lumen/Downloads/Agent007/src/routes/agents.ts` (added /qr endpoint)

### CLI
- `/home/lumen/Downloads/Agent007/cli/src/commands/qr.ts`
- Updated: `/home/lumen/Downloads/Agent007/cli/src/index.ts`

---

## Next Steps

1. **Add Logo**: Create PNG version of logo-a.svg (128x128px)
2. **Testing**: Write unit tests for QR component
3. **E2E Tests**: Test full verification flow
4. **Analytics**: Track QR scans and verifications
5. **Documentation**: Add to main README
6. **Deploy**: Update production environment

---

## Support

For issues or questions:
- GitHub: https://github.com/agentidonchain-cpu/agent-id
- Docs: https://id-agent.org/docs
- Discord: https://discord.gg/agentid
