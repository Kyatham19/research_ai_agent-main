"""
logger.py — Centralized logging configuration (Python equivalent of log4j).

Usage in any module:
    from logger import get_logger
    log = get_logger(__name__)
    log.info("message")
    log.debug("detail")
    log.error("something failed", exc_info=True)

Outputs to:
  - Console  (INFO and above, coloured by level)
  - File     (DEBUG and above, backend/logs/app.log, rotating 5 MB × 3 backups)
"""

import logging
import logging.handlers
import os

LOG_DIR  = os.path.join(os.path.dirname(__file__), "logs")
LOG_FILE = os.path.join(LOG_DIR, "app.log")

os.makedirs(LOG_DIR, exist_ok=True)

_GREY   = "\033[90m"
_GREEN  = "\033[92m"
_YELLOW = "\033[93m"
_RED    = "\033[91m"
_BOLD   = "\033[1m"
_RESET  = "\033[0m"

LEVEL_COLORS = {
    "DEBUG":    _GREY,
    "INFO":     _GREEN,
    "WARNING":  _YELLOW,
    "ERROR":    _RED,
    "CRITICAL": _BOLD + _RED,
}

FILE_FMT    = "%(asctime)s | %(levelname)-8s | %(name)-22s | %(message)s"
CONSOLE_FMT = "%(asctime)s | {color}%(levelname)-8s{reset} | %(name)-22s | %(message)s"
DATE_FMT    = "%Y-%m-%d %H:%M:%S"


class _ColorFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        color = LEVEL_COLORS.get(record.levelname, "")
        fmt   = CONSOLE_FMT.format(color=color, reset=_RESET)
        return logging.Formatter(fmt, datefmt=DATE_FMT).format(record)


_root_configured = False


def _configure_root() -> None:
    global _root_configured
    if _root_configured:
        return
    _root_configured = True

    root = logging.getLogger("research_ai")
    root.setLevel(logging.DEBUG)
    root.propagate = False

    # Console — INFO+
    ch = logging.StreamHandler()
    ch.setLevel(logging.DEBUG)
    ch.setFormatter(_ColorFormatter())
    root.addHandler(ch)

    # Rotating file — DEBUG+
    fh = logging.handlers.RotatingFileHandler(
        LOG_FILE, maxBytes=5 * 1024 * 1024, backupCount=3, encoding="utf-8"
    )
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(FILE_FMT, datefmt=DATE_FMT))
    root.addHandler(fh)


def get_logger(name: str) -> logging.Logger:
    """Return a child logger under the 'research_ai' hierarchy."""
    _configure_root()
    short = name.replace("__main__", "app")
    return logging.getLogger(f"research_ai.{short}")
