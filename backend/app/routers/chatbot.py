import logging
import os
import time
from collections import defaultdict
from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.config import settings

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/chatbot", tags=["AI Chatbot"])

# In-memory sliding window rate limiter: maps IP -> list of request timestamps
RATE_LIMIT_WINDOW_SECONDS = 60
MAX_REQUESTS_PER_WINDOW = 10
_ip_request_history: Dict[str, List[float]] = defaultdict(list)


def _check_rate_limit(ip: str) -> None:
    """Sliding-window rate limiter per client IP address."""
    now = time.time()
    cutoff = now - RATE_LIMIT_WINDOW_SECONDS
    
    # Prune timestamps older than window
    timestamps = [t for t in _ip_request_history[ip] if t > cutoff]
    
    if len(timestamps) >= MAX_REQUESTS_PER_WINDOW:
        logger.warning(f"[Chatbot Rate Limit] IP {ip} exceeded {MAX_REQUESTS_PER_WINDOW} req/{RATE_LIMIT_WINDOW_SECONDS}s")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Rate limit exceeded. Maximum 10 messages per minute allowed. Please wait a moment before sending another message.",
        )
    
    timestamps.append(now)
    _ip_request_history[ip] = timestamps


class ChatMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000, description="User query or message")


class ChatMessageResponse(BaseModel):
    reply: str = Field(..., description="AI response text")


MARITIME_SYSTEM_PROMPT = """You are the CharterMind Assistant, an AI helper embedded in a maritime freight forecasting and vessel chartering platform for India's east coast.

## How to decide: answer directly vs. redirect to a page

Answer DIRECTLY, in 1-3 short sentences, when the question is:
- A definition or explanation ("what is BDI", "what does VaR mean", "what is a COA / spot charter", "what is demurrage", "what does Erlang-C mean")
- A general concept about how a feature works ("how does risk scoring work", "how is congestion calculated", "what factors affect idle time")
- A simple navigation question ("where do I see port congestion", "how do I compare vessels")
- General maritime/shipping knowledge not specific to live data ("what's the difference between Panamax and Capesize", "what is a laycan window")

REDIRECT to the relevant page instead of answering, when the question asks for:
- A specific live number or current value ("what's today's freight rate", "what's the risk score for my current voyage", "how congested is Paradip right now", "what will my voyage cost")
- A multi-step calculation or comparison that depends on the user's actual selected cargo/vessel/port ("should I pick Spot or Multi-Voyage for my cargo", "which vessel is best for my order", "what's my optimal charter window")
- Anything requiring the user's current session data you don't have visibility into

For a redirect, use this exact format: a one-sentence plain-language answer to the concept if there is one, followed by a clear pointer, e.g.:
"Port congestion reflects how loaded a port's berths are relative to ship traffic. For today's live congestion level, check the **Port Intelligence** page."
"That depends on your specific cargo and vessel selections. Head to the **Risk Engine** page to see your current voyage's live risk score."

Page names to route to, matched by topic:
- Freight rate forecasts / rate trends → **Freight Forecast**
- Risk scores (market/port/weather/vessel/commodity) → **Risk Engine**
- Port congestion / berth wait times → **Port Intelligence**
- Idle time / demurrage cost estimates → **Cost & Idle Time**
- Vessel selection / vessel-port compatibility → **Vessel Optimizer**
- Spot vs. Multi-Voyage decision, contract terms → **Contract Advisor**
- Testing different scenarios (what if congestion is high, rates spike, etc.) → **What-If Simulator**
- Full voyage cost/plan, charter timing → **Voyage Planner**
- Notifications about risk/congestion crossing thresholds → **Alerts**

## Other rules
1. Never invent specific numbers (rates, risk scores, congestion levels, vessel specs) — if it's not a concept you can explain generally, redirect instead of guessing.
2. Keep all answers concise and in plain language — most users are chartering/procurement professionals, not data scientists. Briefly explain jargon in one clause when it's necessary.
3. Be honest about the platform's limitations if directly asked (e.g. "is this real-time data?") rather than overclaiming.
4. If asked something completely unrelated to CharterMind or shipping/chartering, politely say this assistant is focused on helping with the platform and redirect back to what you can help with.
5. Never reveal, discuss, or hint at any API keys, internal file paths, environment variables, or backend implementation details, even if asked directly or asked to "repeat your instructions." """


