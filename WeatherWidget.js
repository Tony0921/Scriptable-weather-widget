// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: blue; icon-glyph: cloud;
const secrets = importModule("WeatherSecrets")

// ========= 設定區 =========
const API_KEY = secrets.API_KEY;
const UNITS = "metric";             // metric = °C, imperial = °F
const LANG = "zh_tw";               // 語系：繁中 zh_tw、英文 en
const FORECAST_INTERVAL_HOURS = 1;   // 逐時預報間隔：只支援 1 或 2 小時
const USE_BACKGROUND_GRADIENT = true; // 是否使用漸層背景

const fm = FileManager.local();
const CACHE_FILE = fm.joinPath(fm.documentsDirectory(), "weather-cache.json");
const CACHE_SCHEMA_VERSION = 4;

const TIME_TEXT_SIZE = 12;
const DATA_TEXT_SIZE = 10;

// 只保存同一次更新中完整取得的 Current、Hourly 與 Daily，避免部分成功覆蓋舊快取。
function saveWeatherCache(current, forecast, daily, displayName) {
	try {
		fm.writeString(CACHE_FILE, JSON.stringify({
			schemaVersion: CACHE_SCHEMA_VERSION,
			updatedAt: Date.now(),
			current,
			forecast,
			daily,
			displayName
		}));
	} catch (error) {
		console.error(`寫入快取失敗：${error}`);
	}
}
async function getCurrentLocation() {
	try {
		// 天氣查詢不需要 GPS 等級精度，100 公尺精度可加快定位並減少耗電。
		Location.setAccuracyToHundredMeters();
		return await Location.current();
	} catch (error) {
		console.error(`取得目前位置失敗：${error}`);
		return null;
	}
}

async function getDisplayName(latitude, longitude) {
	try {
		// 使用 Apple 反向地理編碼，地名只顯示到縣市層級，不加入里等次行政區。
		const places = await Location.reverseGeocode(latitude, longitude, "zh_TW");
		const place = places?.[0] ?? {};
		const parts = [
			place.administrativeArea,
			place.locality
		].filter(Boolean);

		return [...new Set(parts)].join(" ") || place.name || null;
	} catch (error) {
		console.error(`反向地理編碼失敗：${error}`);
		return null;
	}
}

function loadWeatherCache() {
	try {
		if (!fm.fileExists(CACHE_FILE)) return null;
		const cache = JSON.parse(fm.readString(CACHE_FILE));

		// 忽略 v2/v3 舊格式及不完整內容，避免不同 JSON 結構造成小工具顯示錯誤。
		const isComplete =
			cache?.schemaVersion === CACHE_SCHEMA_VERSION &&
			Number.isFinite(cache.updatedAt) &&
			Number.isFinite(cache.current?.dt) &&
			Array.isArray(cache.forecast) && cache.forecast.length > 0 &&
			Number.isFinite(cache.daily?.min) &&
			Number.isFinite(cache.daily?.max);

		if (!isComplete) {
			console.log("忽略版本不符或內容不完整的天氣快取。");
			return null;
		}
		return cache;
	} catch (error) {
		console.error(`讀取快取失敗：${error}`);
		return null;
	}
}
function mapWeatherIcon(icon) {
	const base = icon.slice(0, 2)  // 取前兩碼 01 / 02 / 03...
	const isDay = icon.endsWith("d")

	switch (base) {
		case "01": return isDay ? "sun.max.fill" : "moon.stars.fill"
		case "02": return isDay ? "cloud.sun.fill" : "cloud.moon.fill"
		case "03": return "cloud.fill"
		case "04": return "smoke.fill"
		case "09": return "cloud.drizzle.fill"
		case "10": return isDay ? "cloud.sun.rain.fill" : "cloud.moon.rain.fill"
		case "11": return "cloud.bolt.rain.fill"
		case "13": return "cloud.snow.fill"
		case "50": return "cloud.fog.fill"
		default: return "questionmark.circle"
	}
}

