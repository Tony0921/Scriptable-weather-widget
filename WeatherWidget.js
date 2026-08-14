// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-green; icon-glyph: magic;
const secrets = importModule("WeatherSecrets")

// ========= 設定區 =========
const API_KEY = secrets.API_KEY;
const CITY_NAME = "Taipei";         // 你的城市名稱
const UNITS = "metric";             // metric = °C, imperial = °F
const LANG = "zh_tw";               // 語系：繁中 zh_tw、英文 en
const USE_BACKGROUND_GRADIENT = true; // 是否使用漸層背景

const fm = FileManager.local();
const CACHE_FILE = fm.joinPath(fm.documentsDirectory(), "weather-cache.json");

// 只保存完整且成功取得的天氣資料，供鎖屏網路不穩時備援。
function saveWeatherCache(current, forecast) {
	try {
		fm.writeString(CACHE_FILE, JSON.stringify({
			updatedAt: Date.now(),
			current,
			forecast
		}));
	} catch (error) {
		console.error(`寫入快取失敗：${error}`);
	}
}

function loadWeatherCache() {
	try {
		if (!fm.fileExists(CACHE_FILE)) return null;
		return JSON.parse(fm.readString(CACHE_FILE));
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

	let [current, forecastResult] = await Promise.all([
		fetchCurrentWeather(),
		fetchForecast()
	]);

	const liveCurrent = current;
	const liveForecast = forecastResult;
	const cache = loadWeatherCache();

	// 網路失敗時個別回退到上次成功資料，且預報永遠正規化為陣列。
	if (!current) current = cache?.current ?? null;
	if (!Array.isArray(forecastResult)) {
		forecastResult = cache?.forecast ?? [];
	}
	const forecastList = Array.isArray(forecastResult) ? forecastResult : [];

	// 兩個即時請求都成功才更新快取，避免以不完整資料覆蓋舊快取。
	if (liveCurrent && Array.isArray(liveForecast) && liveForecast.length > 0) {
		saveWeatherCache(liveCurrent, liveForecast);
	}

	if (!current) {
		const t = widget.addText("暫時無法取得天氣");
		t.textColor = Color.white();
		Script.setWidget(widget);
		Script.complete();
		return;
	}

	// ====== 最上方：城市 + 描述 + 大溫度（橫向，吃滿寬度） ======
	const row1 = widget.addStack();
	row1.layoutHorizontally();
	row1.centerAlignContent();

	// 左：城市 + 天氣描述
	const row1Left1 = row1.addStack();
	row1Left1.layoutVertically();
	// row1Left1.centerAlignItems();
	row1Left1.size = new Size(0, 0);
	row1Left1.setPadding(0, 0, 0, 0);

	const city = row1Left1.addStack();
	city.layoutHorizontally();
	city.centerAlignContent();
	city.size = new Size(0, 0);
	city.setPadding(0, 0, 0, 0);

	const locSymbol = SFSymbol.named("location.fill");
	locSymbol.applyFont(Font.systemFont(15));
	const citySymbol = city.addImage(locSymbol.image);
	citySymbol.imageSize = new Size(15, 15);
	citySymbol.tintColor = Color.white();

	const cityText = city.addText(`${current.name}`);
	cityText.font = Font.boldSystemFont(14);
	cityText.textColor = Color.white();

	// const weather_icon = ;
	// const weatherSymbolName = ;
	const weatherSymbol = SFSymbol.named(mapWeatherIcon(current.weather[0].icon));
	weatherSymbol.applyFont(Font.systemFont(50));
	const weatherSymbolImg = row1Left1.addImage(weatherSymbol.image);
	weatherSymbolImg.imageSize = new Size(50, 50);

	// const desc = current.weather[0].description;
	// const descText = row1Left1.addText(`${desc}`);
	// descText.font = Font.systemFont(11);
	// descText.textColor = Color.white();
	// const feelsLike = Math.round(current.main.feels_like);
	// const descLine = row1Left1.addText(`${desc} · 體感 ${feelsLike}°`);
	// descLine.font = Font.systemFont(11);
	// descLine.textColor = Color.white();
	// descLine.minimumScaleFactor = 0.7;

	row1.addSpacer(5);

	const row1Left2 = row1.addStack();
	row1Left2.layoutVertically();
	row1Left2.centerAlignContent();
	row1Left2.size = new Size(0, 0);
	row1Left2.setPadding(0, 0, 0, 0);


	// 濕度
	const humidity = row1Left2.addStack();
	humidity.layoutHorizontally();
	humidity.centerAlignContent();
	humidity.size = new Size(0, 0);
	humidity.setPadding(0, 0, 0, 0);

	const humiditySymbol = humidity.addImage(SFSymbol.named("humidity.fill").image);
	humiditySymbol.imageSize = new Size(15, 15);
	humiditySymbol.tintColor = Color.blue();

	const humidityVal = humidity.addText(` ${current.main.humidity}%`);
	humidityVal.font = Font.systemFont(11);
	humidityVal.textColor = Color.white();


	// 風速
	const windSpeed = row1Left2.addStack();
	windSpeed.layoutHorizontally();
	windSpeed.centerAlignContent();
	windSpeed.size = new Size(0, 0);
	windSpeed.setPadding(0, 0, 0, 0);

	const windSpeedSymbol = windSpeed.addImage(SFSymbol.named("wind").image);
	windSpeedSymbol.imageSize = new Size(15, 15);
	windSpeedSymbol.tintColor = Color.white();

	const windSpeedVal = windSpeed.addText(` ${(current.wind?.speed ?? 0).toFixed(1)} m/s`);
	windSpeedVal.font = Font.systemFont(11);
	windSpeedVal.textColor = Color.white();

	const sunrise = row1Left2.addStack();
	sunrise.layoutHorizontally();
	sunrise.centerAlignContent();
	sunrise.size = new Size(0, 0);
	sunrise.setPadding(0, 0, 0, 0);

	const sunset = row1Left2.addStack();
	sunset.layoutHorizontally();
	sunset.centerAlignContent();
	sunset.size = new Size(0, 0);
	sunset.setPadding(0, 0, 0, 0);

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

	row1.addSpacer();

	// 右：大字現在溫度
	const row1Right = row1.addStack();
	row1Right.layoutVertically();
	row1Right.centerAlignContent();
	row1Right.size = new Size(0, 0);
	row1Right.setPadding(0, 0, 0, 0);

	const tempNow = Math.round(current.main.temp);
	const tMax = Math.round(current.main.temp_max);
	const tMin = Math.round(current.main.temp_min);

	const tempText = row1Right.addText(`${tempNow}°`);
	tempText.font = Font.boldSystemFont(34);
	tempText.textColor = Color.white();

	const tempBarImg = provideTempBar(tempNow, tMax, tMin);
	const tempBar = row1Right.addImage(tempBarImg);
	tempBar.imageSize = new Size(50, 5);

	row1Right.addSpacer(3);

	const hiloStack = row1Right.addStack();
	hiloStack.layoutHorizontally();
	hiloStack.centerAlignContent();
	hiloStack.size = new Size(0, 0);
	hiloStack.setPadding(0, 0, 0, 0);

	const loTempText = hiloStack.addText(`${tMin}°`);
	loTempText.font = Font.systemFont(11);

	hiloStack.addSpacer(20);

	const hiTempText = hiloStack.addText(`${tMax}°`);
	hiTempText.font = Font.systemFont(11);
	// hiLoLine.textColor = new Color("#ffeb99");

	widget.addSpacer();

	// ====== 中段：左右兩欄內容 ======
	// const body = widget.addStack();
	// body.layoutHorizontally();
	// body.centerAlignContent();

	// ----- 左欄 -----
	// const leftCol = body.addStack();
	// leftCol.layoutVertically();
	// leftCol.size = new Size(0, 0);   // 讓 Scriptable 自動分配寬度
	// leftCol.setPadding(0, 0, 0, 0);

	// 左欄 第1列
	// const leftColRow1 = leftCol.addStack();
	// leftColRow1.layoutHorizontally();
	// leftColRow1.centerAlignContent();
	// leftColRow1.size = new Size(0, 0);
	// leftColRow1.setPadding(0, 0, 0, 0);

	// const tMax = Math.round(current.main.temp_max);
	// const tMin = Math.round(current.main.temp_min);

	// const hiLoLine = leftColRow1.addText(`今天 高 ${tMax}° / 低 ${tMin}°`);
	// hiLoLine.font = Font.systemFont(11);
	// hiLoLine.textColor = new Color("#ffeb99");

	// 左欄 第2列
	// const leftColRow2 = leftCol.addStack();
	// leftColRow2.layoutHorizontally();
	// leftColRow2.centerAlignContent();
	// leftColRow2.size = new Size(0, 0);
	// leftColRow2.setPadding(0, 0, 0, 0);



	// const extraLine = leftCol.addText(
	// 	`💧 ${current.main.humidity}% · 🌬️ ${windSpeed} m/s`
	// );
	// extraLine.font = Font.systemFont(11);
	// extraLine.textColor = Color.white();
	// extraLine.minimumScaleFactor = 0.7;

	// 左右欄中間空隙
	// body.addSpacer();

	// ----- 右欄 -----
	// const rightCol = body.addStack();
	// rightCol.layoutVertically();
	// rightCol.size = new Size(0, 0);
	// rightCol.setPadding(0, 0, 0, 0);



	widget.addSpacer(4);
	// ------ 未來3小時 * 5個預測 -----
	const body2 = widget.addStack();
	body2.layoutHorizontally();
	body2.centerAlignContent();

	if (forecastList.length > 0) {
		for (let i = 0; i < Math.min(5, forecastList.length); i++) {
			if (i > 0) body2.addSpacer();
			addForecast(body2, forecastList[i]);
		}
	} else {
		const noForecast = body2.addText("暫時無法取得預報");
		noForecast.font = Font.systemFont(11);
		noForecast.textColor = Color.white();
	}

	// widget.addSpacer(4);

	// ------
	// const body3 = widget.addStack();
	// body3.layoutHorizontally();
	// body3.centerAlignContent();

	// body3.addSpacer();

	// const now = new Date();
	// const timeLine = body3.addText(`更新：${formatTime(now)}`);
	// timeLine.font = Font.systemFont(9);
	// timeLine.textColor = new Color("#dddddd");
	// timeLine.minimumScaleFactor = 0.7;

	// ----

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

async function addForecast(stack, forecast_n) {
	let t = stack.addStack();
	t.layoutVertically();
	t.size = new Size(0, 0);
	t.setPadding(0, 0, 0, 0);

	if (forecast_n) {
		const timeStr = formatTimeFromUnix(forecast_n.dt);
		const fTemp = Math.round(forecast_n.main.temp);
		const fDesc = forecast_n.weather[0].description;
		const fIcon = forecast_n.weather[0].icon;
		const pop = forecast_n.pop != null ? Math.round(forecast_n.pop * 100) : 0;

		let rainAmount = 0;
		if (forecast_n.rain) {
			rainAmount = forecast_n.rain["3h"] ?? forecast_n.rain["1h"] ?? 0;
		}
		const rainStr = rainAmount.toFixed(1);



		let fRow1 = t.addStack();
		fRow1.layoutHorizontally();
		fRow1.centerAlignContent();
		fRow1.size = new Size(0, 0);
		fRow1.setPadding(0, 0, 0, 0);

		fRow1.addSpacer();
		const titleLine = fRow1.addText(`${timeStr}`);
		titleLine.font = Font.boldSystemFont(12);
		titleLine.textColor = Color.white();
		titleLine.minimumScaleFactor = 0.7;
		fRow1.addSpacer();

		let fRow2 = t.addStack();
		fRow2.layoutHorizontally();
		fRow2.centerAlignContent();
		fRow2.size = new Size(0, 0);
		fRow2.setPadding(0, 0, 0, 0);

		fRow2.addSpacer();
		// const fWeather_icon = 
		// const fWeatherSymbolName = 
		const fWeatherSymbol = SFSymbol.named(mapWeatherIcon(fIcon));
		fWeatherSymbol.applyFont(Font.systemFont(20));
		const fWeatherSymbolImg = fRow2.addImage(fWeatherSymbol.image);
		fWeatherSymbolImg.imageSize = new Size(20, 20);
		fRow2.addSpacer();



		// const forecastLine1 = t.addText(`${fTemp}°C · ${fDesc}`);
		// forecastLine1.font = Font.systemFont(11);
		// forecastLine1.textColor = Color.white();
		// forecastLine1.minimumScaleFactor = 0.7;

		const forecastLine2 = t.addText(`☔ ${pop}%`);
		forecastLine2.font = Font.systemFont(11);
		forecastLine2.textColor = new Color("#add8e6");
		forecastLine2.minimumScaleFactor = 0.7;

		const forecastLine3 = t.addText(`🌧 ${rainStr} mm`);
		forecastLine3.font = Font.systemFont(11);
		forecastLine3.textColor = new Color("#add8e6");
		forecastLine3.minimumScaleFactor = 0.7;
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

// ========= API 呼叫：目前天氣 =========
async function fetchCurrentWeather() {
	try {
		const url =
			`https://api.openweathermap.org/data/2.5/weather` +
			`?q=${encodeURIComponent(CITY_NAME)}` +
			`&appid=${API_KEY}` +
			`&units=${UNITS}` +
			`&lang=${LANG}`;

		const req = new Request(url);
		req.timeoutInterval = 10;
		const json = await req.loadJSON();
		if (json.cod && json.cod !== 200) {
			console.error("Current Weather Error:", json);
			return null;
		}
		return json;
	} catch (e) {
		console.error("fetchCurrentWeather Exception:", e);
		return null;
	}
}

// ========= API 呼叫：5 天 / 3 小時預報 =========
async function fetchForecast() {
	try {
		const url =
			`https://api.openweathermap.org/data/2.5/forecast` +
			`?q=${encodeURIComponent(CITY_NAME)}` +
			`&appid=${API_KEY}` +
			`&units=${UNITS}` +
			`&lang=${LANG}`;

		const req = new Request(url);
		req.timeoutInterval = 10;
		const json = await req.loadJSON();

		if (json.cod && json.cod !== "200") {
			console.error("Forecast Error:", json);
			return null;
		}

		if (json.list && json.list.length > 0) {
			return json.list; // 最近的 3 小時區間
		}
		return null;
	} catch (e) {
		console.error("fetchForecast Exception:", e);
		return null;
	}
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

// ========= 執行 =========
await run();
