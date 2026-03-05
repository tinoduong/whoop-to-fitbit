import json
import os
import requests
import base64

CONFIG_PATH = os.path.join("./meta-data", "config.json")

def load_config():
    with open(CONFIG_PATH, 'r') as f:
        return json.load(f)

def save_tokens(config, access_token, refresh_token):
    config['access_token'] = access_token
    config['refresh_token'] = refresh_token
    with open(CONFIG_PATH, 'w') as f:
        json.dump(config, f, indent=4)
    return access_token

def get_valid_token():
    config = load_config()
    
    # If we already have a refresh token, just refresh it silently
    if config.get('refresh_token'):
        return refresh_token(config)
    
    # Otherwise, do the manual one-time setup
    return manual_auth(config)

def manual_auth(config):
    # Added 'nutrition' to the scope so you can log meals later!
    auth_url = f"{config['uriAuth']}?response_type=code&client_id={config['client_id']}&scope=activity%20heartrate%20location%20profile%20weight%20nutrition&redirect_uri={config['redirect_uri']}"
    print(f"Go to: {auth_url}")
    full_url = input("Paste the redirected URL: ").strip()
    code = full_url.split("code=")[1].split("#")[0]
    return exchange(config, {"grant_type": "authorization_code", "code": code, "redirect_uri": config['redirect_uri']})

def refresh_token(config):
    return exchange(config, {"grant_type": "refresh_token", "refresh_token": config['refresh_token']})

def exchange(config, payload):
    auth_header = base64.b64encode(f"{config['client_id']}:{config['client_secret']}".encode()).decode()
    headers = {"Authorization": f"Basic {auth_header}", "Content-Type": "application/x-www-form-urlencoded"}
    res = requests.post(config['uriRefresh'], headers=headers, data=payload)
    if res.status_code == 200:
        data = res.json()
        return save_tokens(config, data['access_token'], data['refresh_token'])
    return None

if __name__ == "__main__":
    token = get_valid_token()
    if token:
        print("Token acquired and saved to config.json")