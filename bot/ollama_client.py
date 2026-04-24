"""
ollama_client.py — Async wrapper for the local Ollama API.

Ollama runs models locally — completely free, no API keys.
Install: https://ollama.com
Then pull a model:  ollama pull llama3.2
Default URL: http://localhost:11434

Falls back gracefully if Ollama is not running.
"""

import logging
import os
from typing import Optional

import aiohttp

logger = logging.getLogger(__name__)

OLLAMA_URL: str = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "llama3.2")


async def is_running() -> bool:
    """Check if Ollama is reachable."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{OLLAMA_URL}/api/tags",
                timeout=aiohttp.ClientTimeout(total=3),
            ) as resp:
                return resp.status == 200
    except Exception:
        return False


async def chat(
    system: str,
    user: str,
    model: Optional[str] = None,
    max_tokens: int = 500,
    temperature: float = 0.7,
) -> Optional[str]:
    """
    Send a chat request to Ollama. Returns the response text, or None on failure.

    Args:
        system:     System prompt (sets tone/rules)
        user:       User message (the actual request)
        model:      Override model name (defaults to OLLAMA_MODEL env var)
        max_tokens: Approximate output length limit
        temperature: 0.0 = deterministic, 1.0 = creative
    """
    model = model or OLLAMA_MODEL

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "stream": False,
        "options": {
            "temperature": temperature,
            "num_predict": max_tokens,
        },
    }

    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{OLLAMA_URL}/api/chat",
                json=payload,
                timeout=aiohttp.ClientTimeout(total=120),  # Local inference can be slow
            ) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error("Ollama error %d: %s", resp.status, body[:200])
                    return None

                data = await resp.json()
                text = data.get("message", {}).get("content", "").strip()

                if not text:
                    logger.warning("Ollama returned empty response")
                    return None

                logger.info(
                    "Ollama response: %d chars (model: %s)",
                    len(text), model,
                )
                return text

    except aiohttp.ClientConnectorError:
        logger.warning(
            "Ollama not reachable at %s — is it running? "
            "Install: https://ollama.com | Pull model: ollama pull %s",
            OLLAMA_URL, model,
        )
    except Exception as e:
        logger.error("Ollama request failed: %s", e)

    return None
