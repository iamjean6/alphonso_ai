from google.adk.agents.llm_agent import Agent
from .prompt import get_workout_planner_instruction
from .tools import (
    create_event,
    delete_event,
    edit_event,
    get_current_time,
    list_events,
    get_location,
    generate_workout_pdf
)

root_agent = Agent(
    model='gemini-2.5-flash',
    name='workout_planner_agent',
    description='Workout Planner: Tailors training routines, drafts PDFs, and synchronizes workouts to the athlete\'s calendar.',
    instruction=get_workout_planner_instruction(),
    tools=[
        create_event,
        delete_event,
        edit_event,
        get_current_time,
        list_events,
        get_location,
        generate_workout_pdf
    ]
)
