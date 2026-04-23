from google.adk.agents.llm_agent import LlmAgent
from google.adk.models.google_llm import Gemini
from google.genai import types
from googleapiclient.discovery import build
from dotenv import load_dotenv
from google.adk.agents.callback_context import CallbackContext
from google.adk.models import LlmResponse
from google.genai import types
from typing import Optional
from .prompt import get_agent2_instruction
import os
import logging
import time
import socket

# Set global timeout for all network requests to handle flakiness
socket.setdefaulttimeout(15)

logger = logging.getLogger(__name__)

load_dotenv()
youtube = build('youtube', 'v3', developerKey=os.getenv('YOUTUBE_API_KEY'))

def search_youtube(query: str):
    """
    Finds and sorts the top 10 most-viewed authoritative sports videos.
    """
    logger.info(f"YouTube Tool: Searching for '{query}'")
    
    items = []
    # Production Resilience: 3 retries with exponential backoff
    for attempt in range(1, 4):
        try:
            search_request = youtube.search().list(
                part='snippet',
                q=query,
                type='video',
                maxResults=30
            )
            response = search_request.execute()
            items = response.get('items', [])
            
            if not items:
                logger.warning(f"YouTube Tool: No results for '{query}'")
                return "No videos found"
            
            # If we reach here, we succeeded
            break
            
        except Exception as e:
            if attempt < 3:
                wait_time = attempt * 2
                logger.warning(f"YouTube Tool: Network error on attempt {attempt}: {e}. Retrying in {wait_time}s...")
                time.sleep(wait_time)
            else:
                logger.error(f"YouTube Tool: Failed all 3 attempts. Network issue persistent: {e}")
                return "ERROR: VISUAL_MEDIA_UNAVAILABLE"

    video_ids = [item['id']['videoId'] for item in items]
    details_request = youtube.videos().list(
        part='snippet,statistics',
        id=','.join(video_ids)
    )
    details_response = details_request.execute()
    videos = []
    for item in details_response.get('items', []):
        videos.append({
            'title': item['snippet']['title'],
            'url': f"https://www.youtube.com/watch?v={item['id']}",
            'thumbnail': item['snippet']['thumbnails']['high']['url'],
            'channel': item['snippet']['channelTitle'],
            'views': int(item['statistics'].get('viewCount', 0)),
            'publishedAt': item['snippet']['publishedAt'][:4],
        })
    return videos

def after_tool_callback(tool, args, tool_context, tool_response):
    """
    Refined Tool Callback:
    Sorts the raw YouTube results by view count and enforces the strict 10-video limit.
    """
    # Only apply to our specific search tool
    if tool.name == "search_youtube" and isinstance(tool_response, list):
        # Sort by views descending and take the top 10
        sorted_videos = sorted(tool_response, key=lambda x: x.get('views', 0), reverse=True)[:10]
        return sorted_videos
    
    return tool_response

agent2 = LlmAgent(
    model=Gemini(
        model='gemini-2.5-flash',
        retry_options=types.HttpRetryOptions(initial_delay=2, attempts=5)
    ),
    name='agent2',
    description='Visual Media Analyst focused on high-authority sports demonstrations.',
    instruction=get_agent2_instruction(),
    tools=[search_youtube],
    output_key='youtube_research',
    after_tool_callback=after_tool_callback
)