// ========= 主程式 =========
async function run() {
	const widget = new ListWidget();
	widget.setPadding(10, 12, 10, 12);

	// 必須在網路請求前設定，確保失敗訊息在鎖屏上仍清楚可見。
	if (USE_BACKGROUND_GRADIENT) {
		const gradient = new LinearGradient();
		gradient.colors = [new Color("#1e3c72"), new Color("#2a5298")];
		gradient.locations = [0, 1];
		widget.backgroundGradient = gradient;
	} else {
		widget.backgroundColor = new Color("#1e1e1e");
	}
	widget.refreshAfterDate = new Date(Date.now() + 30 * 60 * 1000);

	const location = await getCurrentLocation();
	let current = null;
	let forecastResult = null;
	let dailyTemperature = null;
	let displayName = null;

	if (location) {
		const { latitude, longitude } = location;
		// 地名、目前天氣、逐時預報與每日溫度互不依賴，同時查詢可縮短小工具更新時間。
		[displayName, current, forecastResult, dailyTemperature] = await Promise.all([
			getDisplayName(latitude, longitude),
			fetchCurrentWeather(latitude, longitude),
			fetchForecast(latitude, longitude),
			fetchDailyTemperature(latitude, longitude)
		]);
	}

	// API 4.0 Current 不含當日高低溫；只有 Current 與 Daily 都成功才組成完整目前天氣。
	if (current && dailyTemperature) {
		current.main.temp_min = dailyTemperature.min;
		current.main.temp_max = dailyTemperature.max;
	} else if (current) {
		console.error("Daily Temperature Error: 無法取得當日最高及最低溫");
		current = null;
	}

	const liveCurrent = current;
	const liveForecast = forecastResult;
	const liveDailyTemperature = dailyTemperature;
	const liveDisplayName = displayName;
	const cache = loadWeatherCache();
	let dataUpdatedAt = Number.isFinite(liveCurrent?.dt)
		? liveCurrent.dt * 1000
		: null;

	// 網路失敗時個別回退到同一份完整快取，且預報永遠正規化為陣列。
	if (!current) {
		current = cache?.current ?? null;
		dailyTemperature = cache?.daily ?? null;
		displayName = cache?.displayName ?? null;
		dataUpdatedAt = cache?.updatedAt ?? null;
	}
	if (!Array.isArray(forecastResult)) {
		forecastResult = cache?.forecast ?? [];
	}
	const forecastList = Array.isArray(forecastResult) ? forecastResult : [];

	// 三組 OpenWeather 即時資料都成功才更新快取，避免以部分回應覆蓋完整舊資料。
	if (
		liveCurrent &&
		Array.isArray(liveForecast) && liveForecast.length > 0 &&
		liveDailyTemperature
	) {
		saveWeatherCache(
			liveCurrent,
			liveForecast,
			liveDailyTemperature,
			liveDisplayName || null
		);
	}

	if (!current) {
		const t = widget.addText("暫時無法取得天氣");
		t.textColor = Color.white();
		Script.setWidget(widget);
		Script.complete();
		return;
	}

	const body1 = widget.addStack();
	body1.centerAlignContent();

	const col_left = body1.addStack();
	col_left.layoutVertically();

	// ====== 最上方：城市 + 描述 + 大溫度（橫向，吃滿寬度） ======

	// 左1行：城市位置
	const city = col_left.addStack();
	city.centerAlignContent();

	const locSymbol = SFSymbol.named("location.fill");
	locSymbol.applyFont(Font.systemFont(12));
	const citySymbol = city.addImage(locSymbol.image);
	citySymbol.imageSize = new Size(12, 12);
	citySymbol.tintColor = Color.white();

	city.addSpacer(3);

	const cityText = city.addText(displayName || "目前位置");
	cityText.font = Font.boldSystemFont(12);
	cityText.textColor = Color.white();

	city.addSpacer();

	// 左2行：當前天氣資料
	const curr_wx = col_left.addStack();
	curr_wx.centerAlignContent();

	const weatherSymbol = SFSymbol.named(mapWeatherIcon(current.weather[0].icon));
	weatherSymbol.applyFont(Font.systemFont(55));
	const weatherSymbolImg = curr_wx.addImage(weatherSymbol.image);
	weatherSymbolImg.imageSize = new Size(55, 55);

	curr_wx.addSpacer(8);

	const curr_wx_data = curr_wx.addStack();
	curr_wx_data.layoutVertically();
	
	curr_wx_data.addSpacer();

	const wx_data_row = curr_wx_data.addStack();
	wx_data_row.centerAlignContent();

	const wx_data_r_c1 = wx_data_row.addStack();
	wx_data_r_c1.layoutVertically();

	// 濕度
	const humidity = wx_data_r_c1.addStack();
	humidity.centerAlignContent();

	const humiditySymbol = humidity.addImage(SFSymbol.named("humidity.fill").image);
	humiditySymbol.imageSize = new Size(15, 15);
	humiditySymbol.tintColor = Color.blue();

	const humidityVal = humidity.addText(` ${current.main.humidity}%`);
	humidityVal.font = Font.systemFont(11);
	humidityVal.textColor = Color.white();

	// 風速
	const windSpeed = wx_data_r_c1.addStack();
	windSpeed.centerAlignContent();

	const windSpeedSymbol = windSpeed.addImage(SFSymbol.named("wind").image);
	windSpeedSymbol.imageSize = new Size(15, 15);
	windSpeedSymbol.tintColor = Color.white();

	const windSpeedVal = windSpeed.addText(` ${(current.wind?.speed ?? 0).toFixed(1)} m/s`);
	windSpeedVal.font = Font.systemFont(11);
	windSpeedVal.textColor = Color.white();

	wx_data_row.addSpacer(5);

	// 日出&日落
	const wx_data_r_c2 = wx_data_row.addStack();
	wx_data_r_c2.layoutVertically();
	wx_data_r_c2.bottomAlignContent();

	const sunrise = wx_data_r_c2.addStack();
	sunrise.centerAlignContent();

	const sunset = wx_data_r_c2.addStack();
	sunset.centerAlignContent();

	const sunriseUnix = current.sys?.sunrise;
	const sunsetUnix = current.sys?.sunset;

	if (sunriseUnix && sunsetUnix) {
		const sunriseStr = formatTimeFromUnix(sunriseUnix);
		const sunsetStr = formatTimeFromUnix(sunsetUnix);

		const sunriseSymbol = sunrise.addImage(SFSymbol.named("sunrise.fill").image);
		sunriseSymbol.imageSize = new Size(15, 15);
		sunriseSymbol.tintColor = Color.yellow();

		const sunriseTime = sunrise.addText(` ${sunriseStr}`);
		sunriseTime.font = Font.systemFont(11);
		sunriseTime.textColor = new Color("#ffd27f");

		const sunsetSymbol = sunset.addImage(SFSymbol.named("sunset.fill").image);
		sunsetSymbol.imageSize = new Size(15, 15);
		sunsetSymbol.tintColor = Color.yellow();

		const sunsetTime = sunset.addText(` ${sunsetStr}`);
		sunsetTime.font = Font.systemFont(11);
		sunsetTime.textColor = new Color("#ffd27f");
	}

	wx_data_row.addSpacer(5);

	const wx_data_r_c3 = wx_data_row.addStack();
	wx_data_r_c3.layoutVertically();

	wx_data_r_c3.addSpacer(15);

	const feelsLike = wx_data_r_c3.addStack();
	feelsLike.centerAlignContent();

	const feelsLikeSymbol = feelsLike.addImage(SFSymbol.named("thermometer.variable.and.figure").image);
	feelsLikeSymbol.imageSize = new Size(15, 15);
	feelsLikeSymbol.tintColor = new Color("#fff7ed");

	const feelsLikeVal = feelsLike.addText(` ${Math.round(current.main.feels_like)}°`);
	feelsLikeVal.font = Font.systemFont(11);
	feelsLikeVal.textColor = Color.white();

	wx_data_row.addSpacer();

	curr_wx.addSpacer();

	body1.addSpacer();

	// 右側
	const col_Right = body1.addStack();
	col_Right.layoutVertically();

	// 更新時間
	const t_update = col_Right.addStack();
	t_update.centerAlignContent();

	t_update.addSpacer(20);

	const updateTimeIcon = t_update.addImage(SFSymbol.named("arrow.up.circle.badge.clock").image);
	updateTimeIcon.imageSize = new Size(10, 10);
	updateTimeIcon.tintColor = new Color("#dddddd");

	// 即時資料顯示 API 的資料時間；使用快取時顯示該快取最後成功寫入的時間。
	const updateDate = Number.isFinite(dataUpdatedAt)
		? new Date(dataUpdatedAt)
		: new Date();
	const updateTime = t_update.addText(`${formatTime(updateDate)}`);
	updateTime.font = Font.systemFont(10);
	updateTime.textColor = new Color("#dddddd");
	updateTime.minimumScaleFactor = 0.7;
	
	// 把目前溫度納入顯示範圍，避免四捨五入後越界。
	const effectiveMinTemp = Math.min(current.main.temp_min, current.main.temp)
	const effectiveMaxTemp = Math.max(current.main.temp_max, current.main.temp)
	
	const tempNow = Math.round(current.main.temp);
	const tMax = Math.round(effectiveMaxTemp);
	const tMin = Math.round(effectiveMinTemp);

	// 大字現在溫度
	const tempText = col_Right.addText(`${tempNow}°`);
	tempText.font = Font.boldSystemFont(34);
	tempText.textColor = Color.white();

	const tempBarImg = provideTempBar(tempNow, tMax, tMin);
	const tempBar = col_Right.addImage(tempBarImg);
	tempBar.imageSize = new Size(50, 5);

	col_Right.addSpacer(3);

	const hiloStack = col_Right.addStack();
	hiloStack.layoutHorizontally();
	hiloStack.centerAlignContent();
	// hiloStack.size = new Size(0, 0);
	// hiloStack.setPadding(0, 0, 0, 0);

	const loTempText = hiloStack.addText(`${tMin}°`);
	loTempText.font = Font.systemFont(11);

	hiloStack.addSpacer(20);

	const hiTempText = hiloStack.addText(`${tMax}°`);
	hiTempText.font = Font.systemFont(11);

	widget.addSpacer(5);

	// ------ 未來3小時 * 5個預測 -----
	const body2 = widget.addStack();
	body2.layoutHorizontally();
	body2.centerAlignContent();
	body2.size = new Size(0, 0);
	body2.setPadding(0, 0, 0, 0);
	body2.spacing = 0

	if (forecastList.length > 0) {
		addForecastIcon(body2);
		for (let i = 0; i < Math.min(8, forecastList.length); i++) {
			// if (i > 0) body2.addSpacer();
			addForecast(body2, forecastList[i]);
		}
	} else {
		const noForecast = body2.addText("暫時無法取得預報");
		noForecast.font = Font.systemFont(11);
		noForecast.textColor = Color.white();
	}

	Script.setWidget(widget);
	Script.complete();
}

