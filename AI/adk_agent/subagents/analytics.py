# Copyright 2025 Google LLC
#
# Licensed under the Apache License, Version 2.0 (the "License");
# you may not use this file except in compliance with the License.
# You may obtain a copy of the License at
#
#     http://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing, software
# distributed under the License is distributed on an "AS IS" BASIS,
# WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
# See the License for the specific language governing permissions and
# limitations under the License.

"""Analytics Agent: generate nl2py and use code interpreter to run the code."""
import logging
import os

from google.adk.agents import LlmAgent
from google.adk.code_executors import VertexAiCodeExecutor
from google.adk.models.google_llm import Gemini
from google.genai import types

from .prompt import return_instructions_analytics

logger = logging.getLogger(__name__)

# Lazily initialize VertexAiCodeExecutor so that missing Google Cloud
# credentials or project configuration at import time does not crash the
# service.  The executor is only required when the analytics agent is actually
# invoked; if it cannot be created the agent is still registered but will
# surface an error at call time rather than at startup.
_code_executor = None
try:
    _code_executor = VertexAiCodeExecutor(
        optimize_data_file=True,
        stateful=True,
    )
except Exception as e:
    logger.warning(
        "VertexAiCodeExecutor could not be initialized at import time "
        "(Vertex AI may not be configured). The analytics_agent will be "
        "unavailable until Vertex AI credentials are present. Error: %s", e
    )

root_agent = LlmAgent(
    model=Gemini(
        model='gemini-2.5-flash',
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)
    ),
    name="analytics_agent",
    instruction=return_instructions_analytics(),
    code_executor=_code_executor,
    output_key='analytics_results'
)

analytics_agent = root_agent
