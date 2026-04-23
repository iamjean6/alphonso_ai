from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.google_llm import Gemini
from google.genai import types
from .prompt import get_agent0_instruction

agent0 = LlmAgent(
    model=Gemini(
        model='gemini-2.5-flash',
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)
    ),
    name='agent0',
    description='Performance Ingestor that extracts numerical statistics from uploaded artifacts.',
    instruction=get_agent0_instruction(),
    output_key='user_stats'
)