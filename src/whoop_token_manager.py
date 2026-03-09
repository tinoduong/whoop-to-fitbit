import json
import time
import requests
import os
import webbrowser
import secrets
import string
from urllib.parse import urlparse, parse_qs
from logger import get_logger

log = get_logger("whoop_token_manager")


class AuthRequired(Exception):
    """Raised when interactive re-authentication is needed but not possible."""
    pass


class WhoopTokenManager:
    def __init__(self, config_path='meta-data/whconfig.json'):
        self.config_path = config_path
        self.auth_url = "https://api.prod.whoop.com/oauth/oauth2/auth"
        self.token_url = "https://api.prod.whoop.com/oauth/oauth2/token"
        self.config = self._load_config()

    def _load_config(self):
        if not os.path.exists(self.config_path):
            raise FileNotFoundError(f"Missing {self.config_path}")
        with open(self.config_path, 'r') as f:
            return json.load(f)

    def _save_config(self):
        with open(self.config_path, 'w') as f:
            json.dump(self.config, f, indent=4)

    def _clear_tokens(self):
        """Clear stored tokens from config and save — triggers re-auth on next run."""
        self.config['access_token'] = ''
        self.config['refresh_token'] = ''
        self.config['expires_at'] = 0
        self._save_config()
        log.warning("Tokens cleared from whconfig.json")

    def bootstrap(self):
        """Standard OAuth2 flow using mandatory state parameter."""
        state = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
        scopes = "offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement"

        auth_link = (
            f"{self.auth_url}?client_id={self.config['client_id']}"
            f"&redirect_uri={self.config['redirect_uri']}"
            f"&response_type=code&scope={scopes}&state={state}"
        )

        log.info("No valid tokens. Starting WHOOP authorization flow...")
        print(f"\n1. Authorize here:\n{auth_link}")
        webbrowser.open(auth_link)

        full_url = input("\n2. Paste the FULL redirect URL here: ").strip()
        parsed_url = urlparse(full_url)
        code = parse_qs(parsed_url.query).get('code', [None])[0]

        if code:
            self._exchange_code(code)
        else:
            log.error("Authorization code not found in redirect URL.")

    def _exchange_code(self, code):
        data = {
            'grant_type': 'authorization_code',
            'code': code,
            'client_id': self.config['client_id'],
            'client_secret': self.config['client_secret'],
            'redirect_uri': self.config['redirect_uri']
        }
        self._send_token_request(data)

    def refresh_access_token(self):
        """Attempt to refresh the access token. Returns True on success, False on failure."""
        log.info("Refreshing WHOOP access token...")
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.config['refresh_token'],
            'client_id': self.config['client_id'],
            'client_secret': self.config['client_secret'],
            'scope': 'offline'
        }
        return self._send_token_request(data)

    def _send_token_request(self, data):
        """Sends x-www-form-urlencoded request to the token endpoint. Returns True on success."""
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        response = requests.post(self.token_url, data=data, headers=headers)

        if response.status_code == 200:
            res_data = response.json()
            self.config['access_token'] = res_data['access_token']
            self.config['refresh_token'] = res_data['refresh_token']
            self.config['expires_at'] = time.time() + res_data['expires_in']
            self._save_config()
            log.info("WHOOP tokens refreshed and saved to whconfig.json")
            return True
        else:
            log.error(f"WHOOP token request failed ({response.status_code}): {response.text[:200]}")
            return False

    def get_auth_header(self, interactive=True):
        """Main entry point for data collection scripts.

        Flow:
          1. If no refresh token → run bootstrap (full login) or raise AuthRequired
          2. If token is missing or expiring soon → try refresh
             - If refresh fails → clear tokens → run bootstrap or raise AuthRequired
          3. Return Authorization header
        """
        # No refresh token at all — need a full login
        if not self.config.get('refresh_token'):
            if not interactive:
                raise AuthRequired(
                    "WHOOP tokens are missing and require manual re-authentication. "
                    "Run: python whoop_token_manager.py"
                )
            log.warning("No WHOOP refresh token found. Starting full login...")
            self.bootstrap()
            self.config = self._load_config()

        # Token is missing or expiring within 5 minutes — try to refresh
        token_expiring = time.time() >= (self.config.get('expires_at', 0) - 300)
        if not self.config.get('access_token') or token_expiring:
            success = self.refresh_access_token()
            if not success:
                if not interactive:
                    self._clear_tokens()
                    raise AuthRequired(
                        "WHOOP token refresh failed and requires manual re-authentication. "
                        "Run: python whoop_token_manager.py"
                    )
                # Refresh failed (token revoked / expired) — clear and re-login
                log.warning("WHOOP refresh failed. Clearing tokens and starting fresh login...")
                self._clear_tokens()
                self.bootstrap()
                self.config = self._load_config()

        return {'Authorization': f"Bearer {self.config['access_token']}"}

if __name__ == "__main__":
    manager = WhoopTokenManager()
    header = manager.get_auth_header()
    log.info("WHOOP authentication confirmed.")
