import json
import requests
import pandas as pd
from xgboost import XGBClassifier
from http.server import BaseHTTPRequestHandler

MODEL_PATH = "xgb_outage_model.json"

feature_cols = [
    "wind_max_mps",
    "precip_sum_mm",
    "precip_3d_mm",
    "precip_7d_mm"
]


def load_wa_centroids():
    url = "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2023_Gazetteer/2023_Gaz_counties_national.zip"

    gaz = pd.read_csv(url, sep="\t")
    gaz.columns = gaz.columns.str.strip()

    gaz["GEOID"] = gaz["GEOID"].astype(str).str.zfill(5)
    gaz["latitude"] = gaz["INTPTLAT"].astype(float)
    gaz["longitude"] = gaz["INTPTLONG"].astype(float)

    wa = gaz[gaz["GEOID"].str.startswith("53")].copy()

    centroids = wa[["NAME", "latitude", "longitude"]].copy()
    centroids.columns = ["county", "latitude", "longitude"]
    centroids["county"] = centroids["county"].str.replace(" County", "", regex=False)

    return centroids.sort_values("county").reset_index(drop=True)


def fetch_weather(centroids):
    lat_str = ",".join(centroids["latitude"].astype(str))
    lon_str = ",".join(centroids["longitude"].astype(str))

    url = "https://api.open-meteo.com/v1/forecast"
    params = {
        "latitude": lat_str,
        "longitude": lon_str,
        "hourly": "wind_speed_10m,precipitation",
        "past_days": 6,
        "forecast_days": 2,
        "timezone": "America/Los_Angeles"
    }

    response = requests.get(url, params=params, timeout=30)
    response.raise_for_status()
    return response.json()


def build_live_features(centroids, locations):
    daily_parts = []

    for i, loc in enumerate(locations):
        county = centroids.iloc[i]["county"]
        hourly = loc["hourly"]

        df = pd.DataFrame({
            "datetime": pd.to_datetime(hourly["time"]),
            "wind_speed_10m": hourly["wind_speed_10m"],
            "precipitation": hourly["precipitation"]
        })

        df["date"] = df["datetime"].dt.normalize()

        daily = (
            df.groupby("date")
            .agg(
                wind_max_mps=("wind_speed_10m", "max"),
                precip_sum_mm=("precipitation", "sum")
            )
            .reset_index()
            .sort_values("date")
        )

        daily["county"] = county
        daily["precip_3d_mm"] = daily["precip_sum_mm"].rolling(3, min_periods=1).sum()
        daily["precip_7d_mm"] = daily["precip_sum_mm"].rolling(7, min_periods=1).sum()

        daily_parts.append(daily)

    return pd.concat(daily_parts, ignore_index=True)


def risk_reason(row):
    wind = row["wind_max_mps"]
    p1 = row["precip_sum_mm"]
    p3 = row["precip_3d_mm"]
    p7 = row["precip_7d_mm"]

    if wind >= 5 and p7 >= 8:
        return "wind + wet ground"

    scores = {
        "gusty winds": wind / 5,
        "rain today": p1 / 3,
        "recent rain": p3 / 8,
        "wet ground": p7 / 12
    }

    return max(scores, key=scores.get)


def run_prediction():
    model = XGBClassifier()
    model.load_model(MODEL_PATH)

    centroids = load_wa_centroids()
    locations = fetch_weather(centroids)
    live_df = build_live_features(centroids, locations)

    today = pd.Timestamp.now(tz="America/Los_Angeles").normalize().tz_localize(None)
    site_df = live_df[live_df["date"] == today].copy()

    if site_df.empty:
        latest = live_df["date"].max()
        site_df = live_df[live_df["date"] == latest].copy()
    else:
        latest = today

    site_df["outage_prob"] = model.predict_proba(site_df[feature_cols])[:, 1]
    site_df["probability"] = site_df["outage_prob"].round(4)
    site_df["reason"] = site_df.apply(
        lambda row: risk_reason(row) if row["outage_prob"] >= 0.20 else "",
        axis=1
    )

    predictions = {
        row["county"]: {
            "probability": float(row["probability"]),
            "reason": row["reason"]
        }
        for _, row in site_df.iterrows()
    }

    payload = {
        "generated_at": str(latest.date()),
        "predictions": predictions
    }

    return payload


class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        try:
            payload = run_prediction()

            self.send_response(200)
            self.send_header("Content-type", "application/json")
            self.end_headers()

            self.wfile.write(json.dumps(payload).encode())
        except Exception as e:
            self.send_response(500)
            self.send_header("Content-type", "application/json")
            self.end_headers()

            self.wfile.write(json.dumps({"error": str(e)}).encode())