"""AutoGPT Forge blocks for AgentID.

These blocks integrate with AutoGPT's block-based architecture
to provide identity verification capabilities.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

from agentid.core.client import AgentIDClient
from agentid.core.types import AgentConfig


# Block schemas using Pydantic
class AgentIDRegisterInput(BaseModel):
    """Input schema for AgentID registration block."""

    name: str = Field(..., description="Agent name")
    model: str = Field(..., description="Model identifier (e.g., openai/gpt-4)")
    version: str = Field(default="1.0.0", description="Agent version")
    capabilities: list[str] = Field(
        default_factory=list,
        description="List of agent capabilities",
    )
    force: bool = Field(
        default=False,
        description="Force re-registration if already registered",
    )


class AgentIDRegisterOutput(BaseModel):
    """Output schema for AgentID registration block."""

    success: bool = Field(..., description="Whether registration succeeded")
    identity_hash: str | None = Field(
        default=None,
        description="The agent's identity hash",
    )
    verify_url: str | None = Field(
        default=None,
        description="URL to verify the identity",
    )
    trust_score: float | None = Field(
        default=None,
        description="Trust score (0.0-1.0)",
    )
    badge_markdown: str | None = Field(
        default=None,
        description="Markdown badge for README",
    )
    error: str | None = Field(
        default=None,
        description="Error message if registration failed",
    )


class AgentIDVerifyInput(BaseModel):
    """Input schema for AgentID verification block."""

    identity_hash: str = Field(
        ...,
        description="The identity hash to verify (0x...)",
    )


class AgentIDVerifyOutput(BaseModel):
    """Output schema for AgentID verification block."""

    valid: bool = Field(..., description="Whether the identity is valid")
    name: str | None = Field(default=None, description="Agent name if valid")
    model: str | None = Field(default=None, description="Model identifier if valid")
    trust_score: float | None = Field(
        default=None,
        description="Trust score (0.0-1.0)",
    )
    on_chain: bool = Field(
        default=False,
        description="Whether identity is anchored on-chain",
    )
    error: str | None = Field(
        default=None,
        description="Error message if verification failed",
    )


class AgentIDStatusInput(BaseModel):
    """Input schema for AgentID status block."""

    identity_hash: str = Field(
        ...,
        description="The identity hash to check",
    )


class AgentIDStatusOutput(BaseModel):
    """Output schema for AgentID status block."""

    exists: bool = Field(..., description="Whether the identity exists")
    trust_score: float | None = Field(default=None, description="Current trust score")
    on_chain: bool = Field(default=False, description="Whether on-chain")
    chain_tx: str | None = Field(default=None, description="On-chain transaction")
    created_at: str | None = Field(default=None, description="Creation timestamp")
    proof_count: int = Field(default=0, description="Number of verification proofs")


class AgentIDRegisterBlock:
    """
    AutoGPT block for registering an agent with AgentID.

    This block takes agent configuration and registers it with
    the AgentID network, returning the identity hash and verification URL.

    Usage in AutoGPT:
        Add this block to your agent's graph to enable automatic
        identity registration on startup.
    """

    name = "agentid_register"
    description = "Register this agent with AgentID for decentralized identity"
    categories = ["identity", "security"]

    input_schema = AgentIDRegisterInput
    output_schema = AgentIDRegisterOutput

    def __init__(self, client: AgentIDClient | None = None):
        """Initialize the registration block."""
        self.client = client or AgentIDClient()

    def run(self, input_data: AgentIDRegisterInput) -> AgentIDRegisterOutput:
        """
        Execute the registration block.

        Args:
            input_data: Registration input

        Returns:
            Registration result
        """
        config = AgentConfig(
            name=input_data.name,
            model=input_data.model,
            version=input_data.version,
            capabilities=input_data.capabilities,
            metadata={"framework": "autogpt"},
        )

        result = self.client.register(config, force=input_data.force)

        if result.success and result.identity:
            return AgentIDRegisterOutput(
                success=True,
                identity_hash=result.identity.identity_hash,
                verify_url=result.identity.verify_url,
                trust_score=result.identity.trust_score,
                badge_markdown=result.identity.badge_markdown,
            )
        else:
            return AgentIDRegisterOutput(
                success=False,
                error=result.error,
            )

    def __call__(self, **kwargs: Any) -> dict[str, Any]:
        """Execute block with keyword arguments."""
        input_data = AgentIDRegisterInput(**kwargs)
        output = self.run(input_data)
        return output.model_dump()


class AgentIDVerifyBlock:
    """
    AutoGPT block for verifying an AgentID identity.

    This block verifies that an identity hash is valid and
    returns the associated agent information.

    Usage in AutoGPT:
        Use this block to verify the identity of other agents
        before trusting their outputs or collaborating.
    """

    name = "agentid_verify"
    description = "Verify an AgentID identity hash"
    categories = ["identity", "security"]

    input_schema = AgentIDVerifyInput
    output_schema = AgentIDVerifyOutput

    def __init__(self, client: AgentIDClient | None = None):
        """Initialize the verification block."""
        self.client = client or AgentIDClient()

    def run(self, input_data: AgentIDVerifyInput) -> AgentIDVerifyOutput:
        """
        Execute the verification block.

        Args:
            input_data: Verification input

        Returns:
            Verification result
        """
        result = self.client.verify(input_data.identity_hash)

        if result.valid and result.identity:
            return AgentIDVerifyOutput(
                valid=True,
                name=result.identity.name,
                model=result.identity.model,
                trust_score=result.identity.trust_score,
                on_chain=result.identity.on_chain,
            )
        else:
            return AgentIDVerifyOutput(
                valid=False,
                error=result.error,
            )

    def __call__(self, **kwargs: Any) -> dict[str, Any]:
        """Execute block with keyword arguments."""
        input_data = AgentIDVerifyInput(**kwargs)
        output = self.run(input_data)
        return output.model_dump()


class AgentIDStatusBlock:
    """
    AutoGPT block for checking AgentID status.

    This block provides detailed status information about
    an AgentID identity, including proof counts and on-chain status.

    Usage in AutoGPT:
        Use this block to monitor your agent's identity status
        or check the status of collaborating agents.
    """

    name = "agentid_status"
    description = "Check detailed status of an AgentID identity"
    categories = ["identity", "status"]

    input_schema = AgentIDStatusInput
    output_schema = AgentIDStatusOutput

    def __init__(self, client: AgentIDClient | None = None):
        """Initialize the status block."""
        self.client = client or AgentIDClient()

    def run(self, input_data: AgentIDStatusInput) -> AgentIDStatusOutput:
        """
        Execute the status block.

        Args:
            input_data: Status input

        Returns:
            Status result
        """
        result = self.client.verify(input_data.identity_hash)

        if result.valid and result.identity:
            proofs = self.client.get_proofs(input_data.identity_hash)
            return AgentIDStatusOutput(
                exists=True,
                trust_score=result.identity.trust_score,
                on_chain=result.identity.on_chain,
                chain_tx=result.identity.chain_tx,
                created_at=result.identity.created_at.isoformat(),
                proof_count=len(proofs),
            )
        else:
            return AgentIDStatusOutput(exists=False)

    def __call__(self, **kwargs: Any) -> dict[str, Any]:
        """Execute block with keyword arguments."""
        input_data = AgentIDStatusInput(**kwargs)
        output = self.run(input_data)
        return output.model_dump()
