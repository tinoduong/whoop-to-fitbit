import json
import os
import requests
import base64
from logger import get_logger

log = get_logger("fitbit_token_manager")


class AuthRequired(Exception):
    """Raised when interactive re-authentication is needed but not possible."""
    pass

class TransientError(Exception):
    """Raised when a token refresh fails due to a temporary server/network issue."""
    pass

CONFIG_PATH = os.path.join("./meta-data", "config.json")

def load_config():
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def save_tokens(config, access_token, refresh_token):
    config['access_token'] = access_token
    config['refresh_token'] = refresh_token
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)
    log.info("Tokens saved to config.json")
    return access_token

def clear_tokens(config):
    """Clear stored tokens from config and save — triggers re-auth on next run."""
    config['access_token'] = ''
    config['refresh_token'] = ''
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)
    log.warning("Tokens cleared from config.json")

def get_valid_token(interactive=True):
    config = load_config()

    # If we have a refresh token, try to use it
    if config.get('refresh_token'):
        try:
            token = refresh_token(config)
        except TransientError as e:
            log.warning(f"Transient error refreshing Fitbit token: {e}. Keeping existing tokens.")
            return None
        if token:
            return token
        # Refresh failed with an auth error — clear tokens and fall through to manual auth
        log.warning("Refresh failed. Clearing tokens and starting fresh login...")
        clear_tokens(config)
        config = load_config()  # reload after clearing

    # No valid tokens — need manual auth
    if not interactive:
        raise AuthRequired(
            "Fitbit tokens are missing or expired and require manual re-authentication. "
            "Run: python fitbit_token_manager.py"
        )
    return manual_auth(config)

def manual_auth(config):
    import webbrowser
    auth_url = (
        f"{config['uriAuth']}?response_type=code"
        f"&client_id={config['client_id']}"
        f"&scope=activity%20heartrate%20location%20profile%20weight%20nutrition"
        f"&redirect_uri={config['redirect_uri']}"
    )
    log.info("No valid tokens. Starting manual Fitbit authorization...")
    print(f"\nGo to this URL to authorize Fitbit:\n{auth_url}")
    webbrowser.open(auth_url)

    while True:
        full_url = input("\nPaste the redirected URL here: ").strip()
        if "code=" not in full_url:
            print("That URL doesn't contain a code. Try again, or press Ctrl+C to cancel.")
            continue
        code = full_url.split("code=")[1].split("&")[0].split("#")[0]
        token = exchange(config, {"grant_type": "authorization_code", "code": code, "redirect_uri": config['redirect_uri']})
        if token:
            return token
        print("Code was rejected (may have expired). Please restart and try again.")
        return None

def refresh_token(config):
    log.info("Refreshing Fitbit access token...")
    return exchange(config, {"grant_type": "refresh_token", "refresh_token": config['refresh_token']})

def exchange(config, payload):
    auth_header = base64.b64encode(f"{config['client_id']}:{config['client_secret']}".encode()).decode()
    headers = {"Authorization": f"Basic {auth_header}", "Content-Type": "application/x-www-form-urlencoded"}
    res = requests.post(config['uriRefresh'], headers=headers, data=payload)
    if res.status_code == 200:
        data = res.json()
        return save_tokens(config, data['access_token'], data['refresh_token'])
    log.error(f"Token exchange failed ({res.status_code}): {res.text[:200]}")
    if res.status_code >= 500:
        raise TransientError(f"Fitbit API temporarily unavailable ({res.status_code})")
    return None

if __name__ == "__main__":
    token = get_valid_token()
    if token:
        log.info("Token acquired and saved to config.json")
