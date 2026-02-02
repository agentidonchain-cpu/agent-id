"""LangChain middleware for AgentID verification.

This module provides integration with LangChain's callback system
to add identity verification to LangChain agents and chains.
"""

from __future__ import annotations

import functools
from datetime import datetime
from typing import TYPE_CHECKING, Any, Callable, TypeVar

from agentid.core.client import AgentIDClient
from agentid.core.types import AgentConfig, AgentIdentity

if TYPE_CHECKING:
    from langchain_core.callbacks import BaseCallbackHandler
    from langchain_core.language_models import BaseLanguageModel
    from langchain_core.runnables import Runnable

T = TypeVar("T")


class AgentIDMiddleware:
    """
    Middleware for adding AgentID verification to LangChain components.

    This middleware:
    1. Registers the agent on first use (lazy registration)
    2. Adds identity metadata to all LLM calls
    3. Provides callback handlers for tracing

    Example:
        >>> from langchain_openai import ChatOpenAI
        >>> from agentid.integrations.langchain import AgentIDMiddleware
        >>>
        >>> middleware = AgentIDMiddleware(
        ...     name="my-assistant",
        ...     model="openai/gpt-4",
        ...     capabilities=["chat", "code-review"],
        ... )
        >>>
        >>> llm = ChatOpenAI()
        >>> verified_llm = middleware.wrap(llm)
        >>>
        >>> # Use normally - identity is verified
        >>> response = verified_llm.invoke("Hello!")
        >>> print(f"Identity: {middleware.identity_hash}")
    """

    def __init__(
        self,
        name: str,
        model: str,
        version: str = "1.0.0",
        capabilities: list[str] | None = None,
        metadata: dict[str, Any] | None = None,
        client: AgentIDClient | None = None,
        auto_register: bool = True,
    ):
        """
        Initialize AgentID middleware.

        Args:
            name: Agent name
            model: Model identifier (e.g., "openai/gpt-4")
            version: Agent version
            capabilities: List of agent capabilities
            metadata: Additional metadata
            client: AgentID client (created if not provided)
            auto_register: Whether to register on first use
        """
        self.config = AgentConfig(
            name=name,
            model=model,
            version=version,
            capabilities=capabilities or [],
            metadata=metadata or {},
        )
        self.client = client or AgentIDClient()
        self.auto_register = auto_register
        self._identity: AgentIdentity | None = None
        self._registered = False

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
        return self._registered and self._identity is not None

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
        self._registered = True
        return self._identity  # type: ignore

    def ensure_registered(self) -> None:
        """Ensure the agent is registered."""
        if not self._registered and self.auto_register:
            self.register()

    def wrap(self, runnable: "Runnable[Any, Any]") -> "Runnable[Any, Any]":
        """
        Wrap a LangChain runnable with identity verification.

        This adds a callback handler that includes identity metadata
        in all LLM calls and traces.

        Args:
            runnable: The LangChain runnable to wrap

        Returns:
            Wrapped runnable with identity verification
        """
        self.ensure_registered()

        # Import here to avoid requiring langchain at module level
        try:
            from langchain_core.runnables import RunnableConfig
        except ImportError:
            raise ImportError(
                "LangChain is required for this integration. "
                "Install with: pip install agentid[langchain]"
            )

        # Create wrapped runnable that adds identity to config
        original_invoke = runnable.invoke

        def verified_invoke(input: Any, config: RunnableConfig | None = None, **kwargs: Any) -> Any:
            config = config or {}
            config = dict(config)

            # Add identity metadata
            metadata = config.get("metadata", {})
            metadata["agentid"] = {
                "identity_hash": self.identity_hash,
                "name": self.config.name,
                "model": self.config.model,
                "verified_at": datetime.utcnow().isoformat(),
            }
            config["metadata"] = metadata

            # Add callback handler
            callbacks = list(config.get("callbacks", []) or [])
            callbacks.append(self.get_callback_handler())
            config["callbacks"] = callbacks

            return original_invoke(input, config=config, **kwargs)

        runnable.invoke = verified_invoke  # type: ignore
        return runnable

    def get_callback_handler(self) -> "BaseCallbackHandler":
        """
        Get a LangChain callback handler for identity tracking.

        Returns:
            Callback handler that logs identity information
        """
        return AgentIDCallback(self)


