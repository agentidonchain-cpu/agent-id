"""AgentID API client."""

import os
from datetime import datetime, timezone
from typing import Any

import httpx

from agentid.core.identity import compute_identity_hash
from agentid.core.signature import Keypair, create_registration_message
from agentid.core.types import (
    AgentConfig,
    AgentIdentity,
    IdentityType,
    ProofData,
    RegisterResult,
    VerifyResult,
)

DEFAULT_API_URL = "https://agent007-api-production.up.railway.app"


class AgentIDError(Exception):
    """Base exception for AgentID SDK."""

    pass


class RegistrationError(AgentIDError):
    """Error during agent registration."""

    pass


class VerificationError(AgentIDError):
    """Error during identity verification."""

    pass


class AgentIDClient:
    """
    Client for interacting with the AgentID API.

    Example:
        >>> client = AgentIDClient()
        >>> config = AgentConfig(name="my-agent", model="anthropic/claude-opus-4-5")
        >>> result = client.register(config)
        >>> print(f"Identity hash: {result.identity_hash}")
    """

    def __init__(
        self,
        api_url: str | None = None,
        keypair: Keypair | None = None,
        timeout: float = 30.0,
    ):
        """
        Initialize the AgentID client.

        Args:
            api_url: API base URL (default: production)
            keypair: Ed25519 keypair for signing (auto-generated if not provided)
            timeout: Request timeout in seconds
        """
        self.api_url = (
            api_url or os.environ.get("AGENTID_API_URL") or DEFAULT_API_URL
        ).rstrip("/")
        self.keypair = keypair or Keypair.generate()
        self.timeout = timeout
        self._client = httpx.Client(timeout=timeout)

    def __enter__(self) -> "AgentIDClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self.close()

    def close(self) -> None:
        """Close the HTTP client."""
        self._client.close()

    @property
    def public_key(self) -> str:
        """Get the public key as base64."""
        return self.keypair.public_key_base64

    def register(
        self,
        config: AgentConfig,
        *,
        force: bool = False,
    ) -> RegisterResult:
        """
        Register an agent with AgentID.

        Args:
            config: Agent configuration
            force: Force re-registration if already registered

        Returns:
            RegisterResult with identity details

        Raises:
            RegistrationError: If registration fails
        """
        # Compute identity hash
        identity_hash = compute_identity_hash(
            name=config.name,
            model=config.model,
            version=config.version,
            capabilities=config.capabilities,
            metadata=config.metadata,
        )

        # Check if already registered
        if not force:
            existing = self._get_agent(identity_hash)
            if existing:
                return RegisterResult(
                    success=True,
                    identity=existing,
                    already_registered=True,
                )

        # Create and sign registration message
        timestamp = datetime.now(timezone.utc)
        message = create_registration_message(identity_hash, timestamp)
        signature = self.keypair.sign_base64(message)

        # Build registration payload
        payload = {
            "name": config.name,
            "model": config.model,
            "version": config.version,
            "capabilities": config.capabilities,
            "metadata": config.metadata,
            "proof": {
                "type": "ed25519",
                "publicKey": self.keypair.public_key_base64,
                "signature": signature,
                "message": message,
                "timestamp": timestamp.isoformat() + "Z",
            },
        }

        # Send registration request
        try:
            response = self._client.post(
                f"{self.api_url}/api/v2/agents",
                json=payload,
            )

            if response.status_code == 409:
                # Already registered, fetch existing
                existing = self._get_agent(identity_hash)
                if existing:
                    return RegisterResult(
                        success=True,
                        identity=existing,
                        already_registered=True,
                    )

            response.raise_for_status()
            data = response.json()

            identity = self._parse_identity(data)
            return RegisterResult(success=True, identity=identity)

        except httpx.HTTPStatusError as e:
            error_msg = self._extract_error(e.response)
            return RegisterResult(success=False, error=error_msg)
        except Exception as e:
            return RegisterResult(success=False, error=str(e))

    def verify(self, identity_hash: str) -> VerifyResult:
        """
        Verify an agent's identity.

        Args:
            identity_hash: The identity hash to verify

        Returns:
            VerifyResult with verification status
        """
        try:
            response = self._client.get(
                f"{self.api_url}/api/v2/agents/{identity_hash}",
            )

            if response.status_code == 404:
                return VerifyResult(
                    valid=False,
                    error="Identity not found",
                )

            response.raise_for_status()
            data = response.json()

            identity = self._parse_identity(data)
            return VerifyResult(valid=True, identity=identity)

        except Exception as e:
            return VerifyResult(valid=False, error=str(e))

    def get_proofs(self, identity_hash: str) -> list[ProofData]:
        """
        Get verification proofs for an identity.

        Args:
            identity_hash: The identity hash

        Returns:
            List of proof data
        """
        try:
            response = self._client.get(
                f"{self.api_url}/api/v2/agents/{identity_hash}/proofs",
            )
            response.raise_for_status()
            data = response.json()

            proofs = []
            for proof_data in data.get("proofs", []):
                proofs.append(
                    ProofData(
                        type=proof_data.get("type", "unknown"),
                        public_key=proof_data.get("publicKey"),
                        signature=proof_data.get("signature", ""),
                        message=proof_data.get("message", ""),
                        timestamp=datetime.fromisoformat(
                            proof_data.get("timestamp", "").replace("Z", "+00:00")
                        ),
                        wallet_address=proof_data.get("walletAddress"),
                    )
                )
            return proofs

        except Exception:
            return []

    def compute_hash(self, config: AgentConfig) -> str:
        """
        Compute identity hash for a config without registering.

        Args:
            config: Agent configuration

        Returns:
            Identity hash
        """
        return compute_identity_hash(
            name=config.name,
            model=config.model,
            version=config.version,
            capabilities=config.capabilities,
            metadata=config.metadata,
        )

    def _get_agent(self, identity_hash: str) -> AgentIdentity | None:
        """Get agent by identity hash, returns None if not found."""
        try:
            response = self._client.get(
                f"{self.api_url}/api/v2/agents/{identity_hash}",
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return self._parse_identity(response.json())
        except Exception:
            return None

    def _parse_identity(self, data: dict[str, Any]) -> AgentIdentity:
        """Parse API response into AgentIdentity."""
        proofs = []
        for proof_data in data.get("proofs", []):
            timestamp_str = proof_data.get("timestamp", "")
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                except ValueError:
                    timestamp = datetime.now(timezone.utc)
            else:
                timestamp = datetime.now(timezone.utc)

            proofs.append(
                ProofData(
                    type=proof_data.get("type", "unknown"),
                    public_key=proof_data.get("publicKey"),
                    signature=proof_data.get("signature", ""),
                    message=proof_data.get("message", ""),
                    timestamp=timestamp,
                    wallet_address=proof_data.get("walletAddress"),
                )
            )

        created_at_str = data.get("createdAt", data.get("created_at", ""))
        if created_at_str:
            try:
                created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            except ValueError:
                created_at = datetime.now(timezone.utc)
        else:
            created_at = datetime.now(timezone.utc)

        identity_type_str = data.get("identityType", data.get("identity_type", "config"))
        try:
            identity_type = IdentityType(identity_type_str)
        except ValueError:
            identity_type = IdentityType.CONFIG

        return AgentIdentity(
            identity_hash=data.get("identityHash", data.get("identity_hash", "")),
            identity_type=identity_type,
            name=data.get("name", ""),
            model=data.get("model", ""),
            trust_score=data.get("trustScore", data.get("trust_score", 0.1)),
            owner=data.get("owner"),
            created_at=created_at,
            proofs=proofs,
            on_chain=data.get("onChain", data.get("on_chain", False)),
            chain_tx=data.get("chainTx", data.get("chain_tx")),
        )

    def _extract_error(self, response: httpx.Response) -> str:
        """Extract error message from response."""
        try:
            data = response.json()
            return data.get("error", data.get("message", f"HTTP {response.status_code}"))
        except Exception:
            return f"HTTP {response.status_code}: {response.text[:200]}"


class AsyncAgentIDClient:
    """
    Async client for interacting with the AgentID API.

    Example:
        >>> async with AsyncAgentIDClient() as client:
        ...     config = AgentConfig(name="my-agent", model="anthropic/claude-opus-4-5")
        ...     result = await client.register(config)
        ...     print(f"Identity hash: {result.identity_hash}")
    """

    def __init__(
        self,
        api_url: str | None = None,
        keypair: Keypair | None = None,
        timeout: float = 30.0,
    ):
        """Initialize the async AgentID client."""
        self.api_url = (
            api_url or os.environ.get("AGENTID_API_URL") or DEFAULT_API_URL
        ).rstrip("/")
        self.keypair = keypair or Keypair.generate()
        self.timeout = timeout
        self._client = httpx.AsyncClient(timeout=timeout)

    async def __aenter__(self) -> "AsyncAgentIDClient":
        return self

    async def __aexit__(self, *args: Any) -> None:
        await self.close()

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()

    @property
    def public_key(self) -> str:
        """Get the public key as base64."""
        return self.keypair.public_key_base64

    async def register(
        self,
        config: AgentConfig,
        *,
        force: bool = False,
    ) -> RegisterResult:
        """Register an agent with AgentID (async)."""
        identity_hash = compute_identity_hash(
            name=config.name,
            model=config.model,
            version=config.version,
            capabilities=config.capabilities,
            metadata=config.metadata,
        )

        if not force:
            existing = await self._get_agent(identity_hash)
            if existing:
                return RegisterResult(
                    success=True,
                    identity=existing,
                    already_registered=True,
                )

        timestamp = datetime.now(timezone.utc)
        message = create_registration_message(identity_hash, timestamp)
        signature = self.keypair.sign_base64(message)

        payload = {
            "name": config.name,
            "model": config.model,
            "version": config.version,
            "capabilities": config.capabilities,
            "metadata": config.metadata,
            "proof": {
                "type": "ed25519",
                "publicKey": self.keypair.public_key_base64,
                "signature": signature,
                "message": message,
                "timestamp": timestamp.isoformat() + "Z",
            },
        }

        try:
            response = await self._client.post(
                f"{self.api_url}/api/v2/agents",
                json=payload,
            )

            if response.status_code == 409:
                existing = await self._get_agent(identity_hash)
                if existing:
                    return RegisterResult(
                        success=True,
                        identity=existing,
                        already_registered=True,
                    )

            response.raise_for_status()
            data = response.json()

            identity = self._parse_identity(data)
            return RegisterResult(success=True, identity=identity)

        except httpx.HTTPStatusError as e:
            error_msg = self._extract_error(e.response)
            return RegisterResult(success=False, error=error_msg)
        except Exception as e:
            return RegisterResult(success=False, error=str(e))

    async def verify(self, identity_hash: str) -> VerifyResult:
        """Verify an agent's identity (async)."""
        try:
            response = await self._client.get(
                f"{self.api_url}/api/v2/agents/{identity_hash}",
            )

            if response.status_code == 404:
                return VerifyResult(valid=False, error="Identity not found")

            response.raise_for_status()
            data = response.json()

            identity = self._parse_identity(data)
            return VerifyResult(valid=True, identity=identity)

        except Exception as e:
            return VerifyResult(valid=False, error=str(e))

    async def _get_agent(self, identity_hash: str) -> AgentIdentity | None:
        """Get agent by identity hash (async)."""
        try:
            response = await self._client.get(
                f"{self.api_url}/api/v2/agents/{identity_hash}",
            )
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return self._parse_identity(response.json())
        except Exception:
            return None

    def _parse_identity(self, data: dict[str, Any]) -> AgentIdentity:
        """Parse API response into AgentIdentity."""
        # Reuse sync client's parsing logic
        proofs = []
        for proof_data in data.get("proofs", []):
            timestamp_str = proof_data.get("timestamp", "")
            if timestamp_str:
                try:
                    timestamp = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
                except ValueError:
                    timestamp = datetime.now(timezone.utc)
            else:
                timestamp = datetime.now(timezone.utc)

            proofs.append(
                ProofData(
                    type=proof_data.get("type", "unknown"),
                    public_key=proof_data.get("publicKey"),
                    signature=proof_data.get("signature", ""),
                    message=proof_data.get("message", ""),
                    timestamp=timestamp,
                    wallet_address=proof_data.get("walletAddress"),
                )
            )

        created_at_str = data.get("createdAt", data.get("created_at", ""))
        if created_at_str:
            try:
                created_at = datetime.fromisoformat(created_at_str.replace("Z", "+00:00"))
            except ValueError:
                created_at = datetime.now(timezone.utc)
        else:
            created_at = datetime.now(timezone.utc)

        identity_type_str = data.get("identityType", data.get("identity_type", "config"))
        try:
            identity_type = IdentityType(identity_type_str)
        except ValueError:
            identity_type = IdentityType.CONFIG

        return AgentIdentity(
            identity_hash=data.get("identityHash", data.get("identity_hash", "")),
            identity_type=identity_type,
            name=data.get("name", ""),
            model=data.get("model", ""),
            trust_score=data.get("trustScore", data.get("trust_score", 0.1)),
            owner=data.get("owner"),
            created_at=created_at,
            proofs=proofs,
            on_chain=data.get("onChain", data.get("on_chain", False)),
            chain_tx=data.get("chainTx", data.get("chain_tx")),
        )

    def _extract_error(self, response: httpx.Response) -> str:
        """Extract error message from response."""
        try:
            data = response.json()
            return data.get("error", data.get("message", f"HTTP {response.status_code}"))
        except Exception:
            return f"HTTP {response.status_code}: {response.text[:200]}"
