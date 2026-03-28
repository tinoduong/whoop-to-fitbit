import logging
import os
from datetime import datetime, timedelta


def _get_week_log_path() -> str:
    """Returns log file path: logs/YYYY/MM/YYYY-MM-DD_app.log where date is the most recent Sunday."""
    today = datetime.now()
    days_since_sunday = today.weekday() + 1  # Mon=0..Sun=6, so Sun=6 → +1=7, but we want 0 for Sunday
    # weekday(): Mon=0, Tue=1, ..., Sun=6
    # Days back to Sunday: (weekday + 1) % 7
    days_back = (today.weekday() + 1) % 7
    sunday = today - timedelta(days=days_back)

    year = sunday.strftime("%Y")
    month = sunday.strftime("%m")
    date_str = sunday.strftime("%Y-%m-%d")

    log_dir = os.path.join(os.path.dirname(__file__), "logs", year, month)
    os.makedirs(log_dir, exist_ok=True)

    return os.path.join(log_dir, f"{date_str}_app.log")


LOG_FILE = _get_week_log_path()

# Single shared formatter
_formatter = logging.Formatter(
    fmt="%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)

# File handler — all scripts write to the same weekly file
_file_handler = logging.FileHandler(LOG_FILE, encoding="utf-8")
_file_handler.setFormatter(_formatter)

# Console handler — mirrors logs to stdout
_console_handler = logging.StreamHandler()
_console_handler.setFormatter(_formatter)


def get_logger(name: str) -> logging.Logger:
    """
    Returns a named logger that writes to both the console and the weekly log file.
    Log path: logs/YYYY/MM/YYYY-MM-DD_app.log (Sunday-anchored week)

    Usage:
        from logger import get_logger
        log = get_logger("whoop_fetch_activity")
        log.info("Starting sync...")
        log.error("Something went wrong")
    """
    logger = logging.getLogger(name)
    if not logger.handlers:
        logger.setLevel(logging.DEBUG)
        logger.addHandler(_file_handler)
        logger.addHandler(_console_handler)
        logger.propagate = False
    return logger