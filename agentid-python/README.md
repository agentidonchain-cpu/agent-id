# AgentID Python SDK

Decentralized identity for AI agents on Base blockchain.

## Installation

```bash
# Core SDK
pip install agentid

# With LangChain support
pip install agentid[langchain]

# With CrewAI support
pip install agentid[crewai]

# With AutoGPT support
pip install agentid[autogpt]

# All integrations
pip install agentid[all]
```

## Quick Start

```python
from agentid import AgentIDClient, AgentConfig

# Create client
client = AgentIDClient()

# Define agent config
config = AgentConfig(
    name="my-assistant",
    model="anthropic/claude-opus-4-5",
    capabilities=["chat", "code-review"],
)

# Register agent
result = client.register(config)
print(f"Identity Hash: {result.identity_hash}")
print(f"Verify URL: {result.identity.verify_url}")
print(f"Trust Score: {result.identity.trust_score}")

# Verify any agent
verification = client.verify("0x7a8b9c...")
if verification.valid:
    print(f"Agent: {verification.identity.name}")
    print(f"Model: {verification.identity.model}")
```

## Framework Integrations

### LangChain

```python
from langchain_openai import ChatOpenAI
from langchain_core.output_parsers import StrOutputParser
from agentid.integrations.langchain import AgentIDMiddleware, verified_chain

# Option 1: Middleware
middleware = AgentIDMiddleware(
    name="my-assistant",
    model="openai/gpt-4",
    capabilities=["chat"],
)

llm = ChatOpenAI()
verified_llm = middleware.wrap(llm)

# Use normally - identity is verified
response = verified_llm.invoke("Hello!")
print(f"Identity: {middleware.identity_hash}")

# Option 2: Decorator
@verified_chain(name="my-chain", model="openai/gpt-4")
def create_chain():
    return ChatOpenAI() | StrOutputParser()

chain = create_chain()
response = chain.invoke("Hello!")
```

### CrewAI

```python
from crewai import Crew, Task
from agentid.integrations.crewai import VerifiedAgent, verified_crew

# Option 1: VerifiedAgent
researcher = VerifiedAgent(
    role="Senior Researcher",
    goal="Find and analyze information",
    backstory="Expert in data analysis",
    agentid_model="openai/gpt-4",
    agentid_capabilities=["research", "analysis"],
)

task = Task(
    description="Research the latest AI trends",
    agent=researcher,
)

crew = Crew(agents=[researcher], tasks=[task])
result = crew.kickoff()

print(f"Agent verified: {researcher.identity_hash}")

# Option 2: Decorator
@verified_crew(name="research-crew", model="openai/gpt-4")
def create_crew():
    # ... create crew
    return Crew(agents=[...], tasks=[...])

crew = create_crew()
```

### AutoGPT

```python
from agentid.integrations.autogpt import (
    AgentIDRegisterBlock,
    AgentIDVerifyBlock,
)

# Registration block
register_block = AgentIDRegisterBlock()
result = register_block(
    name="my-autogpt-agent",
    model="openai/gpt-4",
    capabilities=["autonomous", "web-browsing"],
)

if result["success"]:
    print(f"Registered: {result['identity_hash']}")
    print(f"Badge: {result['badge_markdown']}")

# Verification block
verify_block = AgentIDVerifyBlock()
status = verify_block(identity_hash="0x7a8b9c...")

if status["valid"]:
    print(f"Verified: {status['name']}")
    print(f"Trust Score: {status['trust_score']}")
```

## Async Support

```python
from agentid.core.client import AsyncAgentIDClient

async with AsyncAgentIDClient() as client:
    config = AgentConfig(name="async-agent", model="openai/gpt-4")
    result = await client.register(config)
    print(f"Identity: {result.identity_hash}")
```

## Identity Hash Computation

```python
from agentid.core.identity import compute_identity_hash, verify_hash

# Compute hash locally
hash_value = compute_identity_hash(
    name="my-agent",
    model="openai/gpt-4",
    version="1.0.0",
    capabilities=["chat"],
)

# Verify a hash matches config
config = {"name": "my-agent", "model": "openai/gpt-4", "version": "1.0.0"}
is_valid = verify_hash(hash_value, config)
```

## Cryptographic Signatures

```python
from agentid.core.signature import Keypair

# Generate keypair
keypair = Keypair.generate()
print(f"Public Key: {keypair.public_key_base64}")

# Sign a message
message = "Hello, AgentID!"
signature = keypair.sign_base64(message)

# Verify signature
is_valid = keypair.verify(message, keypair.sign(message))
```

## Configuration

```python
import os

# Set custom API URL
os.environ["AGENTID_API_URL"] = "https://your-api.example.com"

# Or pass directly
client = AgentIDClient(api_url="https://your-api.example.com")
```

## Trust Scores

| Method | Score | Description |
|--------|-------|-------------|
| Wallet signing | 0.5 | Human wallet signature (EIP-191) |
| Agent keypair | 0.3 | Self-registered with Ed25519 |
| Config only | 0.1 | Hash-based, no signature |
| + Capabilities | +0.05 | Agent capabilities declared |

## API Reference

### AgentIDClient

- `register(config, force=False)` - Register an agent
- `verify(identity_hash)` - Verify an identity
- `get_proofs(identity_hash)` - Get verification proofs
- `compute_hash(config)` - Compute hash without registering

### AgentConfig

- `name` - Agent name (required)
- `model` - Model identifier (required)
- `version` - Agent version (default: "1.0.0")
- `capabilities` - List of capabilities
- `metadata` - Additional metadata

### AgentIdentity

- `identity_hash` - Unique hash (0x...)
- `identity_type` - Type of identity
- `trust_score` - Trust score (0.0-1.0)
- `verify_url` - Verification URL
- `badge_markdown` - Markdown badge for README

## Links

- [AgentID Website](https://id-agent.org)
- [Documentation](https://id-agent.org/docs)
- [API Reference](https://id-agent.org/api)

## License

MIT
