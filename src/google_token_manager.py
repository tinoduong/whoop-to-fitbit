import os
import json
import requests
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request
from google_auth_oauthlib.flow import InstalledAppFlow
from logger import get_logger

log = get_logger("google_token_manager")

CREDENTIALS_FILE = os.path.join("meta-data", "google.json")
TOKEN_FILE = os.path.join("meta-data", "google_token.json")

SCOPES = [
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
    "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.writeonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
    "https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.writeonly",
    "https://www.googleapis.com/auth/googlehealth.nutrition.readonly",
    "https://www.googleapis.com/auth/googlehealth.nutrition.writeonly",
]

BASE_URL = "https://health.googleapis.com/v4"


class AuthRequired(Exception):
    pass


def get_credentials(interactive=True):
    creds = None

    if os.path.exists(TOKEN_FILE):
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)

    if creds and creds.valid:
        return creds

    if creds and creds.expired and creds.refresh_token:
        log.info("Refreshing Google Health token...")
        try:
            creds.refresh(Request())
            _save_token(creds)
            log.info("Token refreshed.")
            return creds
        except Exception as e:
            log.warning(f"Token refresh failed: {e}. Re-authenticating...")

    if not interactive:
        raise AuthRequired(
            "Google Health tokens missing or expired. Run: python google_token_manager.py"
        )

    log.info("Starting Google OAuth flow...")
    flow = InstalledAppFlow.from_client_secrets_file(CREDENTIALS_FILE, SCOPES)
    creds = flow.run_local_server(port=0)
    _save_token(creds)
    log.info("Authorization complete. Token saved.")
    return creds


def get_valid_token(interactive=True):
    return get_credentials(interactive=interactive).token


def get_headers(interactive=True):
    creds = get_credentials(interactive=interactive)
    return {"Authorization": f"Bearer {creds.token}"}


def _save_token(creds):
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())


if __name__ == "__main__":
    creds = get_credentials()
    log.info(f"Token acquired. Valid: {creds.valid}")
