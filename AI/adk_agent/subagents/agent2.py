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
import re

# Set global timeout for all network requests to handle flakiness
socket.setdefaulttimeout(15)

logger = logging.getLogger(__name__)

load_dotenv()
youtube = build('youtube', 'v3', developerKey=os.getenv('YOUTUBE_API_KEY'))



def search_youtube(query: str):
    """
    Finds top sports videos with persistent caching and randomized sampling.
    """
    query = query.strip().lower()
    


    logger.info(f"YouTube Tool: Fetching fresh data for '{query}'")
    
    items = []
    # Production Resilience: 3 retries with exponential backoff
    for attempt in range(1, 4):
        try:
            search_request = youtube.search().list(
                part='snippet',
                q=query,
                type='video',
                maxResults=50,  # 🚀 Fetch Deep (Quota Optimization)
                publishedAfter="2011-01-01T00:00:00Z",
                videoDuration="any",
                videoDefinition="any",
                videoType="any",
                order="relevance"
            )
            response = search_request.execute()
            items = response.get('items', [])
            
            if not items:
                logger.warning(f"YouTube Tool: No results for '{query}'")
                return "No videos found"
            
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
        part='snippet,statistics,contentDetails',
        id=','.join(video_ids)
    )
    details_response = details_request.execute()
    
    all_found_videos = []
    for item in details_response.get('items', []):
        duration = item.get('contentDetails', {}).get('duration', '')
        is_short = False
        if 'H' not in duration:
            m = re.search(r'PT(\d+)M', duration)
            minutes = int(m.group(1)) if m else 0
            if minutes < 4:
                is_short = True
        
        if is_short:
            continue

        all_found_videos.append({
            'title': item['snippet']['title'],
            'url': f"https://www.youtube.com/watch?v={item['id']}",
            'thumbnail': item['snippet']['thumbnails']['high']['url'],
            'channel': item['snippet']['channelTitle'],
            'views': int(item['statistics'].get('viewCount', 0)),
            'publishedAt': item['snippet']['publishedAt'][:4],
        })
    
    return all_found_videos
    
def after_tool_callback(tool, args, tool_context, tool_response):
    """
    Refined Tool Callback:
    Sorts the raw YouTube results by view count and provides a deep pool (30) for the architect to filter.
    """
    if tool.name == "search_youtube" and isinstance(tool_response, list):
        sorted_videos = sorted(tool_response, key=lambda x: x.get('views', 0), reverse=True)[:30]
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