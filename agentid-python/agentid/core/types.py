"""Pydantic models for AgentID SDK."""

from datetime import datetime, timezone
from enum import Enum


def _utcnow() -> datetime:
    """Get current UTC time."""
    return datetime.now(timezone.utc)
from typing import Any

from pydantic import BaseModel, Field


class IdentityType(str, Enum):
    """Type of identity verification."""

    CONFIG = "config"
    CONFIG_SIGNED = "config_signed"
    WALLET = "wallet"
    WALLET_SIGNED = "wallet_signed"


class AgentConfig(BaseModel):
    """Configuration for an AI agent."""

    name: str = Field(..., description="Agent name")
    model: str = Field(..., description="Model identifier (e.g., anthropic/claude-opus-4-5)")
    version: str = Field(default="1.0.0", description="Agent version")
    description: str | None = Field(default=None, description="Agent description")
    capabilities: list[str] = Field(default_factory=list, description="Agent capabilities")
    metadata: dict[str, Any] = Field(default_factory=dict, description="Additional metadata")

    def to_registration_format(self) -> dict[str, Any]:
        """Convert to API registration format."""
        return {
            "name": self.name,
            "model": self.model,
            "version": self.version,
            "description": self.description,
            "capabilities": self.capabilities,
            "metadata": self.metadata,
        }


class ProofData(BaseModel):
    """Cryptographic proof for identity verification."""

    type: str = Field(..., description="Proof type (ed25519, eip191, etc.)")
    public_key: str | None = Field(default=None, description="Public key for ed25519")
    signature: str = Field(..., description="Signature bytes (base64)")
    message: str = Field(..., description="Signed message")
    timestamp: datetime = Field(default_factory=_utcnow, description="Signature timestamp")
    wallet_address: str | None = Field(default=None, description="Wallet address for EIP-191")


class AgentIdentity(BaseModel):
    """Registered agent identity."""

    identity_hash: str = Field(..., description="Unique identity hash (0x...)")
    identity_type: IdentityType = Field(..., description="Type of identity")
    name: str = Field(..., description="Agent name")
    model: str = Field(..., description="Model identifier")
    trust_score: float = Field(..., ge=0.0, le=1.0, description="Trust score (0.0-1.0)")
    owner: str | None = Field(default=None, description="Owner wallet address")
    created_at: datetime = Field(..., description="Registration timestamp")
    proofs: list[ProofData] = Field(default_factory=list, description="Verification proofs")
    on_chain: bool = Field(default=False, description="Whether anchored on-chain")
    chain_tx: str | None = Field(default=None, description="On-chain transaction hash")

    @property
    def verify_url(self) -> str:
        """Get verification URL."""
        return f"https://id-agent.org/verify/{self.identity_hash}"

    @property
    def badge_markdown(self) -> str:
        """Get badge markdown for README."""
        short_hash = self.identity_hash[:10] + "..."
        return (
            f"[![AgentID Verified](https://id-agent.org/badge/{self.identity_hash})]"
            f"(https://id-agent.org/verify/{self.identity_hash})"
        )


class RegisterResult(BaseModel):
    """Result of agent registration."""

    success: bool = Field(..., description="Whether registration succeeded")
    identity: AgentIdentity | None = Field(default=None, description="Registered identity")
    error: str | None = Field(default=None, description="Error message if failed")
    already_registered: bool = Field(default=False, description="Whether agent was already registered")

    @property
    def identity_hash(self) -> str | None:
        """Get identity hash if successful."""
        return self.identity.identity_hash if self.identity else None


class VerifyResult(BaseModel):
    """Result of identity verification."""

    valid: bool = Field(..., description="Whether identity is valid")
    identity: AgentIdentity | None = Field(default=None, description="Identity details if valid")
    error: str | None = Field(default=None, description="Error message if invalid")
    checked_at: datetime = Field(default_factory=_utcnow, description="Verification timestamp")


class TwitterVerification(BaseModel):
    """Twitter verification details."""

    handle: str = Field(..., description="Twitter handle (@username)")
    user_id: str = Field(..., description="Twitter user ID (immutable)")
    tweet_id: str = Field(..., description="Verification tweet ID")
    verified_at: datetime = Field(..., description="Verification timestamp")
    proof_url: str = Field(..., description="Link to verification tweet")


class VerificationStatus(BaseModel):
    """Status of all verifications for an agent."""

    wallet: bool = Field(default=False, description="Wallet verification status")
    wallet_address: str | None = Field(default=None, description="Verified wallet address")
    twitter: TwitterVerification | None = Field(default=None, description="Twitter verification")
    on_chain: bool = Field(default=False, description="On-chain anchoring status")
