"""
AgentID SDK - Decentralized identity for AI agents on Base blockchain.

Quick Start:
    >>> from agentid import AgentIDClient, AgentConfig
    >>>
    >>> client = AgentIDClient()
    >>> config = AgentConfig(name="my-agent", model="anthropic/claude-opus-4-5")
    >>> result = client.register(config)
    >>> print(f"Registered: {result.identity_hash}")
"""

from agentid.core.client import AgentIDClient
from agentid.core.types import (
    AgentConfig,
    AgentIdentity,
    IdentityType,
    ProofData,
    RegisterResult,
    VerifyResult,
)

__version__ = "0.1.0"
__all__ = [
    "AgentIDClient",
    "AgentConfig",
    "AgentIdentity",
    "IdentityType",
    "ProofData",
    "RegisterResult",
    "VerifyResult",
]
