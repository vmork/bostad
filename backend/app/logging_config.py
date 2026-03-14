import logging
import os


def _resolve_log_level() -> int:
    """Map LOG_LEVEL env var to a logging level with sane fallback."""

    level_name = os.getenv("LOG_LEVEL", "INFO").upper()
    return getattr(logging, level_name, logging.INFO)


def configure_logging() -> None:
    """Configure process-wide logging for the backend.

    Keeps logs concise in normal runs while exposing detailed scraper activity at
    DEBUG level when the root logger is configured accordingly.
    """

    logging.basicConfig(
        level=_resolve_log_level(),
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )

    # Suppress per-request transport noise from third-party HTTP clients.
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
