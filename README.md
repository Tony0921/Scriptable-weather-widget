**English** | [繁體中文](./README.zh-TW.md)

# Scriptable Weather Widget

A Scriptable weather widget designed for the medium iPhone widget. It uses your current location to display current conditions, today's high and low temperatures, and an hourly forecast.

## Demo

<img src="./img/demo.png" alt="Scriptable Weather Widget Demo" width="500">

## Features

- Automatically detects your current location and city
- Displays current temperature, feels-like temperature, humidity, and wind speed
- Shows sunrise, sunset, and today's high and low temperatures
- Provides hourly weather, precipitation probability, rainfall, and wind forecasts
- Uses separate weather icons for daytime and nighttime conditions
- Falls back to the most recent successful cache during temporary network failures
- Supports configurable forecast intervals and background styles

> This project supports the medium widget only. Other widget sizes will display an unsupported-size message.

## Built With

- JavaScript and the [Scriptable](https://scriptable.app/) widget API
- OpenWeather One Call API 4.0
- Apple Location and reverse geocoding
- SF Symbols for weather and information icons
- Scriptable FileManager and a local JSON cache

## Requirements

- iPhone or iPad
- [Scriptable](https://scriptable.app/)
- An OpenWeather API key with an active One Call API 4.0 subscription
- Location and network access for Scriptable

## OpenWeather One Call API 4.0

This project uses **One Call API 4.0**, not the older One Call API 2.5. OpenWeather deprecated One Call API 2.5 in June 2024. Version 4.0 uses a separate pay-per-call subscription and requires you to complete the subscription and billing setup before use.

According to OpenWeather's current plan:

- The first 1,000 API calls per day are free
- Calls above the daily free allowance are billed based on usage
- The default daily limit after subscribing is 2,000 calls
- To avoid charges, sign in to OpenWeather, open **Billing plans**, and change the One Call API 4.0 daily limit to **1,000 calls**

Each complete widget update makes three OpenWeather API calls: current weather, hourly forecast, and daily high/low temperatures. Scriptable requests a refresh about every 30 minutes, although iOS controls the actual schedule. Manual runs, multiple devices, or multiple widgets will increase usage.

Review the latest official information before subscribing:

- [One Call API 4.0 documentation](https://openweathermap.org/api/one-call-4)
- [OpenWeather pricing](https://openweathermap.org/price)
- [OpenWeather FAQ](https://openweathermap.org/faq)
- [One Call API 2.5 deprecation notice](https://openweathermap.org/one-call-1-deprecated)

## Installation

### 1. Add the scripts

Download these two files from the project and add them to Scriptable:

- `WeatherWidget.js`
- `WeatherSecrets.js`

Keep the original filenames because the main script imports the API key from the `WeatherSecrets` module.

### 2. Configure your API key

Open `WeatherSecrets.js` and replace `YOUR_API_KEY_HERE` with your OpenWeather API key:

```javascript
module.exports = {
  API_KEY: "YOUR_API_KEY_HERE"
}
```

Never commit a `WeatherSecrets.js` file containing a real API key to a public repository.

### 3. Test the script

Run `WeatherWidget.js` once inside Scriptable and allow location access when prompted. A weather preview should appear when the API key, One Call API 4.0 subscription, and network connection are working correctly.

### 4. Add the Home Screen widget

1. Touch and hold the iPhone Home Screen, then add a Scriptable widget.
2. Select the medium size.
3. Touch and hold the new widget, then choose **Edit Widget**.
4. Set **Script** to `WeatherWidget`.

## Basic Configuration

The following options are available near the top of `WeatherWidget.js`:

| Option | Purpose |
| --- | --- |
| `LANG` | Sets the weather data language |
| `FORECAST_INTERVAL_HOURS` | Displays one forecast every 1 or 2 hours |
| `USE_BACKGROUND_GRADIENT` | Switches between a gradient and solid background |

The interface is designed for metric units, so keeping `UNITS` set to `"metric"` is recommended.

## Troubleshooting

### Weather data is unavailable

Check that the device is online, Scriptable has location permission, the API key is correct, and the One Call API 4.0 subscription is active. If you receive a `429` error, check whether the account has reached its configured daily call limit.

### The widget reports an unsupported size

This project supports the medium widget only. Remove the existing widget and add it again using the medium size.

### The widget still shows old data

The widget may be displaying the latest successful cache. Run the script directly in Scriptable and confirm that fresh data loads successfully.

## Privacy and Security

Location data is used only to determine the location name and request local weather data. The weather cache is stored in Scriptable's local documents directory. Keep the API key in `WeatherSecrets.js` rather than embedding it in the main script.

## License

See [LICENSE](./LICENSE) for license information.
