"""
Get location tool for Google Calendar integration.
"""

def get_location() -> dict:
    """
    Get the current location and timezone of the user.

    Returns:
        dict: A dictionary containing the location and timezone information.
    """
    return {
        "status": "success",
        "location": "Nairobi, Kenya",
        "timezone": "Africa/Nairobi",
        "abbreviation": "EAT"
    }
