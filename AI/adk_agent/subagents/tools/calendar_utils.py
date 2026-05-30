"""
Utility functions for Google Calendar integration.
"""

import json
import os
from datetime import datetime
from pathlib import Path
import contextvars

from google.auth.transport.requests import Request
from google.oauth2 import service_account
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build

# Thread-safe context variable to store active user's credentials and preferences
active_user_context = contextvars.ContextVar("active_user_context", default=None)

# Define scopes needed for Google Calendar
SCOPES = ["https://www.googleapis.com/auth/calendar"]

# Path for token storage
TOKEN_PATH = Path(os.path.expanduser("~/.credentials/calendar_token.json"))
# Resolve credentials.json relative to the planners directory where it lives
CREDENTIALS_PATH = Path(__file__).parent.parent / "credentials.json"


def get_calendar_id() -> str:
    """
    Get the target Google Calendar ID.
    If GOOGLE_CALENDAR_ID is set in the environment, use it (essential for Service Accounts).
    Otherwise default to 'primary'.
    """
    return os.getenv("GOOGLE_CALENDAR_ID", "primary")


def get_calendar_service():
    """
    Authenticate and create a Google Calendar service object.
    Supports:
    1. Service Account credentials (via GOOGLE_APPLICATION_CREDENTIALS or local service_account.json)
    2. OAuth 2.0 User credentials with thread-safe user isolation and dynamic token bridge
    3. Fallback to interactive OAuth 2.0 authorization code flow for local prototyping

    Returns:
        A Google Calendar service object or None if authentication fails
    """
    creds = None
    
    # Check if a thread-safe active user context is set
    ctx = active_user_context.get()
    
    # Define local token path: dynamically isolated if user_id is provided, else standard fallback
    if ctx and ctx.get("user_id"):
        user_id = ctx["user_id"]
        token_path = Path(os.path.expanduser(f"~/.credentials/calendar_token_{user_id}.json"))
        print(f"Calendar Auth: Isolated token path for User '{user_id}' resolved to: {token_path}")
    else:
        user_id = "default"
        token_path = TOKEN_PATH

    # Option 1: Dynamic Production Credentials (using decrypted OAuth token from gateway)
    if ctx and ctx.get("refresh_token"):
        print(f"Calendar Auth: Creating dynamic production session for Athlete: {ctx.get('user_id')}")
        try:
            creds = Credentials(
                token=None,
                refresh_token=ctx["refresh_token"],
                token_uri="https://oauth2.googleapis.com/token",
                client_id=ctx.get("client_id") or os.getenv("GOOGLE_CLIENT_ID"),
                client_secret=ctx.get("client_secret") or os.getenv("GOOGLE_CLIENT_SECRET"),
                scopes=SCOPES
            )
            # Check validity and refresh if expired/needed
            if not creds.valid:
                print("Calendar Auth: dynamic production token requires refresh...")
                creds.refresh(Request())
            return build("calendar", "v3", credentials=creds)
        except Exception as e:
            print(f"Calendar Auth: Production dynamic token authentication failed: {e}. Falling back...")

    # Option 2: Try Service Account Credentials first if configured (100% Headless)
    sa_env_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
    sa_local_path = Path(__file__).parent.parent / "service_account.json"
    
    sa_path = None
    if sa_env_path:
        test_path = Path(sa_env_path)
        if test_path.is_absolute() and test_path.exists():
            sa_path = test_path
        else:
            # Try resolving relative to the AI directory (parent of planners)
            ai_dir = Path(__file__).parent.parent.parent
            resolved_test_path = ai_dir / sa_env_path
            if resolved_test_path.exists():
                sa_path = resolved_test_path
    
    if not sa_path and sa_local_path.exists():
        sa_path = sa_local_path

    if sa_path:
        try:
            print(f"Calendar Auth: Attempting Service Account authentication using {sa_path}...")
            creds = service_account.Credentials.from_service_account_file(
                str(sa_path), scopes=SCOPES
            )
            return build("calendar", "v3", credentials=creds)
        except Exception as e:
            print(f"Calendar Auth: Service Account authentication failed: {e}. Falling back to OAuth...")

    # Option 3: OAuth 2.0 User Token Refresh (Zero-browser-login if token file exists)
    if token_path.exists():
        try:
            creds = Credentials.from_authorized_user_info(
                json.loads(token_path.read_text()), SCOPES
            )
        except Exception as e:
            print(f"Calendar Auth: Failed to load token file: {e}")

    # If credentials don't exist or are invalid, refresh or get new ones
    if not creds or not creds.valid:
        if creds and creds.expired and creds.refresh_token:
            try:
                print(f"Calendar Auth: Token for '{user_id}' expired. Refreshing programmatically...")
                creds.refresh(Request())
                # Save the refreshed token
                token_path.parent.mkdir(parents=True, exist_ok=True)
                token_path.write_text(creds.to_json())
            except Exception as e:
                print(f"Calendar Auth: Token refresh failed: {e}. Re-authenticating...")
                creds = None
        
        # Option 4: Initial OAuth 2.0 Authorization Flow (Requires browser interaction once per user profile)
        if not creds:
            if not CREDENTIALS_PATH.exists():
                print(
                    f"Error: {CREDENTIALS_PATH} not found. Please follow setup instructions."
                )
                return None

            print(f"Calendar Auth: Initiating browser-based OAuth flow for User '{user_id}'. Please authorize in your browser...")
            flow = InstalledAppFlow.from_client_secrets_file(str(CREDENTIALS_PATH), SCOPES)
            creds = flow.run_local_server(port=0)

            # Save the credentials for the next run so we don't have to do it again
            token_path.parent.mkdir(parents=True, exist_ok=True)
            token_path.write_text(creds.to_json())
            print(f"Calendar Auth: Authentication successful! Token saved to {token_path}")

    # Create and return the Calendar service
    return build("calendar", "v3", credentials=creds)


