"""LangChain integration for AgentID.

Provides middleware and decorators for verified LangChain agents.

Example:
    >>> from langchain_openai import ChatOpenAI
    >>> from agentid.integrations.langchain import AgentIDMiddleware, verified_chain
    >>>
    >>> llm = ChatOpenAI()
    >>> middleware = AgentIDMiddleware(name="my-agent", model="openai/gpt-4")
    >>> verified_llm = middleware.wrap(llm)
    >>>
    >>> # Or use the decorator
    >>> @verified_chain(name="my-agent", model="openai/gpt-4")
    >>> def my_chain():
    ...     return ChatOpenAI() | output_parser
"""

from agentid.integrations.langchain.middleware import (
    AgentIDMiddleware,
    AgentIDCallback,
    verified_chain,
)

__all__ = [
    "AgentIDMiddleware",
    "AgentIDCallback",
    "verified_chain",
]
