class ConflictError(Exception):
    """A write lost a concurrency race (stale version, already-completed record). HTTP 409."""

    def __init__(self, message: str, **details):
        super().__init__(message)
        self.details = details
