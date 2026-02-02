"""
AgentID Runtime Attestation Protocol (RAP) SDK for Python

Allows AI agents to prove their current configuration matches
their registered identity through challenge-response protocol.

Example:
    >>> from agentid.core.runtime import RuntimeAttestor
    >>>
    >>> attestor = RuntimeAttestor(
    ...     identity_hash="0x...",
    ...     private_key="...",
    ...     public_key="...",
    ...     get_config=lambda: {
    ...         "full_config": my_config,
    ...         "system_prompt": "You are...",
    ...         "tools": ["search", "calculate"],
    ...         "model": {"name": "gpt-4"}
    ...     }
    ... )
    >>>
    >>> # Self-verify
    >>> drift = await attestor.self_verify()
    >>> print(f"Drift score: {drift['drift_score']}")
"""

import json
import hashlib
import time
from typing import Dict, Any, Optional, Callable, Awaitable, List, Union
from dataclasses import dataclass, field
from datetime import datetime
import asyncio
import httpx

try:
    from nacl.signing import SigningKey, VerifyKey
    from nacl.encoding import HexEncoder
    HAS_NACL = True
except ImportError:
    HAS_NACL = False


# =============================================================================
# TYPES
# =============================================================================

@dataclass
class Challenge:
    """Challenge received from the API"""
    challenge_id: str
    nonce: str
    expires_at: str
    target_identity_hash: str


@dataclass
class RuntimeHashes:
    """Hashes of the agent's current runtime configuration"""
    config_hash: str
    system_prompt_hash: str
    tools_hash: str
    model_fingerprint: str


@dataclass
class DriftReport:
    """Drift detection result"""
    config_match: bool
    system_prompt_match: bool
    tools_match: bool
    model_match: bool
    overall_match: bool
    drift_score: float


@dataclass
class AttestationResult:
    """Result of an attestation attempt"""
    success: bool
    verified: Optional[bool] = None
    drift: Optional[DriftReport] = None
    warnings: List[str] = field(default_factory=list)
    error: Optional[str] = None


@dataclass
class AttestationStatus:
    """Attestation status for an agent"""
    identity_hash: str
    has_attested: bool
    last_attested_at: Optional[str] = None
    last_drift_score: Optional[float] = None
    is_live: bool = False
    attestation_count: int = 0
    trust_bonus: float = 0.0


# =============================================================================
# CRYPTO UTILITIES
# =============================================================================

def sha256(data: str) -> str:
    """Compute SHA256 hash of a string"""
    return hashlib.sha256(data.encode()).hexdigest()


def generate_key_pair() -> Dict[str, str]:
    """Generate a new Ed25519 key pair"""
    if not HAS_NACL:
        raise ImportError("PyNaCl is required for key generation. Install with: pip install pynacl")

    signing_key = SigningKey.generate()
    return {
        "private_key": signing_key.encode(encoder=HexEncoder).decode(),
        "public_key": signing_key.verify_key.encode(encoder=HexEncoder).decode()
    }


def sign_message(message: str, private_key: str) -> str:
    """Sign a message with Ed25519"""
    if not HAS_NACL:
        raise ImportError("PyNaCl is required for signing. Install with: pip install pynacl")

    signing_key = SigningKey(bytes.fromhex(private_key)[:32])
    signed = signing_key.sign(message.encode())
    return signed.signature.hex()


def verify_signature(message: str, signature: str, public_key: str) -> bool:
    """Verify an Ed25519 signature"""
    if not HAS_NACL:
        raise ImportError("PyNaCl is required for verification. Install with: pip install pynacl")

    try:
        verify_key = VerifyKey(bytes.fromhex(public_key))
        verify_key.verify(message.encode(), bytes.fromhex(signature))
        return True
    except Exception:
        return False


