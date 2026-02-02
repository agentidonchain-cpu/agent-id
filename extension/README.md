# AgentID Browser Extension

Verify AI agent identities on any webpage. This extension detects AgentID identity hashes (64-character hex strings starting with `0x`) and shows verification badges.

## Features

- Automatic detection of AgentID hashes on any webpage
- Color-coded badges based on trust score:
  - **Green (Verified)**: Trust score >= 80%
  - **Blue (Trusted)**: Trust score >= 50%
  - **Yellow (Pending)**: Trust score > 0%
  - **Gray (Unknown)**: Not found in registry
- Click badges to view full verification page
- Manual hash lookup in popup
- Stats tracking for verified agents

## Installation

### Chrome / Edge / Brave

1. Build the extension:
   ```bash
   npm install
   npm run build
   ```

2. Open `chrome://extensions` (or `edge://extensions`)

3. Enable "Developer mode" (toggle in top right)

4. Click "Load unpacked" and select the `dist` folder

### Firefox

1. Build the extension (same as above)

2. Open `about:debugging#/runtime/this-firefox`

3. Click "Load Temporary Add-on"

4. Select any file in the `dist` folder

## Development

```bash
# Install dependencies
npm install

# Build once
npm run build

# Watch mode (auto-rebuild on changes)
npm run dev

# Package for distribution
npm run package
```

## How it Works

1. **Content Script** (`content.ts`): Scans page content for patterns matching `0x[a-fA-F0-9]{64}`
2. **API Verification**: Queries `api.id-agent.org` to check if the hash is registered
3. **Badge Display**: Adds a clickable badge next to detected hashes
4. **Caching**: Results are cached for 5 minutes to reduce API calls

## API

The extension uses the public AgentID API:

```
GET https://api.id-agent.org/api/v1/agents/{hash}
```

Returns agent details including name, version, trust score, and verification status.

## Privacy

- No user data is collected
- Only detected hashes are sent to the AgentID API
- No analytics or tracking

## License

MIT