def format_event_time(event_time):
    """
    Format an event time into a human-readable string.

    Args:
        event_time (dict): The event time dictionary from Google Calendar API

    Returns:
        str: A human-readable time string
    """
    if "dateTime" in event_time:
        # This is a datetime event
        dt = datetime.fromisoformat(event_time["dateTime"].replace("Z", "+00:00"))
        return dt.strftime("%Y-%m-%d %I:%M %p")
    elif "date" in event_time:
        # This is an all-day event
        return f"{event_time['date']} (All day)"
    return "Unknown time format"


def parse_datetime(datetime_str):
    """
    Parse a datetime string into a datetime object.

    Args:
        datetime_str (str): A string representing a date and time

    Returns:
        datetime: A datetime object or None if parsing fails
    """
    formats = [
        "%Y-%m-%d %H:%M",
        "%Y-%m-%d %I:%M %p",
        "%Y-%m-%d",
        "%m/%d/%Y %H:%M",
        "%m/%d/%Y %I:%M %p",
        "%m/%d/%Y",
        "%B %d, %Y %H:%M",
        "%B %d, %Y %I:%M %p",
        "%B %d, %Y",
    ]

    for fmt in formats:
        try:
            return datetime.strptime(datetime_str, fmt)
        except ValueError:
            continue

    return None


def get_current_time() -> dict:
    """
    Get the current time and date localized to the user's calendar timezone.

    Returns:
        dict: A dictionary containing localized time, date, and timezone details.
    """
    from zoneinfo import ZoneInfo
    
    # Check if context var overrides timezone
    ctx = active_user_context.get()
    timezone_id = None
    if ctx:
        timezone_id = ctx.get("user_timezone")

    # If not overridden by context, dynamically resolve via Calendar settings
    if not timezone_id:
        try:
            # Get calendar service to fetch user's configured timezone
            service = get_calendar_service()
            if service:
                calendar_id = get_calendar_id()
                calendar_details = service.calendars().get(calendarId=calendar_id).execute()
                timezone_id = calendar_details.get("timeZone", "Africa/Nairobi")
        except Exception:
            # Fall back if API call fails
            pass

    # Default to Nairobi time / EAT if all else fails
    if not timezone_id:
        timezone_id = "Africa/Nairobi"

    try:
        tz = ZoneInfo(timezone_id)
        now = datetime.now(tz)
    except Exception:
        # Fallback to naive local datetime if timezone name is invalid
        now = datetime.now()
        timezone_id = "local"

    # Format date as MM-DD-YYYY
    formatted_date = now.strftime("%m-%d-%Y")

    return {
        "current_time": now.strftime("%Y-%m-%d %H:%M:%S"),
        "formatted_date": formatted_date,
        "timezone": timezone_id,
    }
