// AgentID Content Script
// Detects identity hashes on pages and adds verification badges
export {};

const API_BASE = 'https://api.id-agent.org/api/v1';
const HASH_REGEX = /\b0x[a-fA-F0-9]{64}\b/g;

interface AgentData {
  identityHash: string;
  name?: string;
  version?: string;
  verified?: boolean;
  verificationSource?: string;
  trustScore?: number;
  twitter?: {
    handle: string;
    verified: boolean;
  };
}

interface CacheEntry {
  data: AgentData | null;
  timestamp: number;
}

// Cache verified agents for 5 minutes
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 5 * 60 * 1000;

// Track processed elements to avoid duplicates
const processedElements = new WeakSet<Element>();

async function verifyHash(hash: string): Promise<AgentData | null> {
  // Check cache first
  const cached = cache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const response = await fetch(`${API_BASE}/agents/${hash}`);
    if (!response.ok) {
      cache.set(hash, { data: null, timestamp: Date.now() });
      return null;
    }
    const data = await response.json();
    cache.set(hash, { data, timestamp: Date.now() });
    return data;
  } catch (err) {
    console.error('[AgentID] Error verifying hash:', err);
    return null;
  }
}

function createBadge(agent: AgentData | null, hash: string): HTMLElement {
  const badge = document.createElement('span');
  badge.className = 'agentid-badge';

  if (!agent) {
    badge.classList.add('agentid-unknown');
    badge.innerHTML = `
      <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>
      <span class="agentid-text">Unknown</span>
    `;
    badge.title = `Hash not found in AgentID registry\n${hash}`;
  } else {
    const trustLevel = getTrustLevel(agent.trustScore || 0);
    badge.classList.add(`agentid-${trustLevel}`);

    const icon = getIcon(trustLevel);
    const name = agent.name || 'Agent';
    const score = agent.trustScore ? `${Math.round(agent.trustScore * 100)}%` : '';

    badge.innerHTML = `
      ${icon}
      <span class="agentid-text">${name}</span>
      ${score ? `<span class="agentid-score">${score}</span>` : ''}
    `;

    let tooltip = `${name} v${agent.version || '1.0'}\nTrust: ${score}`;
    if (agent.verified) tooltip += `\nVerified: ${agent.verificationSource}`;
    if (agent.twitter?.verified) tooltip += `\nTwitter: ${agent.twitter.handle}`;
    badge.title = tooltip;

    badge.onclick = () => {
      window.open(`https://id-agent.org/verify/${hash}`, '_blank');
    };
  }

  return badge;
}

function getTrustLevel(score: number): string {
  if (score >= 0.8) return 'verified';
  if (score >= 0.5) return 'trusted';
  if (score > 0) return 'pending';
  return 'unknown';
}

function getIcon(level: string): string {
  switch (level) {
    case 'verified':
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
      </svg>`;
    case 'trusted':
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z"/>
      </svg>`;
    case 'pending':
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/>
      </svg>`;
    default:
      return `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
      </svg>`;
  }
}

async function processTextNode(node: Text): Promise<void> {
  const text = node.textContent || '';
  const matches = text.match(HASH_REGEX);

  if (!matches) return;

  // Skip if parent already processed
  const parent = node.parentElement;
  if (!parent || processedElements.has(parent)) return;

  // Skip certain elements
  const tagName = parent.tagName?.toLowerCase();
  if (['script', 'style', 'textarea', 'input', 'code', 'pre'].includes(tagName)) {
    return;
  }

  processedElements.add(parent);

  for (const hash of matches) {
    const agent = await verifyHash(hash);

    // Find the hash in the DOM and add badge after it
    const walker = document.createTreeWalker(
      parent,
      NodeFilter.SHOW_TEXT,
      null
    );

    let currentNode: Text | null;
    while ((currentNode = walker.nextNode() as Text | null)) {
      if (currentNode.textContent?.includes(hash)) {
        const badge = createBadge(agent, hash);

        // Insert badge after the text containing the hash
        if (currentNode.nextSibling) {
          currentNode.parentNode?.insertBefore(badge, currentNode.nextSibling);
        } else {
          currentNode.parentNode?.appendChild(badge);
        }
        break;
      }
    }
  }
}

function scanPage(): void {
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    {
      acceptNode: (node) => {
        const text = node.textContent || '';
        return HASH_REGEX.test(text)
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_REJECT;
      }
    }
  );

  const textNodes: Text[] = [];
  let node: Text | null;
  while ((node = walker.nextNode() as Text | null)) {
    textNodes.push(node);
  }

  // Process in batches to avoid blocking
  const batchSize = 5;
  let index = 0;

  function processBatch(): void {
    const batch = textNodes.slice(index, index + batchSize);
    batch.forEach(node => processTextNode(node));
    index += batchSize;

    if (index < textNodes.length) {
      requestIdleCallback(processBatch);
    }
  }

  if (textNodes.length > 0) {
    processBatch();
  }
}

// Observe DOM changes for dynamic content
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    const addedNodes = Array.from(mutation.addedNodes);
    for (const node of addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const text = element.textContent || '';
        if (HASH_REGEX.test(text)) {
          scanPage();
          return;
        }
      }
    }
  }
});

// Initialize
function init(): void {
  console.log('[AgentID] Extension loaded');
  scanPage();

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Wait for DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
