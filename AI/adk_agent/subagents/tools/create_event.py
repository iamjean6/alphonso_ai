"""
Create event tool for Google Calendar integration.
"""

import datetime

from .calendar_utils import get_calendar_service, parse_datetime, get_calendar_id


# Intensity to Google Calendar Event Color ID mapping
WORKOUT_COLORS = {
    "HIIT": "11",        # Tomato Red (high intensity)
    "STRENGTH": "3",     # Grape Purple (hypertrophy / core lift)
    "SKILL": "9",        # Cobalt Blue (tactical plays / drills)
    "RECOVERY": "10",    # Basil Green (mobility / rest)
    "ASSESSMENT": "8",   # Graphite Gray (audit / fitness tests)
}


def create_event(
    summary: str,
    start_time: str,
    end_time: str,
    description: str,
    workout_type: str,
) -> dict:
    """
    Create a new event in Google Calendar.

    Args:
        summary (str): Event title/summary
        start_time (str): Start time (e.g., "2023-12-31 14:00")
        end_time (str): End time (e.g., "2023-12-31 15:00")
        description (str): Description of the event (supports HTML formatting)
        workout_type (str): Type of workout (HIIT, STRENGTH, SKILL, RECOVERY, ASSESSMENT)

    Returns:
        dict: Information about the created event or error details
    """
    try:
        # Get calendar service
        service = get_calendar_service()
        if not service:
            return {
                "status": "error",
                "message": "Failed to authenticate with Google Calendar. Please check credentials.",
            }

        # Get target calendar ID (defaults to 'primary')
        calendar_id = get_calendar_id()
        print(f"Google Calendar API: Using Calendar ID '{calendar_id}'")

        # Parse times
        start_dt = parse_datetime(start_time)
        end_dt = parse_datetime(end_time)

        if not start_dt or not end_dt:
            return {
                "status": "error",
                "message": "Invalid date/time format. Please use YYYY-MM-DD HH:MM format.",
            }

        # Dynamically determine timezone
        timezone_id = None
        
        # Check if context var overrides timezone
        from .calendar_utils import active_user_context
        ctx = active_user_context.get()
        if ctx:
            timezone_id = ctx.get("user_timezone")
            
        if not timezone_id:
            try:
                # Try to get the timezone from the calendar details
                calendar_details = service.calendars().get(calendarId=calendar_id).execute()
                timezone_id = calendar_details.get("timeZone", "Africa/Nairobi")
            except Exception:
                # If we can't get it, we'll use the default
                timezone_id = "Africa/Nairobi"

        print(f"Google Calendar API: Resolved timezone for calendar is '{timezone_id}'")

        # Create event body without type annotations
        event_body = {}

        # Add basic information
        event_body["summary"] = summary
        
        # Safe default handling inside the body
        safe_desc = description if description else ""
        event_body["description"] = safe_desc
        
        safe_workout = workout_type if workout_type else "STRENGTH"
        # Determine the color ID based on workout type
        color_id = WORKOUT_COLORS.get(safe_workout.upper(), "3")  # Default to Grape Purple (Strength)
        event_body["colorId"] = color_id

        # Add start and end times with the dynamically determined timezone
        event_body["start"] = {
            "dateTime": start_dt.isoformat(),
            "timeZone": timezone_id,
        }
        event_body["end"] = {"dateTime": end_dt.isoformat(), "timeZone": timezone_id}

        # Call the Calendar API to create the event
        event = (
            service.events().insert(calendarId=calendar_id, body=event_body).execute()
        )

        return {
            "status": "success",
            "message": "Event created successfully",
            "event_id": event["id"],
            "event_link": event.get("htmlLink", ""),
        }

    except Exception as e:
        return {"status": "error", "message": f"Error creating event: {str(e)}"}
