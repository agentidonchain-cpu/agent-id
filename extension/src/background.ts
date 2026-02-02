// AgentID Background Service Worker
// Handles API calls and caching
export {};

const API_BASE = 'https://api.id-agent.org/api/v1';

interface AgentData {
  identityHash: string;
  name?: string;
  version?: string;
  verified?: boolean;
  verificationSource?: string;
  trustScore?: number;
}

// In-memory cache for the service worker
const agentCache = new Map<string, { data: AgentData | null; expires: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'VERIFY_HASH') {
    verifyHash(message.hash).then(sendResponse);
    return true; // Indicates async response
  }

  if (message.type === 'GET_STATS') {
    getStats().then(sendResponse);
    return true;
  }
});

async function verifyHash(hash: string): Promise<AgentData | null> {
  // Check cache
  const cached = agentCache.get(hash);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }

  try {
    const response = await fetch(`${API_BASE}/agents/${hash}`);
    if (!response.ok) {
      agentCache.set(hash, { data: null, expires: Date.now() + CACHE_TTL });
      return null;
    }

    const data = await response.json();
    agentCache.set(hash, { data, expires: Date.now() + CACHE_TTL });

    // Update stats
    await incrementStat('verified');

    return data;
  } catch (err) {
    console.error('[AgentID] Background error:', err);
    return null;
  }
}

async function getStats(): Promise<{ verified: number; unknown: number }> {
  const result = await chrome.storage.local.get(['stats']);
  return result.stats || { verified: 0, unknown: 0 };
}

async function incrementStat(type: 'verified' | 'unknown'): Promise<void> {
  const stats = await getStats();
  stats[type]++;
  await chrome.storage.local.set({ stats });
}

// Set badge text on install
chrome.runtime.onInstalled.addListener(() => {
  console.log('[AgentID] Extension installed');
  chrome.storage.local.set({ stats: { verified: 0, unknown: 0 } });
});
