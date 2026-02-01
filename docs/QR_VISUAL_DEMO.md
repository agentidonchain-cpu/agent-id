# QR Code Visual Design

Visual reference for the AgentID QR Code system.

## QR Code Design

### Standard Layout

```
┌─────────────────────────────────┐
│                                 │
│  ┌─────────────────────────┐   │
│  │                         │   │
│  │   ████ ██ ████ ██ ████  │   │ ← QR Code Pattern
│  │   ████ ██ ████ ██ ████  │   │
│  │   ██   ██   ██ ██   ██  │   │
│  │   ██ ████ ████ ████ ██  │   │
│  │   ██ ████ ████ ████ ██  │   │
│  │          [A]            │   │ ← Logo in center (optional)
│  │   ██ ████ ████ ████ ██  │   │
│  │   ██   ██   ██ ██   ██  │   │
│  │   ████ ██ ████ ██ ████  │   │
│  │   ████ ██ ████ ██ ████  │   │
│  │                         │   │
│  └─────────────────────────┘   │
│                                 │
│      id-agent.org               │ ← URL Label
│                                 │
└─────────────────────────────────┘
   ^                           ^
   └─── Green Border ──────────┘
```

### Color Specifications

```css
/* QR Code */
.qr-foreground {
  color: #000000;  /* Black */
}

.qr-background {
  color: #ffffff;  /* White */
}

/* Border & Accents */
.qr-border {
  color: #22c55e;  /* Green-500 */
  opacity: 0.2;    /* 20% opacity */
}

/* URL Label */
.qr-label {
  color: #22c55e;  /* Green-500 */
  font-family: monospace;
  font-weight: bold;
}
```

### Size Variants

#### Compact (128px)
```
Usage: Agent cards, lists, small displays
No label, minimal padding
```

#### Standard (256px)
```
Usage: Modals, detail pages
With label, standard padding
```

#### Large (512px)
```
Usage: Full verification page, downloads
With label, large padding, high DPI
```

#### Print (2048px)
```
Usage: Physical materials, posters
With label, maximum quality
```

---

## Verification Page Layout

```
┌──────────────────────────────────────────────────────┐
│  AGENTID                                   [Header]  │
├──────────────────────────────────────────────────────┤
│                                                       │
│  [✓ VERIFIED ON-CHAIN]                    [Badge]   │
│                                                       │
│  ┌─────────────────┐   ┌──────────────────────────┐ │
│  │                 │   │ Identity Details         │ │
│  │     ████ ██     │   │ ────────────────────     │ │
│  │     ████ ██     │   │ Name: Agent Smith        │ │
│  │     ██   ██     │   │ Hash: 0x1234...          │ │
│  │     ██ ████     │   │ Creator: 0xabcd...       │ │
│  │        [A]      │   │ Registered: Jan 1, 2024  │ │
│  │     ██ ████     │   │ Block: #12345            │ │
│  │     ██   ██     │   │ Transaction: 0x5678...   │ │
│  │     ████ ██     │   │                          │ │
│  │     ████ ██     │   │ [View on BaseScan]       │ │
│  │                 │   │                          │ │
│  │  id-agent.org   │   │ Verify via CLI:          │ │
│  └─────────────────┘   │ $ npx agentidbase verify │ │
│                        │   0x1234...              │ │
│  [Download QR Code]    └──────────────────────────┘ │
│                                                       │
│  Capabilities: [chat] [code] [analysis]              │
│                                                       │
└──────────────────────────────────────────────────────┘
```

### Responsive Breakpoints

#### Desktop (>768px)
- 2-column grid
- QR on left, details on right
- QR size: 320px

#### Tablet (768px - 480px)
- 2-column grid (narrower)
- QR size: 256px

#### Mobile (<480px)
- 1-column stack
- QR size: 240px
- Centered layout

---

## Component States

### Loading State
```
┌─────────────────────┐
│                     │
│   ░░░░░░░░░░░░░░░   │ ← Skeleton loader
│   ░░░░░░░░░░░░░░░   │
│   ░░░░░░░░░░░░░░░   │
│                     │
│   Loading QR...     │
└─────────────────────┘
```

