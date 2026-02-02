"""Tests for signature utilities."""

import base64

import pytest

from agentid.core.signature import (
    Keypair,
    create_registration_message,
    create_verification_message,
    verify_ed25519_signature,
)


class TestKeypair:
    """Tests for Keypair class."""

    def test_generate(self) -> None:
        """Test keypair generation."""
        kp = Keypair.generate()
        assert len(kp.private_key) == 32
        assert len(kp.public_key) == 32

    def test_from_private_key(self) -> None:
        """Test reconstruction from private key."""
        kp1 = Keypair.generate()
        kp2 = Keypair.from_private_key(kp1.private_key)
        assert kp1.public_key == kp2.public_key

    def test_from_base64(self) -> None:
        """Test reconstruction from base64."""
        kp1 = Keypair.generate()
        kp2 = Keypair.from_base64(kp1.private_key_base64)
        assert kp1.public_key == kp2.public_key

    def test_sign_and_verify(self) -> None:
        """Test signing and verification."""
        kp = Keypair.generate()
        message = "Hello, AgentID!"
        signature = kp.sign(message)
        assert kp.verify(message, signature) is True

    def test_verify_wrong_message(self) -> None:
        """Test verification fails with wrong message."""
        kp = Keypair.generate()
        signature = kp.sign("Original message")
        assert kp.verify("Different message", signature) is False

    def test_sign_base64(self) -> None:
        """Test base64 signature."""
        kp = Keypair.generate()
        message = "Test message"
        sig_b64 = kp.sign_base64(message)
        sig_bytes = base64.b64decode(sig_b64)
        assert kp.verify(message, sig_bytes) is True

    def test_sign_bytes(self) -> None:
        """Test signing bytes directly."""
        kp = Keypair.generate()
        message = b"Binary data"
        signature = kp.sign(message)
        assert kp.verify(message, signature) is True


class TestCreateRegistrationMessage:
    """Tests for create_registration_message function."""

    def test_format(self) -> None:
        """Test message format."""
        from datetime import datetime

        ts = datetime(2024, 1, 15, 12, 0, 0)
        message = create_registration_message("0xabc123", ts)
        assert "Register AgentID: 0xabc123" in message
        assert "Timestamp: 2024-01-15T12:00:00.000Z" in message

    def test_default_timestamp(self) -> None:
        """Test with default timestamp."""
        message = create_registration_message("0xdef456")
        assert "Register AgentID: 0xdef456" in message
        assert "Timestamp:" in message


class TestCreateVerificationMessage:
    """Tests for create_verification_message function."""

    def test_format(self) -> None:
        """Test verification message format."""
        message = create_verification_message("0xabc123", "nonce123")
        assert message == "Verify AgentID: 0xabc123\nNonce: nonce123"


class TestVerifyEd25519Signature:
    """Tests for verify_ed25519_signature function."""

    def test_valid_signature(self) -> None:
        """Test verification of valid signature."""
        kp = Keypair.generate()
        message = "Test message"
        signature = kp.sign(message)
        assert verify_ed25519_signature(message, signature, kp.public_key) is True

    def test_base64_inputs(self) -> None:
        """Test with base64 encoded inputs."""
        kp = Keypair.generate()
        message = "Test message"
        sig_b64 = kp.sign_base64(message)
        assert verify_ed25519_signature(
            message,
            sig_b64,
            kp.public_key_base64,
        ) is True

    def test_invalid_signature(self) -> None:
        """Test verification fails with invalid signature."""
        kp = Keypair.generate()
        message = "Test message"
        fake_sig = b"x" * 64
        assert verify_ed25519_signature(message, fake_sig, kp.public_key) is False
