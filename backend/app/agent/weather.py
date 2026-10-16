"""The agent's single non-wardrobe tool: current weather in Jerusalem (Open-Meteo, no API key).

The location is fixed on purpose, so the model can never make the server fetch other URLs.
"""

import httpx2

OPEN_METEO_URL = "https://api.open-meteo.com/v1/forecast"
JERUSALEM = {"latitude": 31.7683, "longitude": 35.2137}
CURRENT_FIELDS = "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day"

# WMO weather interpretation codes (Open-Meteo docs), as short English descriptions.
WEATHER_CODES = {
    0: "clear sky", 1: "mainly clear", 2: "partly cloudy", 3: "overcast",
    45: "fog", 48: "depositing rime fog",
    51: "light drizzle", 53: "moderate drizzle", 55: "dense drizzle",
    56: "light freezing drizzle", 57: "dense freezing drizzle",
    61: "slight rain", 63: "moderate rain", 65: "heavy rain",
    66: "light freezing rain", 67: "heavy freezing rain",
    71: "slight snow", 73: "moderate snow", 75: "heavy snow", 77: "snow grains",
    80: "slight rain showers", 81: "moderate rain showers", 82: "violent rain showers",
    85: "slight snow showers", 86: "heavy snow showers",
    95: "thunderstorm", 96: "thunderstorm with slight hail", 99: "thunderstorm with heavy hail",
}


def get_jerusalem_weather(get=httpx2.get) -> dict:
    """Returns the current conditions, or {"error": ...} when the service can't be reached."""
    params = {**JERUSALEM, "current": CURRENT_FIELDS, "timezone": "Asia/Jerusalem"}
    for _attempt in range(2):
        try:
            response = get(OPEN_METEO_URL, params=params, timeout=6)
            if response.status_code == 200:
                current = response.json()["current"]
                return {
                    "location": "Jerusalem, Israel",
                    "observedAt": current["time"],
                    "temperatureC": current["temperature_2m"],
                    "feelsLikeC": current["apparent_temperature"],
                    "humidityPercent": current["relative_humidity_2m"],
                    "windKmh": current["wind_speed_10m"],
                    "conditions": WEATHER_CODES.get(current["weather_code"], "unknown"),
                    "isDay": bool(current["is_day"]),
                }
        except (httpx2.HTTPError, KeyError, ValueError, TypeError):
            pass
    return {"error": "The weather service is unavailable right now."}
