"""Core AgentID SDK functionality."""

from agentid.core.client import AgentIDClient
from agentid.core.identity import compute_identity_hash
from agentid.core.types import (
    AgentConfig,
    AgentIdentity,
    IdentityType,
    ProofData,
    RegisterResult,
    VerifyResult,
)

__all__ = [
    "AgentIDClient",
    "AgentConfig",
    "AgentIdentity",
    "IdentityType",
    "ProofData",
    "RegisterResult",
    "VerifyResult",
    "compute_identity_hash",
]
