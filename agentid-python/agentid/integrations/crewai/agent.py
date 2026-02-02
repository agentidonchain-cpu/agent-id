"""CrewAI agent integration for AgentID.

Provides VerifiedAgent class that extends CrewAI's Agent with
identity verification capabilities.
"""

from __future__ import annotations

import functools
from typing import TYPE_CHECKING, Any, Callable, TypeVar

from agentid.core.client import AgentIDClient
from agentid.core.types import AgentConfig, AgentIdentity

if TYPE_CHECKING:
    from crewai import Agent, Crew

T = TypeVar("T")


class VerifiedAgent:
    """
    A CrewAI agent with AgentID verification.

    This class wraps CrewAI's Agent class and automatically registers
    the agent with AgentID on initialization.

    Example:
        >>> from crewai import Crew, Task
        >>> from agentid.integrations.crewai import VerifiedAgent
        >>>
        >>> researcher = VerifiedAgent(
        ...     role="Senior Researcher",
        ...     goal="Find and analyze information",
        ...     backstory="Expert in data analysis",
        ...     agentid_model="openai/gpt-4",
        ...     agentid_capabilities=["research", "analysis"],
        ... )
        >>>
        >>> task = Task(
        ...     description="Research the latest AI trends",
        ...     agent=researcher,
        ... )
        >>>
        >>> crew = Crew(agents=[researcher], tasks=[task])
        >>> result = crew.kickoff()
        >>>
        >>> # Access identity
        >>> print(f"Agent verified: {researcher.identity_hash}")
    """

    def __init__(
        self,
        role: str,
        goal: str,
        backstory: str,
        agentid_model: str,
        agentid_capabilities: list[str] | None = None,
        agentid_metadata: dict[str, Any] | None = None,
        agentid_client: AgentIDClient | None = None,
        auto_register: bool = True,
        **crewai_kwargs: Any,
    ):
        """
        Initialize a verified CrewAI agent.

        Args:
            role: The agent's role (used as AgentID name)
            goal: The agent's goal
            backstory: The agent's backstory
            agentid_model: Model identifier for AgentID (e.g., "openai/gpt-4")
            agentid_capabilities: Agent capabilities for AgentID
            agentid_metadata: Additional metadata for AgentID
            agentid_client: AgentID client (created if not provided)
            auto_register: Whether to register immediately
            **crewai_kwargs: Additional arguments passed to CrewAI Agent
        """
        self.role = role
        self.goal = goal
        self.backstory = backstory
        self._crewai_kwargs = crewai_kwargs

        # AgentID configuration
        self.config = AgentConfig(
            name=role,
            model=agentid_model,
            version="1.0.0",
            capabilities=agentid_capabilities or [],
            metadata={
                "framework": "crewai",
                "goal": goal,
                **(agentid_metadata or {}),
            },
        )
        self.client = agentid_client or AgentIDClient()
        self._identity: AgentIdentity | None = None
        self._crewai_agent: "Agent | None" = None

        if auto_register:
            self.register()

    @property
    def identity(self) -> AgentIdentity | None:
        """Get the registered identity."""
        return self._identity

    @property
    def identity_hash(self) -> str | None:
        """Get the identity hash."""
        return self._identity.identity_hash if self._identity else None

    @property
    def is_registered(self) -> bool:
        """Check if agent is registered."""
        return self._identity is not None

    @property
    def crewai_agent(self) -> "Agent":
        """Get the underlying CrewAI agent."""
        if self._crewai_agent is None:
            self._crewai_agent = self._create_crewai_agent()
        return self._crewai_agent

    def register(self, force: bool = False) -> AgentIdentity:
        """
        Register the agent with AgentID.

        Args:
            force: Force re-registration

        Returns:
            The registered identity

        Raises:
            RuntimeError: If registration fails
        """
        result = self.client.register(self.config, force=force)
        if not result.success:
            raise RuntimeError(f"AgentID registration failed: {result.error}")

        self._identity = result.identity
        return self._identity  # type: ignore

    def _create_crewai_agent(self) -> "Agent":
        """Create the underlying CrewAI agent."""
        try:
            from crewai import Agent
        except ImportError:
            raise ImportError(
                "CrewAI is required for this integration. "
                "Install with: pip install agentid[crewai]"
            )

        # Add identity to backstory
        backstory = self.backstory
        if self.identity_hash:
            backstory += f"\n\n[AgentID Verified: {self.identity_hash}]"

        return Agent(
            role=self.role,
            goal=self.goal,
            backstory=backstory,
            **self._crewai_kwargs,
        )

    # Delegate common Agent methods to underlying agent
    def __getattr__(self, name: str) -> Any:
        """Delegate attribute access to underlying CrewAI agent."""
        if name.startswith("_") or name in (
            "role",
            "goal",
            "backstory",
            "config",
            "client",
            "identity",
            "identity_hash",
            "is_registered",
            "crewai_agent",
            "register",
        ):
            raise AttributeError(name)
        return getattr(self.crewai_agent, name)


def verified_crew(
    name: str,
    model: str,
    version: str = "1.0.0",
    capabilities: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Callable[[Callable[..., "Crew"]], Callable[..., "Crew"]]:
    """
    Decorator to create a verified CrewAI crew.

    The decorated function should return a Crew instance.
    The crew's identity will be registered with AgentID.

    Example:
        >>> from crewai import Agent, Crew, Task
        >>> from agentid.integrations.crewai import verified_crew
        >>>
        >>> @verified_crew(name="research-crew", model="openai/gpt-4")
        ... def create_crew():
        ...     researcher = Agent(role="Researcher", ...)
        ...     writer = Agent(role="Writer", ...)
        ...     task = Task(description="Research and write", ...)
        ...     return Crew(agents=[researcher, writer], tasks=[task])
        >>>
        >>> crew = create_crew()
        >>> result = crew.kickoff()

    Args:
        name: Crew name for AgentID
        model: Model identifier
        version: Crew version
        capabilities: Crew capabilities
        metadata: Additional metadata

    Returns:
        Decorator function
    """
    config = AgentConfig(
        name=name,
        model=model,
        version=version,
        capabilities=capabilities or [],
        metadata={"framework": "crewai", **(metadata or {})},
    )
    client = AgentIDClient()

    def decorator(func: Callable[..., "Crew"]) -> Callable[..., "Crew"]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> "Crew":
            # Register crew identity
            result = client.register(config)
            if not result.success:
                raise RuntimeError(f"AgentID registration failed: {result.error}")

            # Create crew
            crew = func(*args, **kwargs)

            # Attach identity to crew
            crew._agentid_identity = result.identity  # type: ignore
            crew._agentid_hash = result.identity_hash  # type: ignore

            return crew

        # Attach for external access
        wrapper.agentid_config = config  # type: ignore
        wrapper.agentid_client = client  # type: ignore

        return wrapper

    return decorator


def get_crew_identities(crew: "Crew") -> dict[str, str | None]:
    """
    Get AgentID identities for all agents in a crew.

    Args:
        crew: The CrewAI crew

    Returns:
        Dict mapping agent roles to identity hashes
    """
    identities: dict[str, str | None] = {}

    # Check crew-level identity
    if hasattr(crew, "_agentid_hash"):
        identities["_crew"] = crew._agentid_hash

    # Check each agent
    for agent in crew.agents:
        if isinstance(agent, VerifiedAgent):
            identities[agent.role] = agent.identity_hash
        elif hasattr(agent, "_agentid_hash"):
            identities[agent.role] = agent._agentid_hash
        else:
            identities[agent.role] = None

    return identities