def generate_runtime_hashes(
    full_config: Union[str, Dict[str, Any]],
    system_prompt: Optional[str] = None,
    tools: Optional[List[str]] = None,
    model: Optional[Dict[str, str]] = None
) -> RuntimeHashes:
    """Generate hashes from agent configuration"""
    config_string = full_config if isinstance(full_config, str) else json.dumps(full_config)

    model_fingerprint = ""
    if model:
        model_fingerprint = sha256(
            f"{model.get('name', '')}:{model.get('version', '')}:{model.get('endpoint', '')}"
        )

    return RuntimeHashes(
        config_hash=sha256(config_string),
        system_prompt_hash=sha256(system_prompt) if system_prompt else "",
        tools_hash=sha256(json.dumps(sorted(tools))) if tools else "",
        model_fingerprint=model_fingerprint
    )


# =============================================================================
# RUNTIME ATTESTOR
# =============================================================================

class RuntimeAttestor:
    """
    RuntimeAttestor handles challenge-response for proving agent identity.

    Args:
        identity_hash: Your registered AgentID hash
        private_key: Ed25519 private key (hex string)
        public_key: Ed25519 public key (hex string)
        get_config: Async or sync function returning current config
        api_url: API base URL (default: https://api.id-agent.org)
        self_verify_interval: Auto self-verify interval in seconds

    Example:
        >>> attestor = RuntimeAttestor(
        ...     identity_hash="0x...",
        ...     private_key="...",
        ...     public_key="...",
        ...     get_config=lambda: {"full_config": my_config}
        ... )
        >>> drift = await attestor.self_verify()
    """

    def __init__(
        self,
        identity_hash: str,
        private_key: str,
        public_key: str,
        get_config: Callable[[], Union[Dict[str, Any], Awaitable[Dict[str, Any]]]],
        api_url: str = "https://api.id-agent.org",
        self_verify_interval: Optional[int] = None
    ):
        self.identity_hash = identity_hash
        self.private_key = private_key
        self.public_key = public_key
        self.get_config = get_config
        self.api_url = api_url
        self.start_time = time.time()
        self._self_verify_task: Optional[asyncio.Task] = None

        if self_verify_interval:
            self.start_self_verify(self_verify_interval)

    async def _get_config_async(self) -> Dict[str, Any]:
        """Get config, handling both sync and async callables"""
        result = self.get_config()
        if asyncio.iscoroutine(result):
            return await result
        return result

    async def handle_challenge(self, challenge: Challenge) -> Dict[str, Any]:
        """
        Handle an incoming challenge and generate attestation.

        Args:
            challenge: Challenge received from API or webhook

        Returns:
            Complete RuntimeAttestation dict
        """
        # Verify challenge is for us
        if challenge.target_identity_hash.lower() != self.identity_hash.lower():
            raise ValueError("Challenge is not for this agent")

        # Check expiration
        expires_at = datetime.fromisoformat(challenge.expires_at.replace("Z", "+00:00"))
        if expires_at < datetime.now(expires_at.tzinfo):
            raise ValueError("Challenge has expired")

        challenged_at = datetime.utcnow().isoformat() + "Z"

        # Get current config and generate hashes
        config = await self._get_config_async()
        hashes = generate_runtime_hashes(
            full_config=config.get("full_config", config),
            system_prompt=config.get("system_prompt"),
            tools=config.get("tools"),
            model=config.get("model")
        )

        # Build runtime snapshot
        runtime = {
            "hashes": {
                "configHash": hashes.config_hash,
                "systemPromptHash": hashes.system_prompt_hash,
                "toolsHash": hashes.tools_hash,
                "modelFingerprint": hashes.model_fingerprint,
            },
            "timestamp": datetime.utcnow().isoformat() + "Z",
            "agentVersion": config.get("version"),
            "platform": config.get("platform", "python"),
            "uptimeSeconds": int(time.time() - self.start_time),
        }

        # Create message to sign
        message = json.dumps({
            "registeredIdentityHash": self.identity_hash,
            "runtime": runtime,
            "challenge": {
                "challengeId": challenge.challenge_id,
                "nonce": challenge.nonce,
            }
        })

        # Sign the message
        signature = sign_message(message, self.private_key)

        responded_at = datetime.utcnow().isoformat() + "Z"

        # Build attestation
        return {
            "registeredIdentityHash": self.identity_hash,
            "runtime": runtime,
            "challenge": {
                "challengeId": challenge.challenge_id,
                "nonce": challenge.nonce,
                "challengedAt": challenged_at,
                "respondedAt": responded_at,
            },
            "proof": {
                "type": "ed25519",
                "signature": signature,
                "publicKey": self.public_key,
            }
        }

    async def handle_challenge_and_submit(
        self,
        challenge: Challenge
    ) -> AttestationResult:
        """
        Handle a challenge and submit to API.

        Args:
            challenge: Challenge to respond to

        Returns:
            AttestationResult with success/failure and drift info
        """
        try:
            attestation = await self.handle_challenge(challenge)

            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.api_url}/api/v1/runtime/attest",
                    json={
                        "challengeId": challenge.challenge_id,
                        "attestation": attestation
                    }
                )

                result = response.json()

                if not response.is_success or not result.get("success"):
                    error = result.get("error", {}).get("message", "Attestation failed")
                    return AttestationResult(success=False, error=error)

                data = result.get("data", {})
                drift_data = data.get("drift", {})

                drift = DriftReport(
                    config_match=drift_data.get("configMatch", False),
                    system_prompt_match=drift_data.get("systemPromptMatch", False),
                    tools_match=drift_data.get("toolsMatch", False),
                    model_match=drift_data.get("modelMatch", False),
                    overall_match=drift_data.get("overallMatch", False),
                    drift_score=drift_data.get("driftScore", 1.0)
                )

                return AttestationResult(
                    success=True,
                    verified=data.get("verified", True),
                    drift=drift,
                    warnings=data.get("warnings", [])
                )

        except Exception as e:
            return AttestationResult(success=False, error=str(e))

    async def self_verify(self) -> DriftReport:
        """
        Request a challenge and self-verify.

        Returns:
            DriftReport with configuration drift analysis

        Raises:
            Exception if verification fails
        """
        async with httpx.AsyncClient() as client:
            # Request a challenge
            response = await client.post(
                f"{self.api_url}/api/v1/runtime/challenge",
                json={"targetIdentityHash": self.identity_hash}
            )

            result = response.json()

            if not response.is_success or not result.get("success"):
                raise Exception(
                    result.get("error", {}).get("message", "Failed to get challenge")
                )

            data = result.get("data", {})
            challenge = Challenge(
                challenge_id=data["challengeId"],
                nonce=data["nonce"],
                expires_at=data["expiresAt"],
                target_identity_hash=data["targetIdentityHash"]
            )

            # Handle and submit
            attest_result = await self.handle_challenge_and_submit(challenge)

            if not attest_result.success or not attest_result.drift:
                raise Exception(attest_result.error or "Self verification failed")

            return attest_result.drift

    async def get_status(self) -> AttestationStatus:
        """
        Get attestation status from API.

        Returns:
            AttestationStatus with history and trust info
        """
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.api_url}/api/v1/runtime/status/{self.identity_hash}"
            )

            result = response.json()

            if not response.is_success or not result.get("success"):
                raise Exception(
                    result.get("error", {}).get("message", "Failed to get status")
                )

            data = result.get("data", {})

            return AttestationStatus(
                identity_hash=data.get("identityHash", self.identity_hash),
                has_attested=data.get("hasAttested", False),
                last_attested_at=data.get("lastAttestedAt"),
                last_drift_score=data.get("lastDriftScore"),
                is_live=data.get("isLive", False),
                attestation_count=data.get("attestationCount", 0),
                trust_bonus=data.get("trustBonus", 0.0)
            )

    def start_self_verify(self, interval_seconds: int) -> None:
        """Start periodic self-verification"""
        async def _run():
            while True:
                try:
                    await self.self_verify()
                except Exception as e:
                    print(f"[RuntimeAttestor] Self-verify failed: {e}")
                await asyncio.sleep(interval_seconds)

        self._self_verify_task = asyncio.create_task(_run())

    def stop_self_verify(self) -> None:
        """Stop periodic self-verification"""
        if self._self_verify_task:
            self._self_verify_task.cancel()
            self._self_verify_task = None

    def get_uptime(self) -> int:
        """Get current uptime in seconds"""
        return int(time.time() - self.start_time)

    def destroy(self) -> None:
        """Clean up resources"""
        self.stop_self_verify()
