// ========= 設定區 =========
const API_KEY = "";
const CITY_NAME = "Taipei";         // 你的城市名稱
const UNITS = "metric";             // metric = °C, imperial = °F
const LANG = "zh_tw";               // 語系：繁中 zh_tw、英文 en
const USE_BACKGROUND_GRADIENT = true; // 是否使用漸層背景

// ========= 主程式 =========
async function run() {
  const widget = new ListWidget();
  widget.setPadding(10, 12, 12, 12);

  const [current, forecast] = await Promise.all([
    fetchCurrentWeather(),
    fetchForecast3h()
  ]);

  if (!current) {
    const t = widget.addText("載入目前天氣失敗");
    t.textColor = Color.white();
    Script.setWidget(widget);
    Script.complete();
    return;
  }

  // 背景
  if (USE_BACKGROUND_GRADIENT) {
    const gradient = new LinearGradient();
    gradient.colors = [new Color("#1e3c72"), new Color("#2a5298")];
    gradient.locations = [0, 1];
    widget.backgroundGradient = gradient;
  } else {
    widget.backgroundColor = new Color("#1e1e1e");
  }

  // ====== 最上方：城市 + 描述 + 大溫度（橫向，吃滿寬度） ======
  const top = widget.addStack();
  top.layoutHorizontally();
  top.centerAlignContent();

  // 左：城市 + 天氣描述
  const topLeft = top.addStack();
  topLeft.layoutVertically();

  const cityText = topLeft.addText(`${current.name} 天氣`);
  cityText.font = Font.boldSystemFont(14);
  cityText.textColor = Color.white();
  cityText.minimumScaleFactor = 0.7;

  const desc = current.weather[0].description;
  const feelsLike = Math.round(current.main.feels_like);
  const descLine = topLeft.addText(`${desc} · 體感 ${feelsLike}°`);
  descLine.font = Font.systemFont(11);
  descLine.textColor = Color.white();
  descLine.minimumScaleFactor = 0.7;

  top.addSpacer();

  // 右：大字現在溫度
  const tempNow = Math.round(current.main.temp);
  const tempText = top.addText(`${tempNow}°`);
  tempText.font = Font.boldSystemFont(34);
  tempText.textColor = Color.white();
  tempText.minimumScaleFactor = 0.6;

  widget.addSpacer(6);

  // ====== 中段：左右兩欄內容 ======
  const body = widget.addStack();
  body.layoutHorizontally();
  body.centerAlignContent();

  // ----- 左欄：今天相關（高低溫、濕度、風速、日出日落） -----
  const leftCol = body.addStack();
  leftCol.layoutVertically();
  leftCol.size = new Size(0, 0);   // 讓 Scriptable 自動分配寬度
  leftCol.setPadding(0, 0, 0, 0);

  const tMax = Math.round(current.main.temp_max);
  const tMin = Math.round(current.main.temp_min);

  const hiLoLine = leftCol.addText(`今天 高 ${tMax}° / 低 ${tMin}°`);
  hiLoLine.font = Font.systemFont(11);
  hiLoLine.textColor = new Color("#ffeb99");
  hiLoLine.minimumScaleFactor = 0.7;

  const windSpeed = (current.wind?.speed ?? 0).toFixed(1);
  const extraLine = leftCol.addText(
    `濕度 ${current.main.humidity}% · 風速 ${windSpeed} m/s`
  );
  extraLine.font = Font.systemFont(11);
  extraLine.textColor = Color.white();
  extraLine.minimumScaleFactor = 0.7;

  const sunriseUnix = current.sys?.sunrise;
  const sunsetUnix  = current.sys?.sunset;

  if (sunriseUnix && sunsetUnix) {
    const sunriseStr = formatTimeFromUnix(sunriseUnix);
    const sunsetStr  = formatTimeFromUnix(sunsetUnix);

    const sunLine1 = leftCol.addText(`日出 ${sunriseStr}`);
    sunLine1.font = Font.systemFont(11);
    sunLine1.textColor = new Color("#ffd27f");
    sunLine1.minimumScaleFactor = 0.7;

    const sunLine2 = leftCol.addText(`日落 ${sunsetStr}`);
    sunLine2.font = Font.systemFont(11);
    sunLine2.textColor = new Color("#ffd27f");
    sunLine2.minimumScaleFactor = 0.7;
  }

  // 左右欄中間空隙
  body.addSpacer(10);

  // ----- 右欄：未來 3 小時預報 + 更新時間 -----
  const rightCol = body.addStack();
  rightCol.layoutVertically();
  rightCol.size = new Size(0, 0);
  rightCol.setPadding(0, 0, 0, 0);

  if (forecast) {
    const timeStr = formatTimeFromUnix(forecast.dt);
    const fTemp = Math.round(forecast.main.temp);
    const fDesc = forecast.weather[0].description;
    const pop = forecast.pop != null ? Math.round(forecast.pop * 100) : 0;

    let rainAmount = 0;
    if (forecast.rain) {
      rainAmount = forecast.rain["3h"] ?? forecast.rain["1h"] ?? 0;
    }
    const rainStr = rainAmount.toFixed(1);

    const titleLine = rightCol.addText(`未來3小時 ~${timeStr}`);
    titleLine.font = Font.boldSystemFont(12);
    titleLine.textColor = Color.white();
    titleLine.minimumScaleFactor = 0.7;

    const forecastLine1 = rightCol.addText(`${fTemp}°C · ${fDesc}`);
    forecastLine1.font = Font.systemFont(11);
    forecastLine1.textColor = Color.white();
    forecastLine1.minimumScaleFactor = 0.7;

    const forecastLine2 = rightCol.addText(
      `降雨 ${pop}% · 雨量 ${rainStr} mm`
    );
    forecastLine2.font = Font.systemFont(11);
    forecastLine2.textColor = new Color("#add8e6");
    forecastLine2.minimumScaleFactor = 0.7;
  } else {
    const noData = rightCol.addText("無法取得未來 3 小時預報");
    noData.font = Font.systemFont(11);
    noData.textColor = Color.white();
    noData.minimumScaleFactor = 0.7;
  }

  rightCol.addSpacer(4);

  const now = new Date();
  const timeLine = rightCol.addText(`更新：${formatTime(now)}`);
  timeLine.font = Font.systemFont(9);
  timeLine.textColor = new Color("#dddddd");
  timeLine.minimumScaleFactor = 0.7;

  Script.setWidget(widget);
  Script.complete();
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
async function fetchForecast3h() {
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
      return json.list[0]; // 最近的 3 小時區間
    }
    return null;
  } catch (e) {
    console.error("fetchForecast3h Exception:", e);
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