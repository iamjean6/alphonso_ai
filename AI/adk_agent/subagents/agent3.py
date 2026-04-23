from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.google_llm import Gemini
from google.genai import types
from .prompt import get_agent3_instruction

agent3 = LlmAgent(
    model=Gemini(
        model='gemini-2.5-pro',
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)
    ),
    name='alphonso',
    description='Alphonso: The compassionate mentor who delivers tough love and precise athletic guidance.',
    instruction=get_agent3_instruction(),
    output_key='final_response'
)
