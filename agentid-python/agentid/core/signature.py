"""Cryptographic signature utilities for AgentID."""

import base64
import os
from dataclasses import dataclass
from datetime import datetime, timezone

from nacl.signing import SigningKey, VerifyKey


@dataclass
class Keypair:
    """Ed25519 keypair for agent signing."""

    private_key: bytes
    public_key: bytes

    @classmethod
    def generate(cls) -> "Keypair":
        """Generate a new Ed25519 keypair."""
        signing_key = SigningKey.generate()
        return cls(
            private_key=bytes(signing_key),
            public_key=bytes(signing_key.verify_key),
        )

    @classmethod
    def from_private_key(cls, private_key: bytes) -> "Keypair":
        """Reconstruct keypair from private key."""
        signing_key = SigningKey(private_key)
        return cls(
            private_key=bytes(signing_key),
            public_key=bytes(signing_key.verify_key),
        )

    @classmethod
    def from_base64(cls, private_key_b64: str) -> "Keypair":
        """Reconstruct keypair from base64-encoded private key."""
        private_key = base64.b64decode(private_key_b64)
        return cls.from_private_key(private_key)

    @property
    def public_key_base64(self) -> str:
        """Get public key as base64 string."""
        return base64.b64encode(self.public_key).decode("ascii")

    @property
    def private_key_base64(self) -> str:
        """Get private key as base64 string."""
        return base64.b64encode(self.private_key).decode("ascii")

    def sign(self, message: str | bytes) -> bytes:
        """Sign a message and return the signature."""
        if isinstance(message, str):
            message = message.encode("utf-8")
        signing_key = SigningKey(self.private_key)
        signed = signing_key.sign(message)
        return signed.signature

    def sign_base64(self, message: str | bytes) -> str:
        """Sign a message and return base64-encoded signature."""
        signature = self.sign(message)
        return base64.b64encode(signature).decode("ascii")

    def verify(self, message: str | bytes, signature: bytes) -> bool:
        """Verify a signature."""
        if isinstance(message, str):
            message = message.encode("utf-8")
        try:
            verify_key = VerifyKey(self.public_key)
            verify_key.verify(message, signature)
            return True
        except Exception:
            return False


def create_registration_message(identity_hash: str, timestamp: datetime | None = None) -> str:
    """
    Create the message to sign for registration.

    This matches the format expected by the AgentID API.

    Args:
        identity_hash: The agent's identity hash
        timestamp: Signature timestamp (default: now)

    Returns:
        Message string to sign
    """
    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    iso_timestamp = timestamp.strftime("%Y-%m-%dT%H:%M:%S.000Z")
    return f"Register AgentID: {identity_hash}\nTimestamp: {iso_timestamp}"


def create_verification_message(identity_hash: str, nonce: str) -> str:
    """
    Create the message to sign for verification.

    Args:
        identity_hash: The agent's identity hash
        nonce: Random nonce from API

    Returns:
        Message string to sign
    """
    return f"Verify AgentID: {identity_hash}\nNonce: {nonce}"


def verify_ed25519_signature(
    message: str | bytes,
    signature: bytes | str,
    public_key: bytes | str,
) -> bool:
    """
    Verify an Ed25519 signature.

    Args:
        message: The signed message
        signature: The signature (bytes or base64)
        public_key: The public key (bytes or base64)

    Returns:
        True if signature is valid
    """
    if isinstance(message, str):
        message = message.encode("utf-8")
    if isinstance(signature, str):
        signature = base64.b64decode(signature)
    if isinstance(public_key, str):
        public_key = base64.b64decode(public_key)

    try:
        verify_key = VerifyKey(public_key)
        verify_key.verify(message, signature)
        return True
    except Exception:
        return False
