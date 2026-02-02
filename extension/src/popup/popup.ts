// AgentID Popup Script
export {};

const API_BASE = 'https://api.id-agent.org/api/v1';

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

// DOM Elements
const verifiedCount = document.getElementById('verified-count') as HTMLElement;
const unknownCount = document.getElementById('unknown-count') as HTMLElement;
const hashInput = document.getElementById('hash-input') as HTMLInputElement;
const verifyBtn = document.getElementById('verify-btn') as HTMLButtonElement;
const resultDiv = document.getElementById('result') as HTMLElement;

// Load stats on popup open
async function loadStats(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(['stats']);
    const stats = result.stats || { verified: 0, unknown: 0 };
    verifiedCount.textContent = stats.verified.toString();
    unknownCount.textContent = stats.unknown.toString();
  } catch (err) {
    console.error('Failed to load stats:', err);
  }
}

// Verify a hash
async function verifyHash(hash: string): Promise<void> {
  if (!hash.match(/^0x[a-fA-F0-9]{64}$/)) {
    showResult(null, 'Invalid hash format');
    return;
  }

  verifyBtn.disabled = true;
  verifyBtn.textContent = '...';

  try {
    const response = await fetch(`${API_BASE}/agents/${hash}`);

    if (!response.ok) {
      showResult(null, 'Agent not found in registry');
      await incrementStat('unknown');
    } else {
      const data: AgentData = await response.json();
      showResult(data, null);
      await incrementStat('verified');
    }
  } catch (err) {
    showResult(null, 'Network error');
  } finally {
    verifyBtn.disabled = false;
    verifyBtn.textContent = 'Verify';
    loadStats();
  }
}

function showResult(agent: AgentData | null, error: string | null): void {
  resultDiv.classList.remove('hidden', 'success', 'error');

  if (error) {
    resultDiv.classList.add('error');
    resultDiv.innerHTML = `<span>${error}</span>`;
  } else if (agent) {
    resultDiv.classList.add('success');
    const trustPercent = agent.trustScore ? Math.round(agent.trustScore * 100) : 0;
    const twitterInfo = agent.twitter?.verified ? ` | Twitter: ${agent.twitter.handle}` : '';

    resultDiv.innerHTML = `
      <div class="agent-name">${agent.name || 'Unknown Agent'}</div>
      <div class="agent-details">
        v${agent.version || '1.0'} | Trust: ${trustPercent}%${twitterInfo}
      </div>
    `;
  }
}

async function incrementStat(type: 'verified' | 'unknown'): Promise<void> {
  const result = await chrome.storage.local.get(['stats']);
  const stats = result.stats || { verified: 0, unknown: 0 };
  stats[type]++;
  await chrome.storage.local.set({ stats });
}

// Event listeners
verifyBtn.addEventListener('click', () => {
  const hash = hashInput.value.trim();
  if (hash) {
    verifyHash(hash);
  }
});

hashInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const hash = hashInput.value.trim();
    if (hash) {
      verifyHash(hash);
    }
  }
});

// Initialize
loadStats();