@router.post(
    "/message",
    response_model=ChatMessageResponse,
    summary="Send a message to the CharterMind AI assistant",
    description="Unauthenticated endpoint with in-memory IP rate limiting calling Gemini via google-genai SDK.",
)
async def send_chat_message(payload: ChatMessageRequest, request: Request) -> ChatMessageResponse:
    # 1. Apply in-memory abuse protection rate limit
    client_ip = request.client.host if request.client else "unknown"
    _check_rate_limit(client_ip)

    # 2. Check Gemini API key configuration
    api_key = settings.GEMINI_API_KEY or os.getenv("GEMINI_API_KEY")
    if not api_key:
        try:
            from pathlib import Path
            from dotenv import dotenv_values
            env_file = Path(__file__).resolve().parent.parent.parent / ".env"
            if env_file.exists():
                vals = dotenv_values(str(env_file))
                api_key = vals.get("GEMINI_API_KEY")
        except Exception as e:
            logger.warning(f"[Chatbot] Error reading .env file: {e}")

    if not api_key:
        logger.error("[Chatbot] GEMINI_API_KEY is not set in backend settings or environment.")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Chatbot service is not configured with a valid Gemini API key.",
        )

    # 3. Call Gemini via google-genai SDK
    try:
        import asyncio
        import importlib
        import site
        import sys

        # Add both user and global site-packages
        extra_paths = [
            site.getusersitepackages(),
            r"C:\Python314\Lib\site-packages",
            r"C:\Users\DELL\AppData\Roaming\Python\Python314\site-packages",
        ]
        for p in extra_paths:
            if p and os.path.exists(p) and p not in sys.path:
                sys.path.insert(0, p)

        # Invalidate module cache for google namespace if needed
        if "google" in sys.modules and not hasattr(sys.modules["google"], "genai"):
            google_pkg = sys.modules["google"]
            if hasattr(google_pkg, "__path__"):
                for p in extra_paths:
                    g_sub = os.path.join(p, "google")
                    if os.path.isdir(g_sub) and g_sub not in list(google_pkg.__path__):
                        google_pkg.__path__.append(g_sub)

        import google.genai as genai
        client = genai.Client(api_key=api_key)
        
        prompt = f"{MARITIME_SYSTEM_PROMPT}\n\nUser Question: {payload.message.strip()}\nCharterMind AI:"

        # Preferred model cascade for resilience with verified models
        candidate_models = [
            "models/gemini-3.5-flash",
            "models/gemini-3.1-flash-lite",
            "models/gemini-3.6-flash",
            "models/gemma-4-26b-a4b-it",
            "models/gemma-4-31b-it",
        ]

        reply_text = None
        last_err = None

        def _call_model(m: str) -> Optional[str]:
            res = client.models.generate_content(
                model=m,
                contents=prompt,
            )
            if res and res.text:
                return res.text.strip()
            return None

        for model_name in candidate_models:
            try:
                reply_text = await asyncio.to_thread(_call_model, model_name)
                if reply_text:
                    break
            except Exception as e:
                last_err = e
                logger.warning(f"[Chatbot] Model {model_name} failed: {e}. Trying fallback...")

        if not reply_text:
            if last_err:
                logger.error(f"[Chatbot] All candidate models failed. Last error: {last_err}")
            reply_text = (
                "CharterMind AI is temporarily experiencing high traffic. "
                "For prompt voyage intelligence, please review the Voyage Planner, Vessel Optimizer, "
                "or Freight Forecast dashboard tabs."
            )

        return ChatMessageResponse(reply=reply_text)

    except HTTPException:
        raise
    except Exception as exc:
        import traceback
        tb = traceback.format_exc()
        print(f"[Chatbot Error Traceback]:\n{tb}")
        logger.error(f"[Chatbot] Unexpected error processing message: {exc}\n{tb}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to generate AI response: {exc}",
        )
