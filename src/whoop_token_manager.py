import json
import time
import requests
import os
import webbrowser
import secrets
import string
from urllib.parse import urlparse, parse_qs

class WhoopTokenManager:
    def __init__(self, config_path='meta-data/whconfig.json'):
        self.config_path = config_path
        # AUTHENTICATED ENDPOINTS FROM DOCS
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

    def bootstrap(self):
        """Standard OAuth2 flow using mandatory state parameter."""
        state = ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(12))
        # Including 'offline' scope is essential for getting a refresh_token
        scopes = "offline read:recovery read:cycles read:sleep read:workout read:profile read:body_measurement"
        
        auth_link = (f"{self.auth_url}?client_id={self.config['client_id']}"
                     f"&redirect_uri={self.config['redirect_uri']}"
                     f"&response_type=code&scope={scopes}&state={state}")
        
        print(f"\n1. Authorize here: {auth_link}")
        webbrowser.open(auth_link)
        
        full_url = input("\n2. Paste the FULL redirect URL here: ").strip()
        
        parsed_url = urlparse(full_url)
        code = parse_qs(parsed_url.query).get('code', [None])[0]
        
        if code:
            self._exchange_code(code)
        else:
            print("Error: Authorization code not found in URL.")

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
        print("Refreshing token via WHOOP...")
        data = {
            'grant_type': 'refresh_token',
            'refresh_token': self.config['refresh_token'],
            'client_id': self.config['client_id'],
            'client_secret': self.config['client_secret'],
            'scope': 'offline'
        }
        self._send_token_request(data)

    def _send_token_request(self, data):
        """Sends x-www-form-urlencoded request to the correct /oauth2/token endpoint."""
        headers = {'Content-Type': 'application/x-www-form-urlencoded'}
        response = requests.post(self.token_url, data=data, headers=headers)
        
        if response.status_code == 200:
            res_data = response.json()
            self.config['access_token'] = res_data['access_token']
            self.config['refresh_token'] = res_data['refresh_token']
            self.config['expires_at'] = time.time() + res_data['expires_in']
            self._save_config()
            print("Success: whconfig.json updated.")
        else:
            print(f"Error {response.status_code}: {response.text}")

    def get_auth_header(self):
        """The main entry point for data collection scripts."""
        if not self.config.get('refresh_token'):
            self.bootstrap()
        
        # Check if token is missing or expiring within 5 minutes
        if not self.config.get('access_token') or time.time() >= (self.config.get('expires_at', 0) - 300):
            self.refresh_access_token()
            
        return {'Authorization': f"Bearer {self.config['access_token']}"}

if __name__ == "__main__":
    manager = WhoopTokenManager()
    header = manager.get_auth_header()
    print("Authentication confirmed.")