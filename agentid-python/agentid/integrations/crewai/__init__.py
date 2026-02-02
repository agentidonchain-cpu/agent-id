"""CrewAI integration for AgentID.

Provides verified agents and decorators for CrewAI crews.

Example:
    >>> from crewai import Crew, Task
    >>> from agentid.integrations.crewai import VerifiedAgent
    >>>
    >>> agent = VerifiedAgent(
    ...     role="Researcher",
    ...     goal="Find information",
    ...     backstory="Expert researcher",
    ...     agentid_model="openai/gpt-4",
    ... )
    >>>
    >>> task = Task(description="Research AI", agent=agent)
    >>> crew = Crew(agents=[agent], tasks=[task])
    >>> result = crew.kickoff()
"""

from agentid.integrations.crewai.agent import (
    VerifiedAgent,
    verified_crew,
    get_crew_identities,
)

__all__ = [
    "VerifiedAgent",
    "verified_crew",
    "get_crew_identities",
]
