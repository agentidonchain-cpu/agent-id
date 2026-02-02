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
from agentid.core.runtime import (
    RuntimeAttestor,
    Challenge,
    RuntimeHashes,
    DriftReport,
    AttestationResult,
    AttestationStatus,
    generate_key_pair,
    generate_runtime_hashes,
    sha256,
)

__all__ = [
    # Client
    "AgentIDClient",
    "AgentConfig",
    "AgentIdentity",
    "IdentityType",
    "ProofData",
    "RegisterResult",
    "VerifyResult",
    "compute_identity_hash",
    # Runtime Attestation
    "RuntimeAttestor",
    "Challenge",
    "RuntimeHashes",
    "DriftReport",
    "AttestationResult",
    "AttestationStatus",
    "generate_key_pair",
    "generate_runtime_hashes",
    "sha256",
]