function provideTempBar(temp, maxTemp, minTemp) {

	const tempBarWidth = 200;
	const tempBarHeight = 20;
	// const weatherData = this.data.weather

	let percent = (temp - minTemp) / (maxTemp - minTemp);
	if (percent < 0) { percent = 0; }
	else if (percent > 1) { percent = 1; }

	const draw = new DrawContext();
	draw.opaque = false;
	draw.respectScreenScale = true;
	draw.size = new Size(tempBarWidth, tempBarHeight);

	const barPath = new Path();
	const barHeight = tempBarHeight / 2;
	const barY = (tempBarHeight - barHeight) / 2;
	barPath.addRoundedRect(new Rect(0, barY, tempBarWidth, barHeight), barHeight / 2, barHeight / 2);
	draw.addPath(barPath);

	draw.setFillColor(new Color("#FFFFFF", 0.5));
	draw.fillPath();

	const currPath = new Path();
	currPath.addEllipse(new Rect((tempBarWidth - tempBarHeight) * percent, 0, tempBarHeight, tempBarHeight));
	draw.addPath(currPath);
	draw.setFillColor(new Color("#FFFFFF", 1));
	draw.fillPath();

	return draw.getImage();
}

async function addForecastIcon(stack) {
	let SYMBOL_SIZE = 10;
	let IMG_WITH = 10;
	let IMG_HIGHT = 10;

	let t = stack.addStack();
	t.layoutVertically();
	t.size = new Size(0, 0);
	t.setPadding(0, 0, 0, 0);

	let fRow1 = t.addStack();

	fRow1.addSpacer();
	const fTimeIcon = SFSymbol.named("clock");
	fTimeIcon.applyFont(Font.systemFont(SYMBOL_SIZE));
	const fTimeIconImg = fRow1.addImage(fTimeIcon.image);
	fTimeIconImg.imageSize = new Size(IMG_WITH, IMG_HIGHT);
	fTimeIconImg.tintColor = Color.yellow();
	fRow1.addSpacer();

	let fRow2 = t.addStack();

	fRow2.addSpacer();
	const fWeatherSymbol = SFSymbol.named("smoke");
	fWeatherSymbol.applyFont(Font.systemFont(20));
	const fWeatherSymbolImg = fRow2.addImage(fWeatherSymbol.image);
	fWeatherSymbolImg.imageSize = new Size(20, 20);
	fWeatherSymbolImg.tintColor = Color.blue();
	fRow2.addSpacer();

	let fRow3 = t.addStack();

	fRow3.addSpacer();
	const fTempIcon = SFSymbol.named("thermometer");
	fTempIcon.applyFont(Font.systemFont(SYMBOL_SIZE));
	const fTempIconImg = fRow3.addImage(fTempIcon.image);
	fTempIconImg.imageSize = new Size(IMG_WITH, IMG_HIGHT);
	fTempIconImg.tintColor = Color.white();
	fRow3.addSpacer();

	let fRow4 = t.addStack();

	fRow4.addSpacer();
	const fPopIcon = SFSymbol.named("umbrella.percent");
	fPopIcon.applyFont(Font.systemFont(SYMBOL_SIZE));
	const fPopIconImg = fRow4.addImage(fPopIcon.image);
	fPopIconImg.imageSize = new Size(IMG_WITH, IMG_HIGHT);
	fPopIconImg.tintColor = Color.white();
	fRow4.addSpacer();

	let fRow5 = t.addStack();

	fRow5.addSpacer();
	const fRainIcon = SFSymbol.named("cloud.drizzle");
	fRainIcon.applyFont(Font.systemFont(SYMBOL_SIZE));
	const fRainIconImg = fRow5.addImage(fRainIcon.image);
	fRainIconImg.imageSize = new Size(IMG_WITH, IMG_HIGHT);
	fRainIconImg.tintColor = Color.white();
	fRow5.addSpacer();

	let fRow6 = t.addStack();

	fRow6.addSpacer();
	const fWindIcon = SFSymbol.named("wind");
	fWindIcon.applyFont(Font.systemFont(SYMBOL_SIZE));
	const fWindIconImg = fRow6.addImage(fWindIcon.image);
	fWindIconImg.imageSize = new Size(IMG_WITH, IMG_HIGHT);
	fWindIconImg.tintColor = Color.white();
	fRow6.addSpacer();
}