class AgentIDCallback:
    """
    LangChain callback handler for AgentID.

    Tracks LLM calls and adds identity information to traces.
    Compatible with LangChain's BaseCallbackHandler interface.
    """

    def __init__(self, middleware: AgentIDMiddleware):
        """Initialize callback handler."""
        self.middleware = middleware
        self.raise_error = False

    @property
    def identity_hash(self) -> str | None:
        """Get identity hash from middleware."""
        return self.middleware.identity_hash

    def on_llm_start(
        self,
        serialized: dict[str, Any],
        prompts: list[str],
        **kwargs: Any,
    ) -> None:
        """Called when LLM starts processing."""
        # Ensure registered
        self.middleware.ensure_registered()

        # Add identity to run metadata
        run_id = kwargs.get("run_id")
        if run_id and self.identity_hash:
            # LangChain will include this in traces
            kwargs.setdefault("metadata", {})["agentid_hash"] = self.identity_hash

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        """Called when LLM finishes processing."""
        pass

    def on_llm_error(self, error: Exception, **kwargs: Any) -> None:
        """Called when LLM errors."""
        pass

    def on_chain_start(
        self,
        serialized: dict[str, Any],
        inputs: dict[str, Any],
        **kwargs: Any,
    ) -> None:
        """Called when chain starts."""
        self.middleware.ensure_registered()

    def on_chain_end(self, outputs: dict[str, Any], **kwargs: Any) -> None:
        """Called when chain ends."""
        pass

    def on_chain_error(self, error: Exception, **kwargs: Any) -> None:
        """Called when chain errors."""
        pass

    def on_agent_action(self, action: Any, **kwargs: Any) -> None:
        """Called when agent takes action."""
        pass

    def on_agent_finish(self, finish: Any, **kwargs: Any) -> None:
        """Called when agent finishes."""
        pass

    def on_tool_start(
        self,
        serialized: dict[str, Any],
        input_str: str,
        **kwargs: Any,
    ) -> None:
        """Called when tool starts."""
        pass

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        """Called when tool ends."""
        pass

    def on_tool_error(self, error: Exception, **kwargs: Any) -> None:
        """Called when tool errors."""
        pass


def verified_chain(
    name: str,
    model: str,
    version: str = "1.0.0",
    capabilities: list[str] | None = None,
    metadata: dict[str, Any] | None = None,
) -> Callable[[Callable[..., T]], Callable[..., T]]:
    """
    Decorator to create a verified LangChain chain.

    The decorated function should return a LangChain runnable.
    The runnable will be automatically wrapped with identity verification.

    Example:
        >>> from langchain_openai import ChatOpenAI
        >>> from langchain_core.output_parsers import StrOutputParser
        >>> from agentid.integrations.langchain import verified_chain
        >>>
        >>> @verified_chain(name="my-assistant", model="openai/gpt-4")
        ... def create_chain():
        ...     return ChatOpenAI() | StrOutputParser()
        >>>
        >>> chain = create_chain()
        >>> response = chain.invoke("Hello!")

    Args:
        name: Agent name
        model: Model identifier
        version: Agent version
        capabilities: Agent capabilities
        metadata: Additional metadata

    Returns:
        Decorator function
    """
    middleware = AgentIDMiddleware(
        name=name,
        model=model,
        version=version,
        capabilities=capabilities,
        metadata=metadata,
    )

    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @functools.wraps(func)
        def wrapper(*args: Any, **kwargs: Any) -> T:
            result = func(*args, **kwargs)

            # If result is a runnable, wrap it
            try:
                from langchain_core.runnables import Runnable

                if isinstance(result, Runnable):
                    return middleware.wrap(result)  # type: ignore
            except ImportError:
                pass

            return result

        # Attach middleware for access
        wrapper.agentid_middleware = middleware  # type: ignore
        wrapper.identity_hash = lambda: middleware.identity_hash  # type: ignore

        return wrapper

    return decorator