### Error State
```
┌─────────────────────┐
│                     │
│       ✗ Error       │
│                     │
│   Failed to load    │
│   QR code           │
│                     │
│   [Retry]           │
└─────────────────────┘
```

### Success State
```
┌─────────────────────┐
│                     │
│   ████████████████  │ ← Generated QR
│   ████████████████  │
│   ████████████████  │
│                     │
│   id-agent.org      │
│                     │
│   [Download PNG]    │
└─────────────────────┘
```

---

## CLI Output Example

```
$ npx agentidbase qr 0x1234567890abcdef...

⠋ Generating QR code...
✓ QR code generated successfully!

✓ QR Code Details:
────────────────────────────────────────────────────────────
  Identity Hash: 0x1234567890abcdef1234567890abcdef12345678...
  Verify URL:    https://id-agent.org/verify/0x1234567890ab...
  Image Size:    512x512
  Saved to:      /path/to/agent-12345678.png
────────────────────────────────────────────────────────────

Scan this QR code to verify the agent on-chain!

Terminal Preview:

█████████████████████████████████████
█████████████████████████████████████
████ ▄▄▄▄▄ ██▀█▄▀ ▀█ ▄ ▄▄▄▄▄ ████
████ █   █ █▄ ▀█  ▀▀  █ █   █ ████
████ █▄▄▄█ █ ▀▄ ▄▄█▀ ▀█ █▄▄▄█ ████
████▄▄▄▄▄▄▄█ █▄▀ ▀ ▀▄█ ▄▄▄▄▄▄▄████
████ ▀▀▄█▄▄▀▀▄▀▄▀█▀█▀ ▄ █  ▄▄▄████
████▀█▀  ▀▄▄  ▀▄█ █  ▀ ▀▄  ▄█▄████
████ ▄ █ ▄▄▄▀ ▀ ▄▀▄▀█  ▀█▄▀█▀▄████
████▄██▀▀▄▄▀▀█▄▀▀▄▀█▄▀▄█▀ ▀ █▄████
████▄▄▄█▄▄▄█ ▀▀▄▀▄█  ▄▄▄  ▄ █▄████
████ ▄▄▄▄▄ █▄▀ ▄█▀▀ █ █▄█ █▀ ▄████
████ █   █ █  ▀▄▀▄▀▀▀ ▄▄▄ ▀█▄▀████
████ █▄▄▄█ █  ▀▄▀ █▀▀█   ▀▄▀▀▄████
████▄▄▄▄▄▄▄█▄▄█▄██▄▄▄██▄████▄▄████
█████████████████████████████████████
█████████████████████████████████████
```

---

## API Response Examples

### PNG Format (Binary)

```http
GET /agents/0x123.../qr

200 OK
Content-Type: image/png
Content-Length: 12345
Cache-Control: public, max-age=86400
X-Agent-Hash: 0x123...

[Binary PNG data]
```

### Base64 Format (JSON)

```http
GET /agents/0x123.../qr?format=base64

200 OK
Content-Type: application/json

{
  "success": true,
  "data": {
    "identityHash": "0x1234567890abcdef...",
    "qrCode": "data:image/png;base64,iVBORw0KGgoAAAANSUhEU...",
    "url": "https://id-agent.org/verify/0x1234567890abcdef...",
    "size": 256
  },
  "meta": {
    "requestId": "uuid-here",
    "timestamp": "2024-02-01T12:00:00.000Z"
  }
}
```

---

## Logo Design

### SVG Logo (Simplified "A")

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <!-- White background -->
  <rect width="100" height="100" fill="white" rx="10"/>

  <!-- Green "A" letter -->
  <path d="M 50 20 L 70 80 L 60 80 L 56 65 L 44 65 L 40 80 L 30 80 Z
           M 50 35 L 46 55 L 54 55 Z"
        fill="#22c55e"
        stroke="#000"
        stroke-width="2"/>
</svg>
```

### Logo Placement

```
QR Code Size: 512px
Logo Size:    76px (15%)
Position:     Center (218px, 218px)
Background:   White square with border radius
```

---

## Accessibility Features

### ARIA Labels

```tsx
<div role="img" aria-label="QR code for agent verification">
  <QRCodeCanvas ... />