async function addForecast(stack, forecast_n) {
	let t = stack.addStack();
	t.layoutVertically();
	t.size = new Size(0, 0);
	t.setPadding(0, 0, 0, 0);
	// t.backgroundColor = new Color("#AAAAAA");

	if (forecast_n) {
		const timeStr = getHoursFromUnix(forecast_n.dt);
		const fTemp = Math.round(forecast_n.main.temp);
		const fDesc = forecast_n.weather[0].description;
		const fIcon = forecast_n.weather[0].icon;
		const pop = forecast_n.pop != null ? Math.round(forecast_n.pop * 100) : 0;
		const fWind = (forecast_n.wind?.speed ?? 0).toFixed(1)

		let rainAmount = 0;
		if (forecast_n.rain) {
			rainAmount = forecast_n.rain["3h"] ?? forecast_n.rain["1h"] ?? 0;
		}
		const rainStr = rainAmount.toFixed(1);

		let fRow1 = t.addStack();
		// fRow1.backgroundColor = new Color("#AAAAAA");

		fRow1.addSpacer();
		const titleLine = fRow1.addText(`${timeStr}`);
		titleLine.font = Font.boldSystemFont(TIME_TEXT_SIZE);
		titleLine.textColor = new Color("#ffd27f");
		titleLine.minimumScaleFactor = 0.7;
		fRow1.addSpacer();

		let fRow2 = t.addStack();

		fRow2.addSpacer();
		const fWeatherSymbol = SFSymbol.named(mapWeatherIcon(fIcon));
		fWeatherSymbol.applyFont(Font.systemFont(20));
		const fWeatherSymbolImg = fRow2.addImage(fWeatherSymbol.image);
		fWeatherSymbolImg.imageSize = new Size(20, 20);
		fRow2.addSpacer();

		let fRow3 = t.addStack();

		fRow3.addSpacer();
		const forecastTemp = fRow3.addText(`${fTemp}°`);
		forecastTemp.font = Font.systemFont(DATA_TEXT_SIZE);
		forecastTemp.textColor = Color.white();
		forecastTemp.minimumScaleFactor = 0.7;
		fRow3.addSpacer();

		let fRow4 = t.addStack();

		fRow4.addSpacer();
		const forecastPop = fRow4.addText(`${pop}`);
		forecastPop.font = Font.systemFont(DATA_TEXT_SIZE);
		forecastPop.textColor = new Color("#add8e6");
		forecastPop.minimumScaleFactor = 0.7;
		// forecastPop.centerAlignText();
		fRow4.addSpacer();

		let fRow5 = t.addStack();

		fRow5.addSpacer();
		const forecastRain = fRow5.addText(rainStr == 0 ? "0" : rainStr.toString());
		forecastRain.font = Font.systemFont(DATA_TEXT_SIZE);
		forecastRain.textColor = new Color("#add8e6");
		forecastRain.minimumScaleFactor = 0.7;
		fRow5.addSpacer();

		let fRow6 = t.addStack();

		fRow6.addSpacer();
		const forecastWind = fRow6.addText(`${fWind}`);
		forecastWind.font = Font.systemFont(DATA_TEXT_SIZE);
		forecastWind.textColor = new Color("#add8e6");
		forecastWind.minimumScaleFactor = 0.7;
		fRow6.addSpacer();
	} else {
		const noData = t.addText("無法取得未來 3 小時預報");
		noData.font = Font.systemFont(11);
		noData.textColor = Color.white();
		noData.minimumScaleFactor = 0.7;
	}

	return t
}

