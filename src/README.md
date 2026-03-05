# Fitbit Data Archiver

A Python-based utility to authorize, fetch, and locally archive Fitbit personal data. This tool uses the [Fitbit Web API](https://dev.fitbit.com/build/reference/web-api/) to create a permanent, deduplicated JSON history on your local machine.

## 1. Initial Setup & Authorization

Before you can pull data, you must link your Python scripts to your Fitbit account.

### Step 1: App Configuration

Verify your application settings at the [Fitbit Manage My Apps](https://dev.fitbit.com/apps/details/23V3V8) page:

* **OAuth 2.0 Application Type:** Personal
* **Default Access Type:** Read & Write

### Step 2: Run the Authorization Manager

```bash
python3 auth_manager.py

```

1. **Copy the URL** that appears in your terminal and paste it into your browser.
2. Log in to Fitbit, select the **Weight** and **Nutrition** (Food) checkboxes, and click **Allow**.
3. You will be redirected to a URL like `https://www.fitbit.com/user/2DJ3GR...`.
4. **Copy the entire URL** from your browser's address bar, paste it back into the terminal prompt, and hit Enter.
5. Your tokens are now securely stored in `meta-data/config.json`.

---

## 2. How to Fetch Weight Data

The `get_weight.py` script manages the data retrieval. It uses an **explicit range API** to ensure no data is missed.

### Fetch Today Only (Default)

Syncs any weight logged on the current calendar day.

```bash
python3 get_weight.py

```

### Backfill from a Specific Date to Today

Fetches every log starting from your provided date up until right now.

```bash
python3 get_weight.py 2026-01-15

```

### Monthly Shortcut (Auto-Validation)

If you provide just the Year and Month, the script automatically assumes the **1st of that month** as the start date.

```bash
python3 get_weight.py 2026-02

```

*(The script converts `2026-02` to `2026-02-01` internally to satisfy the API.)*

---

## 3. Data Storage & Structure

The script creates a structured archive in the `./fitbit-data/` directory.

### Folder Hierarchy

Data is organized by **Year** > **Month** > **Monthly JSON File**:

```text
fitbit-data/
└── 2026/
    ├── 01/
    │   └── 01.json  <-- All January logs
    └── 02/
        └── 02.json  <-- All February logs

```

### Idempotency (Deduplication)

The script is designed to be **idempotent**, meaning you can run it as many times as you want without creating mess:

* It reads the existing file first.
* It compares the `logId` of new data against what is already saved.
* If the `logId` exists, it **skips** it. If it’s new, it **appends** it.

---

## 4. Troubleshooting

* **API Error 401:** Your token has expired. Run `python3 auth_manager.py` to refresh.
* **API Error 400:** This usually means the date format was wrong. Ensure you use `YYYY-MM` or `YYYY-MM-DD`.
* **Redirect Error:** Ensure the **Redirect URL** in your [Fitbit App Settings](https://dev.fitbit.com/apps/details/23V3V8) matches what you provided during the `auth_manager.py` setup.


Understood. I have updated the `WhoopREADME.md` to include your exact JSON object as the reference schema for the WHOOP API, while maintaining the simplified output schema for your local storage.

# WHOOP Data Exporter Guide

This guide explains how to authenticate with the WHOOP API and sync your workout data into a structured local archive.

## 5. Data Schemas

### **Source WHOOP API Schema (Reference)**

This is the full object structure returned by the WHOOP V2 API used for future reference:

```json
{
    "id": "d9ce3332-66bd-4144-b2a8-34da63354e24",
    "v1_id": null,
    "user_id": 32976351,
    "created_at": "2026-03-01T20:29:39.517Z",
    "updated_at": "2026-03-01T20:30:10.212Z",
    "start": "2026-03-01T19:57:00.685Z",
    "end": "2026-03-01T20:29:38.577Z",
    "timezone_offset": "-05:00",
    "sport_name": "running",
    "score_state": "SCORED",
    "score": {
        "strain": 10.278288,
        "average_heart_rate": 138,
        "max_heart_rate": 170,
        "kilojoule": 1232.8245,
        "percent_recorded": 1.0,
        "distance_meter": 51.698162,
        "altitude_gain_meter": 5.729784,
        "altitude_change_meter": -1.198607,
        "zone_durations": {
            "zone_zero_milli": 430000,
            "zone_one_milli": 164000,
            "zone_two_milli": 238000,
            "zone_three_milli": 1063000,
            "zone_four_milli": 63000,
            "zone_five_milli": 0
        }
    },
    "sport_id": 0
}

```

### **Local Storage Schema (Output)**

The script extracts specific fields and saves them to `whoop-data/YYYY/MM/MM.json`:

```json
{
    "id": "d9ce3332-66bd-4144-b2a8-34da63354e24",
    "sport_name": "running",
    "start_time": "2026-03-01T19:57:00.685Z",
    "end_time": "2026-03-01T20:29:38.577Z",
    "avg_heart_rate": 138,
    "calories": 295,
    "distance_meter": 51.698162
}

```
