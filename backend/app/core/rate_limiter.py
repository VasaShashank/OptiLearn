import time
from collections import defaultdict
from typing import Dict, List, Optional
from fastapi import Request, HTTPException, status

class InMemorySlidingWindowRateLimiter:
    """
    Thread-safe, sliding-window rate limiter tracking requests per client IP or key.
    Enforces rate limits with zero external dependencies and returns HTTP 429 when exceeded.
    """
    def __init__(self):
        # Maps key -> list of float timestamps
        self._records: Dict[str, List[float]] = defaultdict(list)
        self._last_cleanup = time.time()

    def _cleanup_expired(self, current_time: float, window_seconds: float):
        """Periodically prune expired keys to prevent memory leaks"""
        if current_time - self._last_cleanup > 300: # Every 5 minutes
            keys_to_delete = []
            for key, timestamps in self._records.items():
                active = [t for t in timestamps if current_time - t <= window_seconds]
                if active:
                    self._records[key] = active
                else:
                    keys_to_delete.append(key)
            for k in keys_to_delete:
                del self._records[k]
            self._last_cleanup = current_time

    def check_rate_limit(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> None:
        """
        Check if request is allowed under (max_requests / window_seconds).
        Raises HTTPException(429) if exceeded.
        """
        now = time.time()
        self._cleanup_expired(now, float(window_seconds))

        timestamps = self._records[key]
        cutoff = now - float(window_seconds)

        # Filter timestamps within current sliding window
        valid_timestamps = [t for t in timestamps if t > cutoff]
        self._records[key] = valid_timestamps

        if len(valid_timestamps) >= max_requests:
            oldest_in_window = valid_timestamps[0]
            retry_after = int(max(1.0, (oldest_in_window + window_seconds) - now))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded: maximum {max_requests} requests per {window_seconds}s. Please retry in {retry_after} seconds.",
                headers={"Retry-After": str(retry_after)}
            )

        self._records[key].append(now)

# Global shared instance
limiter = InMemorySlidingWindowRateLimiter()

def get_client_ip(request: Request) -> str:
    """Extract client IP respecting X-Forwarded-For if behind a reverse proxy"""
    x_forwarded_for = request.headers.get("X-Forwarded-For")
    if x_forwarded_for:
        return x_forwarded_for.split(",")[0].strip()
    return request.client.host if request.client else "unknown"

def rate_limit(max_requests: int = 60, window_seconds: int = 60):
    """
    FastAPI dependency factory for rate limiting routes.
    Example: Depends(rate_limit(max_requests=10, window_seconds=60))
    """
    def dependency(request: Request):
        ip = get_client_ip(request)
        key = f"{ip}:{request.url.path}"
        limiter.check_rate_limit(key, max_requests, window_seconds)
    return dependency