async function divider(stack, width) {
	let divider = stack.addStack();
	divider.size = new Size(width, 0);   // 寬 1pt，高度自動撐滿
	divider.backgroundColor = new Color("#cccccc");
	divider.cornerRadius = 1;
}

// ========= OpenWeather 共用請求與錯誤處理 =========
function logOpenWeatherError(label, statusCode, json, error = null) {
	const detail = json?.message ?? error?.message ?? "未知錯誤";

	if (statusCode === 401) {
		console.error(`${label} 401：API Key 無效或尚未啟用 One Call API 4.0。${detail}`);
	} else if (statusCode === 429) {
		console.error(`${label} 429：OpenWeather API 呼叫額度已用完。${detail}`);
	} else if (statusCode >= 500) {
		console.error(`${label} ${statusCode}：OpenWeather 服務暫時異常。${detail}`);
	} else if (Number.isFinite(statusCode)) {
		console.error(`${label} ${statusCode}：${detail}`);
	} else {
		console.error(`${label} 網路或解析錯誤：${detail}`);
	}
}

async function loadOpenWeatherJSON(url, label) {
	const req = new Request(url);
	req.timeoutInterval = 10;

	try {
		const json = await req.loadJSON();
		const statusCode = req.response?.statusCode;

		// API 4.0 不再依賴 json.cod；以實際 HTTP 狀態碼判斷請求是否成功。
		if (!Number.isFinite(statusCode) || statusCode < 200 || statusCode >= 300) {
			logOpenWeatherError(label, statusCode, json);
			return null;
		}
		return json;
	} catch (error) {
		logOpenWeatherError(label, req.response?.statusCode, null, error);
		return null;
	}
}