</div>

<button
  onClick={downloadQR}
  aria-label="Download QR code as PNG image"
>
  Download QR Code
</button>

<span className="sr-only">
  QR code linking to https://id-agent.org/verify/0x...
</span>
```

### Screen Reader Text

```tsx
<p className="sr-only">
  This QR code links to the verification page for agent
  {agentName || identityHash}. Scan with your phone camera
  to view on-chain verification details.
</p>
```

### Keyboard Navigation

- Download button: `Tab` to focus, `Enter` to download
- Copy buttons: `Tab` to focus, `Enter` to copy
- Links: Standard keyboard navigation

---

## Print Stylesheet

```css
@media print {
  /* Hide navigation and non-essential elements */
  header, footer, nav { display: none; }

  /* Center QR code on page */
  .qr-container {
    display: flex;
    justify-content: center;
    align-items: center;
    page-break-inside: avoid;
  }

  /* High contrast for printing */
  .qr-code {
    filter: contrast(1.2);
  }

  /* Add page metadata */
  @page {
    margin: 2cm;
  }

  .print-info::after {
    content: "Scan to verify at id-agent.org";
    display: block;
    text-align: center;
    margin-top: 1cm;
    font-size: 12pt;
  }
}
```

---

## Scanning Instructions

### For Users

1. **Open Camera App**
   - iOS: Native Camera app
   - Android: Google Camera or any QR scanner

2. **Point at QR Code**
   - Ensure good lighting
   - Hold steady until recognized
   - Keep 6-12 inches away

3. **Tap Notification**
   - Link will appear at top of screen
   - Tap to open in browser

4. **View Verification**
   - See agent details
   - Verify on-chain status
   - Check creator and timestamp

### For Developers

```typescript
// Implement QR scanner in your app
import { Camera } from 'expo-camera';

function QRScanner() {
  const handleScan = ({ data }: { data: string }) => {
    // Extract hash from URL
    const match = data.match(/verify\/(.+)$/);
    if (match) {
      const hash = match[1];
      navigateToAgent(hash);
    }
  };

  return (
    <Camera
      onBarCodeScanned={handleScan}
      barCodeScannerSettings={{
        barCodeTypes: ['qr']
      }}
    />
  );
}
```

---

## Marketing Materials

### Business Card Design

```
┌────────────────────────────────┐
│                                │
│  AGENTID                       │
│  License to Verify             │
│                                │
│  ┌──────────────┐              │
│  │  QR CODE     │  Agent Name  │
│  │  [████ ████] │  0x1234...   │
│  │  [████ ████] │              │
│  │  [id-agent]  │  Verified    │
│  └──────────────┘  On-Chain    │
│                                │
│  id-agent.org                  │
└────────────────────────────────┘
```

### Poster Template

```
┌─────────────────────────────────────────┐
│                                         │
│           VERIFIED AI AGENT             │
│                                         │
│        ┌───────────────────┐            │
│        │                   │            │
│        │   QR CODE HERE    │            │
│        │   [Large 512px]   │            │
│        │                   │            │
│        │   id-agent.org    │            │
│        └───────────────────┘            │
│                                         │
│  Identity Hash: 0x1234567890...         │
│  Registered: January 1, 2024            │
│  Status: ✓ Verified On-Chain            │
│                                         │
│  Scan to verify identity and view       │
│  complete on-chain verification         │
│                                         │
└─────────────────────────────────────────┘
```

---

## Integration Examples

### Email Signature

```html
<table>
  <tr>
    <td>
      <img src="https://api.agentid.xyz/agents/0x123.../qr?size=128"
           alt="Agent QR Code"
           width="128"
           height="128">
    </td>
    <td style="padding-left: 20px;">
      <strong>AI Agent Name</strong><br>
      Verified on AgentID<br>
      <a href="https://id-agent.org/verify/0x123...">Verify Identity</a>
    </td>
  </tr>
</table>
```

### Social Media Profile

```
Profile Picture: Logo with QR overlay
Bio: "Verified AI Agent | Scan QR to verify ↓"
Link: https://id-agent.org/verify/0x123...
```

---

This visual guide ensures consistent implementation across all platforms.
