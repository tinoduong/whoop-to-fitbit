import logging
import os
from datetime import datetime, timedelta


def _get_week_log_path() -> str:
    """Returns log file path: logs/YYYY/MM/YYYY-MM-DD_app.log where date is the most recent Sunday."""
    today = datetime.now()
    days_back = (today.weekday() + 1) % 7
    sunday = today - timedelta(days=days_back)

    year = sunday.strftime("%Y")
    month = sunday.strftime("%m")
    date_str = sunday.strftime("%Y-%m-%d")

    log_dir = os.path.join(os.path.dirname(__file__), "logs", year, month)
    os.makedirs(log_dir, exist_ok=True)

    return os.path.join(log_dir, f"{date_str}_app.log")


_formatter = logging.Formatter(
    fmt="%(asctime)s | %(levelname)-8s | %(name)-30s | %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S"
)


class WeeklyRotatingHandler(logging.FileHandler):
    """
    A FileHandler that rotates to a new Sunday-anchored weekly log file
    automatically — no restart required.
    """

    def __init__(self):
        self._current_log_path = _get_week_log_path()
        super().__init__(self._current_log_path, encoding="utf-8")
        self.setFormatter(_formatter)

    def emit(self, record: logging.LogRecord) -> None:
        expected_path = _get_week_log_path()
        if expected_path != self._current_log_path:
            self.close()
            self._current_log_path = expected_path
            self.baseFilename = os.path.abspath(expected_path)
            self.stream = self._open()
        super().emit(record)


_file_handler = WeeklyRotatingHandler()

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