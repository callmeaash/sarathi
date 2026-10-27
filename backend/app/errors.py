class AppError(Exception):
    status_code = 400

    def __init__(self, detail: str, retry_after: int | None = None):
        """Error with a message for the client and, for rate limits, seconds to wait."""
        super().__init__(detail)
        self.detail = detail
        self.retry_after = retry_after


class InvalidInput(AppError):
    status_code = 422


class NotFound(AppError):
    status_code = 404


class Conflict(AppError):
    status_code = 409


class TooManyRequests(AppError):
    status_code = 429
