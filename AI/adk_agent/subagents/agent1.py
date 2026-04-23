from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.google_llm import Gemini
from google.genai import types
from google.adk.tools import google_search
from .prompt import get_agent1_instruction

agent1 = LlmAgent(
    model=Gemini(
        model='gemini-2.5-flash',
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)
    ),
    name='agent1',
    description='Tactical Sports Researcher focused on deconstructing techniques and principles.',
    instruction=get_agent1_instruction(),
    tools=[google_search],
    output_key='google_research'
)