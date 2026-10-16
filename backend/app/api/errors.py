"""Error helpers shared by the paid OpenAI-backed routes (chat and voice)."""

from __future__ import annotations

import logging

from fastapi import HTTPException
from openai import APIError, APITimeoutError, RateLimitError

logger = logging.getLogger("banai.openai")


def api_error(status: int, code: str, message: str) -> HTTPException:
    return HTTPException(status_code=status, detail={"code": code, "message": message})


def map_openai_error(error: APIError, prefix: str = "AGENT") -> HTTPException:
    """Turn an OpenAI failure into a safe, distinct API error (no request bodies, keys or raw messages)."""
    if isinstance(error, RateLimitError):
        logger.warning("OpenAI rate limit: %s", getattr(error, "code", None))
        if getattr(error, "code", None) == "insufficient_quota":
            return api_error(503, f"{prefix}_QUOTA", "The AI service has run out of credits. Please contact the site owner.")
        return api_error(429, f"{prefix}_BUSY", "The AI service is at its usage limit. Please try again in a few minutes.")
    if isinstance(error, APITimeoutError):
        return api_error(504, f"{prefix}_TIMEOUT", "The AI service took too long. Please try again.")
    logger.warning("OpenAI error: %s", type(error).__name__)
    return api_error(502, f"{prefix}_UNAVAILABLE", "The AI service is unavailable. Please try again.")
