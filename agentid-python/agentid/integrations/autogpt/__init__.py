"""AutoGPT integration for AgentID.

Provides blocks for AutoGPT Forge that enable identity verification.

Example:
    >>> from agentid.integrations.autogpt import AgentIDVerifyBlock, AgentIDRegisterBlock
    >>>
    >>> # In your AutoGPT agent configuration
    >>> verify_block = AgentIDVerifyBlock()
    >>> register_block = AgentIDRegisterBlock()
"""

from agentid.integrations.autogpt.blocks import (
    AgentIDVerifyBlock,
    AgentIDRegisterBlock,
    AgentIDStatusBlock,
)

__all__ = [
    "AgentIDVerifyBlock",
    "AgentIDRegisterBlock",
    "AgentIDStatusBlock",
]
