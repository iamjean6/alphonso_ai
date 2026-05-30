"""
Edit event tool for Google Calendar integration.
"""

from .calendar_utils import get_calendar_service, parse_datetime, get_calendar_id


# Intensity to Google Calendar Event Color ID mapping
WORKOUT_COLORS = {
    "HIIT": "11",        # Tomato Red (high intensity)
    "STRENGTH": "3",     # Grape Purple (hypertrophy / core lift)
    "SKILL": "9",        # Cobalt Blue (tactical plays / drills)
    "RECOVERY": "10",    # Basil Green (mobility / rest)
    "ASSESSMENT": "8",   # Graphite Gray (audit / fitness tests)
}


def edit_event(
    event_id: str,
    summary: str,
    start_time: str,
    end_time: str,
    description: str,
    workout_type: str,
) -> dict:
    """
    Edit an existing event in Google Calendar - change title, reschedule, update description, or change color.

    Args:
        event_id (str): The ID of the event to edit
        summary (str): New title/summary for the event (pass empty string to keep unchanged)
        start_time (str): New start time (e.g., "2023-12-31 14:00", pass empty string to keep unchanged)
        end_time (str): New end time (e.g., "2023-12-31 15:00", pass empty string to keep unchanged)
        description (str): New description of the event (pass empty string to keep unchanged)
        workout_type (str): New type of workout (pass empty string to keep unchanged)

    Returns:
        dict: Information about the edited event or error details
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
        print(f"Google Calendar API (Edit): Using Calendar ID '{calendar_id}'")

        # First get the existing event
        try:
            event = (
                service.events().get(calendarId=calendar_id, eventId=event_id).execute()
            )
        except Exception:
            return {
                "status": "error",
                "message": f"Event with ID {event_id} not found in primary calendar.",
            }

        # Update the event with new values
        if summary:
            event["summary"] = summary

        if description:
            event["description"] = description

        if workout_type:
            color_id = WORKOUT_COLORS.get(workout_type.upper())
            if color_id:
                event["colorId"] = color_id

        # Get timezone from the original event
        timezone_id = "Africa/Nairobi"  # Default
        if "start" in event and "timeZone" in event["start"]:
            timezone_id = event["start"]["timeZone"]

        print(f"Google Calendar API (Edit): Resolved timezone is '{timezone_id}'")

        # Update start time if provided
        if start_time:
            start_dt = parse_datetime(start_time)
            if not start_dt:
                return {
                    "status": "error",
                    "message": "Invalid start time format. Please use YYYY-MM-DD HH:MM format.",
                }
            event["start"] = {"dateTime": start_dt.isoformat(), "timeZone": timezone_id}

        # Update end time if provided
        if end_time:
            event_dt = parse_datetime(end_time)
            if not event_dt:
                return {
                    "status": "error",
                    "message": "Invalid end time format. Please use YYYY-MM-DD HH:MM format.",
                }
            event["end"] = {"dateTime": event_dt.isoformat(), "timeZone": timezone_id}

        # Update the event
        updated_event = (
            service.events()
            .update(calendarId=calendar_id, eventId=event_id, body=event)
            .execute()
        )

        return {
            "status": "success",
            "message": "Event updated successfully",
            "event_id": updated_event["id"],
            "event_link": updated_event.get("htmlLink", ""),
        }

    except Exception as e:
        return {"status": "error", "message": f"Error updating event: {str(e)}"}