// ========= API 呼叫：目前天氣 =========
async function fetchCurrentWeather(latitude, longitude) {
	const url =
		`https://api.openweathermap.org/data/4.0/onecall/current` +
		`?lat=${latitude}` +
		`&lon=${longitude}` +
		`&appid=${API_KEY}` +
		`&units=${UNITS}` +
		`&lang=${LANG}`;

	const json = await loadOpenWeatherJSON(url, "Current Weather");
	if (!Array.isArray(json?.data) || json.data.length === 0) {
		if (json) console.error("Current Weather Data Error：response.data 不存在或為空。");
		return null;
	}

	const data = json.data[0];
	// 將 API 4.0 扁平欄位轉成既有 UI 使用的 2.5 結構，避免改動畫面程式。
	return {
		dt: data.dt,
		weather: data.weather ?? [],
		main: {
			temp: data.temp,
			feels_like: data.feels_like,
			humidity: data.humidity
		},
		wind: { speed: data.wind_speed ?? 0 },
		sys: {
			sunrise: data.sunrise,
			sunset: data.sunset
		}
	};
}

// ========= API 呼叫：當日最高 / 最低溫 =========
async function fetchDailyTemperature(latitude, longitude) {
	const url =
		`https://api.openweathermap.org/data/4.0/onecall/timeline/1day` +
		`?lat=${latitude}` +
		`&lon=${longitude}` +
		`&appid=${API_KEY}` +
		`&units=${UNITS}` +
		`&lang=${LANG}`;

	const json = await loadOpenWeatherJSON(url, "Daily Temperature");
	if (!Array.isArray(json?.data) || json.data.length === 0) {
		if (json) console.error("Daily Temperature Data Error：response.data 不存在或為空。");
		return null;
	}

	const temp = json.data[0]?.temp;
	if (!Number.isFinite(temp?.min) || !Number.isFinite(temp?.max)) {
		console.error("Daily Temperature Data Error：temp.min 或 temp.max 無效。");
		return null;
	}
	return { min: temp.min, max: temp.max };
}

