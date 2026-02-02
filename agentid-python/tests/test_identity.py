"""Tests for identity hash computation."""

import pytest

from agentid.core.identity import (
    canonicalize,
    compute_config_hash,
    compute_identity_hash,
    verify_hash,
)


class TestCanonicalize:
    """Tests for canonicalize function."""

    def test_simple_object(self) -> None:
        """Test canonicalization of simple object."""
        obj = {"name": "test", "value": 123}
        result = canonicalize(obj)
        assert result == '{"name":"test","value":123}'

    def test_sorted_keys(self) -> None:
        """Test that keys are sorted."""
        obj = {"z": 1, "a": 2, "m": 3}
        result = canonicalize(obj)
        assert result == '{"a":2,"m":3,"z":1}'

    def test_nested_object(self) -> None:
        """Test nested object canonicalization."""
        obj = {"outer": {"z": 1, "a": 2}}
        result = canonicalize(obj)
        assert result == '{"outer":{"a":2,"z":1}}'

    def test_array(self) -> None:
        """Test array in object."""
        obj = {"items": [3, 1, 2]}
        result = canonicalize(obj)
        # Arrays preserve order
        assert result == '{"items":[3,1,2]}'


class TestComputeIdentityHash:
    """Tests for compute_identity_hash function."""

    def test_basic_hash(self) -> None:
        """Test basic hash computation."""
        hash1 = compute_identity_hash("test-agent", "openai/gpt-4")
        assert hash1.startswith("0x")
        assert len(hash1) == 66  # 0x + 64 hex chars

    def test_deterministic(self) -> None:
        """Test that hash is deterministic."""
        hash1 = compute_identity_hash("test-agent", "openai/gpt-4")
        hash2 = compute_identity_hash("test-agent", "openai/gpt-4")
        assert hash1 == hash2

    def test_different_inputs(self) -> None:
        """Test that different inputs produce different hashes."""
        hash1 = compute_identity_hash("agent-a", "openai/gpt-4")
        hash2 = compute_identity_hash("agent-b", "openai/gpt-4")
        assert hash1 != hash2

    def test_with_capabilities(self) -> None:
        """Test hash with capabilities."""
        hash1 = compute_identity_hash(
            "test-agent",
            "openai/gpt-4",
            capabilities=["chat", "code"],
        )
        hash2 = compute_identity_hash(
            "test-agent",
            "openai/gpt-4",
            capabilities=["code", "chat"],  # Different order
        )
        # Order matters for arrays
        assert hash1 != hash2

    def test_with_metadata(self) -> None:
        """Test hash with metadata."""
        hash1 = compute_identity_hash(
            "test-agent",
            "openai/gpt-4",
            metadata={"key": "value"},
        )
        hash2 = compute_identity_hash(
            "test-agent",
            "openai/gpt-4",
            metadata={},
        )
        assert hash1 != hash2


class TestComputeConfigHash:
    """Tests for compute_config_hash function."""

    def test_from_dict(self) -> None:
        """Test hash from config dict."""
        config = {
            "name": "test-agent",
            "model": "openai/gpt-4",
            "version": "1.0.0",
        }
        hash1 = compute_config_hash(config)
        hash2 = compute_identity_hash("test-agent", "openai/gpt-4", "1.0.0")
        assert hash1 == hash2


class TestVerifyHash:
    """Tests for verify_hash function."""

    def test_valid_hash(self) -> None:
        """Test verification of valid hash."""
        config = {
            "name": "test-agent",
            "model": "openai/gpt-4",
            "version": "1.0.0",
        }
        hash_value = compute_config_hash(config)
        assert verify_hash(hash_value, config) is True

    def test_invalid_hash(self) -> None:
        """Test verification of invalid hash."""
        config = {
            "name": "test-agent",
            "model": "openai/gpt-4",
            "version": "1.0.0",
        }
        fake_hash = "0x" + "a" * 64
        assert verify_hash(fake_hash, config) is False

    def test_case_insensitive(self) -> None:
        """Test that hash comparison is case-insensitive."""
        config = {
            "name": "test-agent",
            "model": "openai/gpt-4",
        }
        hash_value = compute_config_hash(config)
        upper_hash = hash_value.upper()
        assert verify_hash(upper_hash, config) is True
