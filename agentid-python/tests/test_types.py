"""Tests for Pydantic types."""

from datetime import datetime, timezone

import pytest

from agentid.core.types import (
    AgentConfig,
    AgentIdentity,
    IdentityType,
    ProofData,
    RegisterResult,
    VerifyResult,
)


class TestAgentConfig:
    """Tests for AgentConfig model."""

    def test_minimal(self) -> None:
        """Test minimal config."""
        config = AgentConfig(name="test", model="openai/gpt-4")
        assert config.name == "test"
        assert config.model == "openai/gpt-4"
        assert config.version == "1.0.0"
        assert config.capabilities == []

    def test_full(self) -> None:
        """Test full config."""
        config = AgentConfig(
            name="test-agent",
            model="anthropic/claude-3",
            version="2.0.0",
            description="A test agent",
            capabilities=["chat", "code"],
            metadata={"env": "test"},
        )
        assert config.description == "A test agent"
        assert "chat" in config.capabilities
        assert config.metadata["env"] == "test"

    def test_to_registration_format(self) -> None:
        """Test conversion to API format."""
        config = AgentConfig(
            name="test",
            model="openai/gpt-4",
            capabilities=["chat"],
        )
        data = config.to_registration_format()
        assert data["name"] == "test"
        assert data["model"] == "openai/gpt-4"
        assert data["capabilities"] == ["chat"]


class TestAgentIdentity:
    """Tests for AgentIdentity model."""

    def test_properties(self) -> None:
        """Test identity properties."""
        identity = AgentIdentity(
            identity_hash="0xabc123",
            identity_type=IdentityType.CONFIG,
            name="test-agent",
            model="openai/gpt-4",
            trust_score=0.5,
            created_at=datetime.now(timezone.utc),
        )
        assert "https://id-agent.org/verify/0xabc123" == identity.verify_url
        assert "AgentID Verified" in identity.badge_markdown
        assert "0xabc123" in identity.badge_markdown

    def test_identity_types(self) -> None:
        """Test all identity types."""
        for itype in IdentityType:
            identity = AgentIdentity(
                identity_hash="0x123",
                identity_type=itype,
                name="test",
                model="test",
                trust_score=0.1,
                created_at=datetime.now(timezone.utc),
            )
            assert identity.identity_type == itype


class TestRegisterResult:
    """Tests for RegisterResult model."""

    def test_success(self) -> None:
        """Test successful result."""
        identity = AgentIdentity(
            identity_hash="0xabc",
            identity_type=IdentityType.CONFIG,
            name="test",
            model="test",
            trust_score=0.3,
            created_at=datetime.now(timezone.utc),
        )
        result = RegisterResult(success=True, identity=identity)
        assert result.success is True
        assert result.identity_hash == "0xabc"

    def test_failure(self) -> None:
        """Test failed result."""
        result = RegisterResult(success=False, error="Registration failed")
        assert result.success is False
        assert result.identity_hash is None
        assert result.error == "Registration failed"

    def test_already_registered(self) -> None:
        """Test already registered result."""
        identity = AgentIdentity(
            identity_hash="0xabc",
            identity_type=IdentityType.CONFIG,
            name="test",
            model="test",
            trust_score=0.3,
            created_at=datetime.now(timezone.utc),
        )
        result = RegisterResult(
            success=True,
            identity=identity,
            already_registered=True,
        )
        assert result.already_registered is True


class TestVerifyResult:
    """Tests for VerifyResult model."""

    def test_valid(self) -> None:
        """Test valid verification."""
        identity = AgentIdentity(
            identity_hash="0xabc",
            identity_type=IdentityType.CONFIG,
            name="test",
            model="test",
            trust_score=0.3,
            created_at=datetime.now(timezone.utc),
        )
        result = VerifyResult(valid=True, identity=identity)
        assert result.valid is True
        assert result.identity is not None

    def test_invalid(self) -> None:
        """Test invalid verification."""
        result = VerifyResult(valid=False, error="Not found")
        assert result.valid is False
        assert result.error == "Not found"
