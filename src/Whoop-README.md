# WHOOP Data Exporter Guide

This guide explains how to authenticate with the WHOOP API and sync your workout data into a structured local archive using the provided Python scripts.

---

## 1. Authentication (`whoop_token_manager.py`)

Before fetching data, you must generate an OAuth2 access token. The `whoop_token_manager.py` script handles the authorization flow and saves your credentials to `meta-data/whconfig.json`.

### **Prerequisites**

Ensure your Client ID and Client Secret from the [WHOOP Developer Portal](https://developer-dashboard.whoop.com/apps/26b335ff-9013-4eb8-9b76-66679453a0cf) are configured within the script or environment.

### **How to use**

Run the script to start the authorization process:

```bash
python whoop_token_manager.py

```

1. The script will provide a URL. Copy and paste this into your browser.
2. Log in to WHOOP and authorize the app.
3. You will be redirected to `localhost`. Copy the full URL of that redirect page (it contains the `code` parameter).
4. Paste the URL back into the terminal when prompted.
5. The script will exchange the code for a token and save it automatically.

---

## 2. Fetching Workouts (`whoop_fetch_activity.py`)

Once authenticated, use `whoop_fetch_activity.py` to pull workout data. This script is **idempotent**—it will update existing records and add new ones without creating duplicates.

### **Date Interface**

The script accepts a single optional argument to define the look-back period:

| Argument | Example | Behavior |
| --- | --- | --- |
| **None** | `python whoop_fetch_activity.py` | Fetches workouts for **Today** only (from UTC midnight). |
| **YYYY-MM** | `python whoop_fetch_activity.py 2026-01` | Fetches everything from the **1st of that month** to the current moment. |
| **YYYY-MM-DD** | `python whoop_fetch_activity.py 2026-02-15` | Fetches everything from **that specific day** to the current moment. |

> **Note:** The script handles pagination automatically. If a month contains more than 25 workouts, it will continue making requests until the entire range is captured.

---

## 3. Storage Format

The script organizes your data into a "Data Warehouse" structure inside the `whoop-data/` folder. This ensures the dataset remains manageable even as it grows over several years.

### **Directory Structure**

```text
whoop-data/
└── 2026/
    ├── 01/
    │   └── 01.json
    ├── 02/
    │   └── 02.json
    └── 03/
        └── 03.json

```

### **File Content (`MM.json`)**

Each monthly file contains a JSON array of workout objects. Each object is keyed by its unique WHOOP `id` during the save process to ensure idempotency.

**Example Entry:**

```json
{
    "id": "d9ce3332-66bd-4144-b2a8-34da63354e24",
    "date_created": "2026-03-01T19:57:00.685Z",
    "sport_name": "running",
    "avg_heart_rate": 138,
    "calories": 295
}

```

### **Key Features**

* **Idempotency:** If you run the script multiple times for the same date, the `id` check ensures that existing records are simply overwritten with the latest data, preventing duplicate entries.
* **Chronological Order:** Records within each `MM.json` file are automatically sorted by `date_created` every time the file is updated.
