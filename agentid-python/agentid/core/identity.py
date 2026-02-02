"""Identity hash computation for AgentID."""

import hashlib
import json
from typing import Any


def canonicalize(obj: Any) -> str:
    """
    Canonicalize an object for deterministic hashing.

    Produces a deterministic JSON string with sorted keys and no extra whitespace.
    This matches the JavaScript implementation's behavior.
    """
    return json.dumps(obj, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def compute_identity_hash(
    name: str,
    model: str,
    version: str = "1.0.0",
    capabilities: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> str:
    """
    Compute the identity hash for an agent configuration.

    The hash is computed as:
    1. Canonicalize the config object (sorted keys, no whitespace)
    2. SHA-256 hash of the canonical JSON
    3. Prepend "0x" prefix

    Args:
        name: Agent name
        model: Model identifier (e.g., "anthropic/claude-opus-4-5")
        version: Agent version (default: "1.0.0")
        capabilities: List of agent capabilities
        metadata: Additional metadata

    Returns:
        Identity hash as "0x..." string

    Example:
        >>> compute_identity_hash("my-agent", "anthropic/claude-opus-4-5")
        '0x7a8b9c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890'
    """
    config = {
        "name": name,
        "model": model,
        "version": version,
        "capabilities": capabilities or [],
        "metadata": metadata or {},
    }

    canonical = canonicalize(config)
    hash_bytes = hashlib.sha256(canonical.encode("utf-8")).digest()
    return "0x" + hash_bytes.hex()


def compute_config_hash(config: dict[str, Any]) -> str:
    """
    Compute identity hash from a config dictionary.

    Args:
        config: Agent configuration dictionary

    Returns:
        Identity hash as "0x..." string
    """
    return compute_identity_hash(
        name=config.get("name", ""),
        model=config.get("model", ""),
        version=config.get("version", "1.0.0"),
        capabilities=config.get("capabilities", []),
        metadata=config.get("metadata", {}),
    )


def verify_hash(identity_hash: str, config: dict[str, Any]) -> bool:
    """
    Verify that an identity hash matches a configuration.

    Args:
        identity_hash: The claimed identity hash
        config: The agent configuration

    Returns:
        True if the hash matches, False otherwise
    """
    computed = compute_config_hash(config)
    return computed.lower() == identity_hash.lower()