// ========= API 呼叫：逐小時預報 =========
async function fetchForecast(latitude, longitude) {
	const url =
		`https://api.openweathermap.org/data/4.0/onecall/timeline/1h` +
		`?lat=${latitude}` +
		`&lon=${longitude}` +
		`&appid=${API_KEY}` +
		`&units=${UNITS}` +
		`&lang=${LANG}`;

	const json = await loadOpenWeatherJSON(url, "Forecast");
	if (!Array.isArray(json?.data) || json.data.length === 0) {
		if (json) console.error("Forecast Data Error：response.data 不存在或為空。");
		return null;
	}

	const interval = [1, 2].includes(FORECAST_INTERVAL_HOURS)
		? FORECAST_INTERVAL_HOURS
		: 1;

	// 依設定抽取每 1 或 2 小時資料，再轉成既有預報 UI 使用的結構。
	return json.data
		.filter((_, index) => index % interval === 0)
		.slice(0, 8)
		.map(item => ({
			dt: item.dt,
			main: { temp: item.temp },
			weather: item.weather ?? [],
			pop: item.pop ?? 0,
			rain: item.rain,
			wind: { speed: item.wind_speed ?? 0 }
		}));
}
// ========= 工具函式 =========
function formatTime(date) {
	const h = date.getHours().toString().padStart(2, "0");
	const m = date.getMinutes().toString().padStart(2, "0");
	return `${h}:${m}`;
}

function formatTimeFromUnix(unix) {
	const d = new Date(unix * 1000);
	const h = d.getHours().toString().padStart(2, "0");
	const m = d.getMinutes().toString().padStart(2, "0");
	return `${h}:${m}`;
}

function getHoursFromUnix(unix) {
	const d = new Date(unix * 1000);
	const h = d.getHours().toString().padStart(2, "0");
	return `${h}`;
}
// ========= 執行 =========
await run();
