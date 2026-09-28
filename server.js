require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "20mb" }));

/* =========================================================
   طھظ†ط¸غŒظ…ط§طھ
========================================================= */

const PORT = Number(process.env.PORT) || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.BALE_BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const BALE_API_BASE = "https://tapi.bale.ai/bot";

const CONTACT_PHONE = "غ°غ¹غ±غ·غ·غ·غ°غ°غ¹غ¶غ±";
const ADMIN_NAME = "ط­ظ…غŒط¯ ط¬ط§ظˆغŒط¯غŒ";
const CHANNEL_URL = "https://ble.ir/safarmashhadtoos";
const WEBSITE_URL = "https://safarmashhadtoos.ir";

// ط¨ط±ط§غŒ طھظˆط±ظ‡ط§غŒ ظ‡ظˆط§غŒغŒ/ط±غŒظ„غŒ/ط§طھظˆط¨ظˆط³غŒ طھط§ غ±غ° ظ†ظپط±طŒ ظˆط±ظˆط¯ ط¯ط³طھغŒ ظ„غŒط³طھ ظپط¹ط§ظ„ ط§ط³طھ.
// ط¨غŒط´طھط± ط§ط² غ±غ° ظ†ظپط±: ظپط§غŒظ„ ظ„غŒط³طھ ط¯ط±غŒط§ظپطھ ظ…غŒâ€Œط´ظˆط¯.
const MANUAL_PASSENGER_LIMIT = 10;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================================================
   ط§ط¨ط²ط§ط± ط§ط¹ط¯ط§ط¯
========================================================= */

function toEnglishDigits(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/[غ°-غ¹]/g, d => String("غ°غ±غ²غ³غ´غµغ¶غ·غ¸غ¹".indexOf(d)))
    .replace(/[ظ -ظ©]/g, d => String("ظ ظ،ظ¢ظ£ظ¤ظ¥ظ¦ظ§ظ¨ظ©".indexOf(d)));
}

function toPersianDigits(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/0/g, "غ°")
    .replace(/1/g, "غ±")
    .replace(/2/g, "غ²")
    .replace(/3/g, "غ³")
    .replace(/4/g, "غ´")
    .replace(/5/g, "غµ")
    .replace(/6/g, "غ¶")
    .replace(/7/g, "غ·")
    .replace(/8/g, "غ¸")
    .replace(/9/g, "غ¹");
}

// ظ†ظ…ط§غŒط´ طھط§ط±غŒط® ط§ط² ع†ظ¾ ط¨ظ‡ ط±ط§ط³طھ ط¯ط± ظ…ط­غŒط· ط±ط§ط³طھâ€Œط¨ظ‡â€Œع†ظ¾ ط¨ظ„ظ‡
function ltrDate(value) {
  return `\u200E${toEnglishDigits(value)}\u200E`;
}

function parseInteger(value, allowZero = false) {
  const clean = toEnglishDigits(value).replace(/[^0-9]/g, "");
  if (!clean) return null;

  const n = Number(clean);
  if (!Number.isInteger(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;

  return n;
}

function normalizeDate(value) {
  const clean = toEnglishDigits(value).trim().replace(/[.-]/g, "/");
  const parts = clean.split("/");

  if (parts.length !== 3) return null;

  const year = parts[0].trim();
  const month = parts[1].trim().padStart(2, "0");
  const day = parts[2].trim().padStart(2, "0");

  if (!/^\d{4}$/.test(year)) return null;
  if (!/^\d{2}$/.test(month)) return null;
  if (!/^\d{2}$/.test(day)) return null;

  const m = Number(month);
  const d = Number(day);

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;

  return `${year}/${month}/${day}`;
}

function normalizeBirthDate(value) {
  return normalizeDate(value);
}

function normalizePhone(value) {
  const phone = toEnglishDigits(value).replace(/\s|-/g, "");
  return /^09\d{9}$/.test(phone) ? phone : null;
}

function normalizeNationalCode(value) {
  const code = toEnglishDigits(value).replace(/\D/g, "");
  return /^\d{10}$/.test(code) ? code : null;
}

/* =========================================================
   ط§ط·ظ„ط§ط¹ط§طھ ع©ط§ط±ط¨ط± / ط¨ظ„ظ‡
========================================================= */

function getUserId(message) {
  return String(
    message?.sender?.id ||
    message?.from?.id ||
    message?.chat?.id ||
    ""
  );
}

function getChatId(message) {
  return String(
    message?.chat?.id ||
    message?.sender?.id ||
    message?.from?.id ||
    ""
  );
}

function getUsername(message) {
  return (
    message?.sender?.username ||
    message?.from?.username ||
    ""
  );
}

function getFirstName(message) {
  return (
    message?.sender?.first_name ||
    message?.sender?.firstName ||
    message?.from?.first_name ||
    message?.from?.firstName ||
    "ع©ط§ط±ط¨ط±"
  );
}

/* =========================================================
   ط¯غŒطھط§ط¨غŒط³
========================================================= */

async function initDB() {
  console.log("ًں”„ Initializing database...");

  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      user_id TEXT PRIMARY KEY,
      state TEXT,
      data JSONB DEFAULT '{}'::jsonb,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS requests (
      id SERIAL PRIMARY KEY,
      request_code TEXT UNIQUE,
      user_id TEXT,
      chat_id TEXT,
      username TEXT,
      applicant_name TEXT,
      phone TEXT,
      bale_id TEXT,
      request_type TEXT,
      payment_type TEXT,
      payload JSONB DEFAULT '{}'::jsonb,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  const columns = [
    ["username", "TEXT"],
    ["applicant_name", "TEXT"],
    ["phone", "TEXT"],
    ["bale_id", "TEXT"],
    ["request_type", "TEXT"],
    ["payment_type", "TEXT"],
    ["payload", "JSONB DEFAULT '{}'::jsonb"],
    ["status", "TEXT DEFAULT 'pending'"],
    ["updated_at", "TIMESTAMPTZ DEFAULT NOW()"]
  ];

  for (const [name, type] of columns) {
    await pool.query(`ALTER TABLE requests ADD COLUMN IF NOT EXISTS ${name} ${type}`);
  }

  console.log("âœ… Database initialized successfully");
}

async function getSession(userId) {
  const result = await pool.query(
    `SELECT * FROM sessions WHERE user_id = $1`,
    [String(userId)]
  );

  return result.rows[0] || null;
}

async function saveSession(userId, state, data = {}) {
  await pool.query(
    `
    INSERT INTO sessions (user_id, state, data, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (user_id)
    DO UPDATE SET
      state = EXCLUDED.state,
      data = EXCLUDED.data,
      updated_at = NOW()
    `,
    [String(userId), state, JSON.stringify(data)]
  );
}

async function clearSession(userId) {
  await pool.query(`DELETE FROM sessions WHERE user_id = $1`, [String(userId)]);
}

/* =========================================================
   طھط§ط±غŒط®ع†ظ‡ ط¨ط±ط§غŒ ع©ظ„غŒط¯ آ«ط¨ط§ط²ع¯ط´طھآ»
========================================================= */

async function pushStep(chatId, newState, newData) {
  const old = await getSession(chatId);
  const history = Array.isArray(old?.data?.history) ? [...old.data.history] : [];

  if (old && old.state && old.state !== newState) {
    history.push({
      state: old.state,
      data: old.data || {}
    });
  }

  // طھط§ط±غŒط®ع†ظ‡ ط¨غŒط´ ط§ط² ط­ط¯ ط¨ط²ط±ع¯ ظ†ط´ظˆط¯
  if (history.length > 20) history.splice(0, history.length - 20);

  await saveSession(chatId, newState, {
    ...(newData || {}),
    history
  });
}

async function goBack(chatId) {
  const session = await getSession(chatId);

  if (!session) {
    await sendMessage(chatId, "ًںڈ  طµظپط­ظ‡ ط§طµظ„غŒ", mainKeyboard());
    return;
  }

  const history = Array.isArray(session.data?.history)
    ? [...session.data.history]
    : [];

  if (!history.length) {
    await saveSession(chatId, "MAIN", {});
    await sendMessage(chatId, "ًںڈ  طµظپط­ظ‡ ط§طµظ„غŒ", mainKeyboard());
    return;
  }

  const previous = history.pop();
  const restoredData = {
    ...(previous.data || {}),
    history
  };

  await saveSession(chatId, previous.state, restoredData);
  await showStatePrompt(chatId, previous.state, restoredData);
}

/* =========================================================
   BALE API
========================================================= */

async function baleRequest(method, body) {
  if (!BOT_TOKEN) {
    throw new Error("BOT_TOKEN ط¯ط± Environment Variables طھظ†ط¸غŒظ… ظ†ط´ط¯ظ‡ ط§ط³طھ.");
  }

  const response = await fetch(
    `${BALE_API_BASE}${BOT_TOKEN}/${method}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    }
  );

  const result = await response.json().catch(() => ({}));

  if (!response.ok || result.ok === false) {
    throw new Error(result.description || `Bale API ${response.status}`);
  }

  return result;
}

async function sendMessage(chatId, text, replyMarkup) {
  const body = {
    chat_id: chatId,
    text
  };

  if (replyMarkup) body.reply_markup = replyMarkup;
  return baleRequest("sendMessage", body);
}

async function answerCallback(callbackId) {
  try {
    await baleRequest("answerCallbackQuery", {
      callback_query_id: callbackId
    });
  } catch (error) {
    console.error("Callback answer error:", error.message);
  }
}

function isAdmin(chatId) {
  return String(chatId) === String(ADMIN_CHAT_ID);
}

/* =========================================================
   ظ…ظ†ظˆظ‡ط§
========================================================= */

function mainKeyboard() {
  return {
    keyboard: [
      [
        { text: "ًںڈ¨ ط±ط²ط±ظˆ ظ‡طھظ„" },
        { text: "ًںڑŒ طھظˆط±ظ‡ط§غŒ ظ…ط´ظ‡ط¯" }
      ],
      [
        { text: "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³ ط´ظ‡ط± ط¨ظ‡ط´طھ" },
        { text: "ًں§³ ط®ط¯ظ…ط§طھ ع¯ط±ط¯ط´ع¯ط±غŒ" }
      ],
      [
        { text: "ًں“‍ طھظ…ط§ط³ ط¨ط§ ظ…ط§" },
        { text: "ًں“¢ ع©ط§ظ†ط§ظ„" }
      ]
    ],
    resize_keyboard: true
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK" }]
    ]
  };
}

function tourMenu() {
  return {
    inline_keyboard: [
      [{ text: "âœˆï¸ڈ طھظˆط± ظ‡ظˆط§غŒغŒ", callback_data: "TOUR_AIR" }],
      [{ text: "ًںڑ† طھظˆط± ط±غŒظ„غŒ", callback_data: "TOUR_RAIL" }],
      [{ text: "ًںڑŒ طھظˆط± ط§طھظˆط¨ظˆط³غŒ", callback_data: "TOUR_BUS" }],
      [{ text: "ًںڑچ ع©ط§ط±ظˆط§ظ† ط§طھظˆط¨ظˆط³غŒ", callback_data: "TOUR_CARAVAN_BUS" }],
      [{ text: "ًںڑ† ع©ط§ط±ظˆط§ظ† ط±غŒظ„غŒ", callback_data: "TOUR_CARAVAN_RAIL" }],
      [{ text: "ًںڈ¨ ظپظ‚ط· ظ‡طھظ„", callback_data: "TOUR_HOTEL" }],
      [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK_MAIN" }]
    ]
  };
}

const TYPE_NAMES = {
  AIR: "âœˆï¸ڈ طھظˆط± ظ‡ظˆط§غŒغŒ",
  RAIL: "ًںڑ† طھظˆط± ط±غŒظ„غŒ",
  BUS: "ًںڑŒ طھظˆط± ط§طھظˆط¨ظˆط³غŒ",
  CARAVAN_BUS: "ًںڑچ ع©ط§ط±ظˆط§ظ† ط§طھظˆط¨ظˆط³غŒ",
  CARAVAN_RAIL: "ًںڑ† ع©ط§ط±ظˆط§ظ† ط±غŒظ„غŒ",
  HOTEL: "ًںڈ¨ ظپظ‚ط· ظ‡طھظ„"
};

function paymentName(paymentType) {
  return paymentType === "loan" ? "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³" : "ًں’µ ظ†ظ‚ط¯غŒ";
}

/* =========================================================
   ط´ط±ظˆط¹ طھظˆط±ظ‡ط§
========================================================= */

async function startTours(chatId) {
  await saveSession(chatId, "TOUR_CATEGORY", {});

  await sendMessage(
    chatId,
    "ًںڑŒ طھظˆط±ظ‡ط§غŒ ظ…ط´ظ‡ط¯\n\nظ†ظˆط¹ ط³ظپط± ظ…ظˆط±ط¯ظ†ط¸ط± ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:",
    tourMenu()
  );
}

async function startTourType(chatId, type) {
  await pushStep(chatId, "TOUR_DATE", {
    tourType: type
  });

  await sendMessage(
    chatId,
    `${TYPE_NAMES[type]}\n\nًں“… طھط§ط±غŒط® ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ°`,
    backKeyboard()
  );
}

async function startHotelOnly(chatId) {
  await pushStep(chatId, "TOUR_DATE", {
    tourType: "HOTEL"
  });

  await sendMessage(
    chatId,
    "ًںڈ¨ ظپظ‚ط· ظ‡طھظ„\n\nًں“… طھط§ط±غŒط® ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ°",
    backKeyboard()
  );
}

/* =========================================================
   ظ…ط±ط§ط­ظ„ ظپط±ظ…
========================================================= */

async function askTourReturnDate(chatId, data) {
  await pushStep(chatId, "TOUR_RETURN_DATE", data);
  await sendMessage(
    chatId,
    "ًں“… طھط§ط±غŒط® ط®ط±ظˆط¬ ط§ط² ظ…ط´ظ‡ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ³",
    backKeyboard()
  );
}

async function askTourNights(chatId, data) {
  await pushStep(chatId, "TOUR_NIGHTS", data);
  await sendMessage(
    chatId,
    "ًںŒ™ طھط¹ط¯ط§ط¯ ط´ط¨ ط§ظ‚ط§ظ…طھ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ظ„ط§ظ‹: غ³",
    backKeyboard()
  );
}

async function askCaravanCount(chatId, data) {
  await pushStep(chatId, "CARAVAN_COUNT", data);
  await sendMessage(
    chatId,
    "ًں‘¥ طھط¹ط¯ط§ط¯ ع©ظ„ ظ…ط³ط§ظپط±ط§ظ† ع©ط§ط±ظˆط§ظ† ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ظ„ط§ظ‹: غ±غ°غ°\n\nطھط¹ط¯ط§ط¯ ظ…ط­ط¯ظˆط¯غŒطھغŒ ظ†ط¯ط§ط±ط¯.",
    backKeyboard()
  );
}

async function askTourAdults(chatId, data) {
  await pushStep(chatId, "TOUR_ADULTS", data);
  await sendMessage(
    chatId,
    "ًں‘¨ طھط¹ط¯ط§ط¯ ط¨ط²ط±ع¯ط³ط§ظ„ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ظ„ط§ظ‹: غ²",
    backKeyboard()
  );
}

async function askTourChildren(chatId, data) {
  await pushStep(chatId, "TOUR_CHILDREN", data);
  await sendMessage(
    chatId,
    "ًں‘§ طھط¹ط¯ط§ط¯ ع©ظˆط¯ع© غ³ طھط§ غµ ط³ط§ظ„ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nط§ع¯ط± ع©ظˆط¯ع© ظ†ط¯ط§ط±غŒط¯ غ° ظˆط§ط±ط¯ ع©ظ†غŒط¯.",
    backKeyboard()
  );
}

async function askCaravanManager(chatId, data) {
  await pushStep(chatId, "CARAVAN_MANAGER", data);
  await sendMessage(
    chatId,
    "ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ† ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.",
    backKeyboard()
  );
}

async function askTourPayment(chatId, data) {
  await pushStep(chatId, "TOUR_PAYMENT", data);

  await sendMessage(
    chatId,
    "ًں’³ ظ†ظˆط¹ ظ¾ط±ط¯ط§ط®طھ ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:",
    {
      inline_keyboard: [
        [{ text: "ًں’µ ظ¾ط±ط¯ط§ط®طھ ظ†ظ‚ط¯غŒ", callback_data: "TOUR_PAYMENT_CASH" }],
        [{ text: "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³ ط´ظ‡ط± ط¨ظ‡ط´طھ", callback_data: "TOUR_PAYMENT_LOAN" }],
        [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK" }]
      ]
    }
  );
}

async function askTourName(chatId, data) {
  await pushStep(chatId, "TOUR_NAME", data);
  await sendMessage(chatId, "ًں‘¤ ظ„ط·ظپط§ظ‹ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…طھظ‚ط§ط¶غŒ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
}

async function askTourPhone(chatId, data) {
  await pushStep(chatId, "TOUR_PHONE", data);
  await sendMessage(chatId, "ًں“± ط´ظ…ط§ط±ظ‡ طھظ…ط§ط³ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ°غ¹غ±غ·غ·غ·غ°غ°غ¹غ¶غ±", backKeyboard());
}

async function askTourNationalCode(chatId, data) {
  await pushStep(chatId, "TOUR_NATIONAL_CODE", data);
  await sendMessage(chatId, "ًںھھ ع©ط¯ ظ…ظ„غŒ ظ…طھظ‚ط§ط¶غŒ ط§طµظ„غŒ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
}

/* =========================================================
   طھط£غŒغŒط¯ ظ†ظ‡ط§غŒغŒ
========================================================= */

async function showTourConfirmation(chatId, data) {
  const totalPeople = Number(data.adults || 0) + Number(data.children || 0);

  let text =
    "ًں“‹ ظ„ط·ظپط§ظ‹ ط§ط·ظ„ط§ط¹ط§طھ ط¯ط±ط®ظˆط§ط³طھ ط®ظˆط¯ ط±ط§ ط¨ط±ط±ط³غŒ ع©ظ†غŒط¯.\n\n" +
    `ًںڑچ ظ†ظˆط¹ ط³ظپط±: ${TYPE_NAMES[data.tourType] || data.tourType}\n` +
    `ًں“… ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯: ${ltrDate(data.departureDate)}\n` +
    `ًں“… ط®ط±ظˆط¬ ط§ط² ظ…ط´ظ‡ط¯: ${ltrDate(data.returnDate)}\n` +
    `ًںŒ™ طھط¹ط¯ط§ط¯ ط´ط¨ ط§ظ‚ط§ظ…طھ: ${toPersianDigits(data.nights)} ط´ط¨\n` +
    `ًں‘¨ ط¨ط²ط±ع¯ط³ط§ظ„: ${toPersianDigits(data.adults)} ظ†ظپط±\n` +
    `ًں‘§ ع©ظˆط¯ع© غ³ طھط§ غµ ط³ط§ظ„: ${toPersianDigits(data.children)} ظ†ظپط±\n` +
    `ًں‘¥ ظ…ط¬ظ…ظˆط¹ ظ…ط³ط§ظپط±ط§ظ†: ${toPersianDigits(totalPeople)} ظ†ظپط±\n`;

  if (data.tourType === "CARAVAN_BUS" || data.tourType === "CARAVAN_RAIL") {
    text += `ًں‘¤ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ†: ${data.caravanManager}\n`;
  }

  text +=
    `ًں’³ ظ†ظˆط¹ ظ¾ط±ط¯ط§ط®طھ: ${paymentName(data.paymentType)}\n` +
    `ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ: ${data.applicantName}\n` +
    `ًں“± ط´ظ…ط§ط±ظ‡ طھظ…ط§ط³: ${toPersianDigits(data.phone)}\n`;

  if (data.paymentType === "loan") {
    text += `ًںھھ ع©ط¯ ظ…ظ„غŒ: ${toPersianDigits(data.nationalCode)}\n`;
  }

  text += "\nط¢غŒط§ ط§ط·ظ„ط§ط¹ط§طھ طµط­غŒط­ ط§ط³طھطں";

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "âœ… ط§ط±ط³ط§ظ„ ط¯ط±ط®ظˆط§ط³طھ ط¨ط±ط§غŒ ظ…ط¯غŒط±", callback_data: "TOUR_SUBMIT" }],
      [{ text: "âœڈï¸ڈ ط§طµظ„ط§ط­ ط§ط·ظ„ط§ط¹ط§طھ", callback_data: "TOUR_EDIT" }],
      [{ text: "â‌Œ ظ„ط؛ظˆ ط¯ط±ط®ظˆط§ط³طھ", callback_data: "TOUR_CANCEL" }],
      [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK" }]
    ]
  });
}

/* =========================================================
   ظ¾ط±ط¯ط§ط²ط´ ظ…طھظ† ظپط±ظ…
========================================================= */

async function handleTourText(chatId, text, session) {
  const data = session.data || {};

  if (session.state === "TOUR_DATE") {
    const date = normalizeDate(text);
    if (!date) {
      await sendMessage(chatId, "â‌Œ طھط§ط±غŒط® ظ†ط§ظ…ط¹طھط¨ط± ط§ط³طھ.\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ°", backKeyboard());
      return true;
    }

    await askTourReturnDate(chatId, { ...data, departureDate: date });
    return true;
  }

  if (session.state === "TOUR_RETURN_DATE") {
    const date = normalizeDate(text);
    if (!date) {
      await sendMessage(chatId, "â‌Œ طھط§ط±غŒط® ظ†ط§ظ…ط¹طھط¨ط± ط§ط³طھ.\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ³", backKeyboard());
      return true;
    }

    await askTourNights(chatId, { ...data, returnDate: date });
    return true;
  }

  if (session.state === "TOUR_NIGHTS") {
    const nights = parseInteger(text);
    if (nights === null) {
      await sendMessage(chatId, "â‌Œ طھط¹ط¯ط§ط¯ ط´ط¨ ط§ظ‚ط§ظ…طھ ظ†ط§ظ…ط¹طھط¨ط± ط§ط³طھ.", backKeyboard());
      return true;
    }

    if (data.tourType === "CARAVAN_BUS" || data.tourType === "CARAVAN_RAIL") {
      await askCaravanCount(chatId, { ...data, nights });
    } else {
      await askTourAdults(chatId, { ...data, nights });
    }
    return true;
  }

  if (session.state === "TOUR_ADULTS") {
    const adults = parseInteger(text);
    if (adults === null) {
      await sendMessage(chatId, "â‌Œ طھط¹ط¯ط§ط¯ ط¨ط²ط±ع¯ط³ط§ظ„ ط¨ط§غŒط¯ ط­ط¯ط§ظ‚ظ„ غ± ظ†ظپط± ط¨ط§ط´ط¯.", backKeyboard());
      return true;
    }

    await askTourChildren(chatId, { ...data, adults });
    return true;
  }

  if (session.state === "CARAVAN_COUNT") {
    const passengerCount = parseInteger(text);
    if (passengerCount === null) {
      await sendMessage(chatId, "â‌Œ طھط¹ط¯ط§ط¯ ظ…ط³ط§ظپط±ط§ظ† ط¨ط§غŒط¯ ط­ط¯ط§ظ‚ظ„ غ± ظ†ظپط± ط¨ط§ط´ط¯.", backKeyboard());
      return true;
    }

    await askCaravanManager(chatId, {
      ...data,
      passengerCount,
      adults: passengerCount,
      children: 0
    });
    return true;
  }

  if (session.state === "TOUR_CHILDREN") {
    const children = parseInteger(text, true);
    if (children === null) {
      await sendMessage(chatId, "â‌Œ طھط¹ط¯ط§ط¯ ع©ظˆط¯ع© ظ†ط§ظ…ط¹طھط¨ط± ط§ط³طھ.", backKeyboard());
      return true;
    }

    const next = { ...data, children };

    if (next.tourType === "CARAVAN_BUS" || next.tourType === "CARAVAN_RAIL") {
      await askCaravanManager(chatId, next);
      return true;
    }

    await askTourPayment(chatId, next);
    return true;
  }

  if (session.state === "CARAVAN_MANAGER") {
    if (text.trim().length < 3) {
      await sendMessage(chatId, "â‌Œ ظ„ط·ظپط§ظ‹ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ† ط±ط§ ع©ط§ظ…ظ„ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return true;
    }

    await askTourPayment(chatId, {
      ...data,
      caravanManager: text.trim()
    });
    return true;
  }

  if (session.state === "TOUR_NAME") {
    if (text.trim().length < 3) {
      await sendMessage(chatId, "â‌Œ ظ„ط·ظپط§ظ‹ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ع©ط§ظ…ظ„ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return true;
    }

    await askTourPhone(chatId, {
      ...data,
      applicantName: text.trim()
    });
    return true;
  }

  if (session.state === "TOUR_PHONE") {
    const phone = normalizePhone(text);
    if (!phone) {
      await sendMessage(chatId, "â‌Œ ط´ظ…ط§ط±ظ‡ طھظ…ط§ط³ طµط­غŒط­ ظ†غŒط³طھ.\nظ…ط«ط§ظ„: غ°غ¹غ±غ·غ·غ·غ°غ°غ¹غ¶غ±", backKeyboard());
      return true;
    }

    if (data.paymentType === "loan") {
      await askTourNationalCode(chatId, { ...data, phone });
    } else {
      await showTourConfirmation(chatId, { ...data, phone });
    }
    return true;
  }

  if (session.state === "TOUR_NATIONAL_CODE") {
    const nationalCode = normalizeNationalCode(text);
    if (!nationalCode) {
      await sendMessage(chatId, "â‌Œ ع©ط¯ ظ…ظ„غŒ ط¨ط§غŒط¯ غ±غ° ط±ظ‚ظ… ط¨ط§ط´ط¯.", backKeyboard());
      return true;
    }

    await showTourConfirmation(chatId, {
      ...data,
      nationalCode
    });
    return true;
  }

  if (session.state === "PASSENGER_NAME") {
    const index = Number(data.passengerIndex || 1);
    const passengerList = Array.isArray(data.passengers) ? [...data.passengers] : [];

    if (text.trim().length < 3) {
      await sendMessage(chatId, `â‌Œ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط³ط§ظپط± ${toPersianDigits(index)} ط±ط§ ع©ط§ظ…ظ„ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`, backKeyboard());
      return true;
    }

    await pushStep(chatId, "PASSENGER_NATIONAL", {
      ...data,
      currentPassenger: {
        name: text.trim()
      },
      passengers: passengerList
    });

    await sendMessage(chatId, `ًںھھ ع©ط¯ ظ…ظ„غŒ ظ…ط³ط§ظپط± ${toPersianDigits(index)} ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`, backKeyboard());
    return true;
  }

  if (session.state === "PASSENGER_NATIONAL") {
    const code = normalizeNationalCode(text);
    if (!code) {
      await sendMessage(chatId, "â‌Œ ع©ط¯ ظ…ظ„غŒ ط¨ط§غŒط¯ غ±غ° ط±ظ‚ظ… ط¨ط§ط´ط¯.", backKeyboard());
      return true;
    }

    await pushStep(chatId, "PASSENGER_BIRTH", {
      ...data,
      currentPassenger: {
        ...(data.currentPassenger || {}),
        nationalCode: code
      }
    });

    await sendMessage(
      chatId,
      "ًںژ‚ طھط§ط±غŒط® طھظˆظ„ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظپط±ظ…طھ طµط­غŒط­ ظˆ ط§ط² ع†ظ¾ ط¨ظ‡ ط±ط§ط³طھ:\n\n\u200E1362/06/17\u200E",
      backKeyboard()
    );
    return true;
  }

  if (session.state === "PASSENGER_BIRTH") {
    const birthDate = normalizeBirthDate(text);
    if (!birthDate) {
      await sendMessage(
        chatId,
        "â‌Œ طھط§ط±غŒط® طھظˆظ„ط¯ ظ†ط§ظ…ط¹طھط¨ط± ط§ط³طھ.\nظپط±ظ…طھ طµط­غŒط­:\n\n\u200E1362/06/17\u200E",
        backKeyboard()
      );
      return true;
    }

    const passengers = Array.isArray(data.passengers) ? [...data.passengers] : [];
    passengers.push({
      ...(data.currentPassenger || {}),
      birthDate
    });

    const nextIndex = Number(data.passengerIndex || 1) + 1;
    const total = Number(data.passengerCount || 0);

    if (passengers.length >= total) {
      await submitManualPassengers(chatId, {
        ...data,
        passengers,
        currentPassenger: null,
        passengerIndex: nextIndex
      });
      return true;
    }

    await pushStep(chatId, "PASSENGER_NAME", {
      ...data,
      passengers,
      currentPassenger: null,
      passengerIndex: nextIndex
    });

    await sendMessage(
      chatId,
      `ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط³ط§ظپط± ${toPersianDigits(nextIndex)} ط§ط² ${toPersianDigits(total)} ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`,
      backKeyboard()
    );
    return true;
  }

  return false;
}

/* =========================================================
   ظ†ظ…ط§غŒط´ ط¯ظˆط¨ط§ط±ظ‡ ظ…ط±ط­ظ„ظ‡ ط¨ط±ط§غŒ ط¨ط±ع¯ط´طھ
========================================================= */

async function showStatePrompt(chatId, state, data) {
  switch (state) {
    case "MAIN":
      await sendMessage(chatId, "ًںڈ  طµظپط­ظ‡ ط§طµظ„غŒ", mainKeyboard());
      return;
    case "TOUR_CATEGORY":
      await sendMessage(chatId, "ًںڑŒ طھظˆط±ظ‡ط§غŒ ظ…ط´ظ‡ط¯\n\nظ†ظˆط¹ ط³ظپط± ظ…ظˆط±ط¯ظ†ط¸ط± ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:", tourMenu());
      return;
    case "TOUR_DATE":
      await sendMessage(chatId, `${TYPE_NAMES[data.tourType] || "طھظˆط±"}\n\nًں“… طھط§ط±غŒط® ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ°`, backKeyboard());
      return;
    case "TOUR_RETURN_DATE":
      await sendMessage(chatId, "ًں“… طھط§ط±غŒط® ط®ط±ظˆط¬ ط§ط² ظ…ط´ظ‡ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ±غ´غ°غµ/غ°غ·/غ±غ³", backKeyboard());
      return;
    case "TOUR_NIGHTS":
      await sendMessage(chatId, "ًںŒ™ طھط¹ط¯ط§ط¯ ط´ط¨ ط§ظ‚ط§ظ…طھ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "CARAVAN_COUNT":
      await sendMessage(chatId, "ًں‘¥ طھط¹ط¯ط§ط¯ ع©ظ„ ظ…ط³ط§ظپط±ط§ظ† ع©ط§ط±ظˆط§ظ† ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ظ„ط§ظ‹: غ±غ°غ°\n\nطھط¹ط¯ط§ط¯ ظ…ط­ط¯ظˆط¯غŒطھغŒ ظ†ط¯ط§ط±ط¯.", backKeyboard());
      return;
    case "TOUR_ADULTS":
      await sendMessage(chatId, "ًں‘¨ طھط¹ط¯ط§ط¯ ط¨ط²ط±ع¯ط³ط§ظ„ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "TOUR_CHILDREN":
      await sendMessage(chatId, "ًں‘§ طھط¹ط¯ط§ط¯ ع©ظˆط¯ع© غ³ طھط§ غµ ط³ط§ظ„ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nط§ع¯ط± ع©ظˆط¯ع© ظ†ط¯ط§ط±غŒط¯ غ° ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "CARAVAN_MANAGER":
      await sendMessage(chatId, "ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ† ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "TOUR_PAYMENT":
      await sendMessage(chatId, "ًں’³ ظ†ظˆط¹ ظ¾ط±ط¯ط§ط®طھ ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯:", {
        inline_keyboard: [
          [{ text: "ًں’µ ظ¾ط±ط¯ط§ط®طھ ظ†ظ‚ط¯غŒ", callback_data: "TOUR_PAYMENT_CASH" }],
          [{ text: "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³ ط´ظ‡ط± ط¨ظ‡ط´طھ", callback_data: "TOUR_PAYMENT_LOAN" }],
          [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK" }]
        ]
      });
      return;
    case "TOUR_NAME":
      await sendMessage(chatId, "ًں‘¤ ظ„ط·ظپط§ظ‹ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…طھظ‚ط§ط¶غŒ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "TOUR_PHONE":
      await sendMessage(chatId, "ًں“± ط´ظ…ط§ط±ظ‡ طھظ…ط§ط³ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظ…ط«ط§ظ„: غ°غ¹غ±غ·غ·غ·غ°غ°غ¹غ¶غ±", backKeyboard());
      return;
    case "TOUR_NATIONAL_CODE":
      await sendMessage(chatId, "ًںھھ ع©ط¯ ظ…ظ„غŒ ظ…طھظ‚ط§ط¶غŒ ط§طµظ„غŒ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
      return;
    case "PASSENGER_NAME":
      await sendMessage(chatId, `ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط³ط§ظپط± ${toPersianDigits(data.passengerIndex || 1)} ط§ط² ${toPersianDigits(data.passengerCount || 0)} ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`, backKeyboard());
      return;
    case "PASSENGER_NATIONAL":
      await sendMessage(chatId, `ًںھھ ع©ط¯ ظ…ظ„غŒ ظ…ط³ط§ظپط± ${toPersianDigits(data.passengerIndex || 1)} ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`, backKeyboard());
      return;
    case "PASSENGER_BIRTH":
      await sendMessage(chatId, "ًںژ‚ طھط§ط±غŒط® طھظˆظ„ط¯ ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.\n\nظپط±ظ…طھ طµط­غŒط­:\n\n\u200E1362/06/17\u200E", backKeyboard());
      return;
    default:
      await sendMessage(chatId, "ًںڈ  طµظپط­ظ‡ ط§طµظ„غŒ", mainKeyboard());
  }
}

/* =========================================================
   ط·ط±ط­ ط§ظ„ظ…ط§ط³
========================================================= */

function diamondPlanText() {
  return (
    "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³ ط´ظ‡ط± ط¨ظ‡ط´طھ\n\n" +
    "غ´غ° ط¯ط±طµط¯ ط¨ط§ طھظˆ / غ¶غ° ط¯ط±طµط¯ ط¨ط§ ظ…ط§\n\n" +
    "ًں“Œ ظ…ط±ط§ط­ظ„:\n" +
    "غ±ï¸ڈâƒ£ ظ†طµط¨ ط§ظ¾ظ„غŒع©غŒط´ظ† ع©غŒظˆط¨ط§ظ†ع© ظ…ظ‡ط±\n" +
    "غ²ï¸ڈâƒ£ طھع©ظ…غŒظ„ ط§ط­ط±ط§ط² ظ‡ظˆغŒطھ\n" +
    "غ³ï¸ڈâƒ£ ط§ظ†ط¬ط§ظ… ط§ط¹طھط¨ط§ط±ط³ظ†ط¬غŒ\n" +
    "غ´ï¸ڈâƒ£ ط¯ط±غŒط§ظپطھ ط±طھط¨ظ‡ ط§ط¹طھط¨ط§ط±غŒ\n\n" +
    "ًںں¢ ط±طھط¨ظ‡ A ظˆ B: ط¨ط¯ظˆظ† ط¶ط§ظ…ظ†ط› ط®ظˆط¯طھ ط¶ط§ظ…ظ† ط­ط³ط§ط¨طھ ظ‡ط³طھغŒ.\n\n" +
    "ًںں، ط±طھط¨ظ‡ C ظˆ D ظˆ ظ¾ط§غŒغŒظ†â€Œطھط±: غŒع© ط¶ط§ظ…ظ† + ظ†ط§ظ…ظ‡ ع©ط³ط± ط§ط² ط­ظ‚ظˆظ‚ + ظپغŒط´ ط­ظ‚ظˆظ‚غŒ\n\n" +
    "âڈ³ ط¨ط§ط²ظ¾ط±ط¯ط§ط®طھ: غ±غ² ظ…ط§ظ‡ظ‡\n" +
    "ًں’° ع©ط§ط±ظ…ط²ط¯/ط³ظˆط¯: غ³ ط¯ط±طµط¯\n" +
    "ًںڑ« ط¨ط¯ظˆظ† ظ…ط±ط§ط¬ط¹ظ‡ ط¨ظ‡ ط´ط¹ط¨ظ‡\n" +
    "ًں“„ ط§طµظ„ ظ…ط¯ط§ط±ع© ط¨ط§غŒط¯ ط¨ط§ط±ع¯ط°ط§ط±غŒ ط´ظˆط¯.\n\n" +
    "ظ¾ط³ ط§ط² ط¯ط±غŒط§ظپطھ ط±طھط¨ظ‡ ط§ط¹طھط¨ط§ط±غŒطŒ ع©ط¯ ظ…ظ„غŒ ظ…طھظ‚ط§ط¶غŒ ط§طµظ„غŒ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†غŒط¯.\n\n" +
    "ًں’³ ط¯ط± ط³ظپط± ط¨ط§ ط·ط±ط­ ط§ظ„ظ…ط§ط³طŒ ظ¾ط³ ط§ط² طھط£غŒغŒط¯ ط§ط·ظ„ط§ط¹ط§طھ ط­ط³ط§ط¨طŒ غ´غ°ظھ ظ‡ط²غŒظ†ظ‡ ع©ظ„ ط³ظپط± طھظˆط³ط· ظ…ط³ط§ظپط± ظ¾ط±ط¯ط§ط®طھ ظ…غŒâ€Œط´ظˆط¯.\n\n" +
    "ًں§¾ ظ¾ط³ ط§ط² ط§ط±ط³ط§ظ„ ظپغŒط´ ظˆ ط¨ط±ط±ط³غŒ ط¢ظ†طŒ ظ…ط±ط§ط­ظ„ ظپط¹ط§ظ„â€Œط³ط§ط²غŒ ط§ظ†ط¬ط§ظ… ظ…غŒâ€Œط´ظˆط¯.\n\n" +
    `ًں“‍ ظ¾ط´طھغŒط¨ط§ظ†غŒ: ${CONTACT_PHONE}`
  );
}

async function sendDiamondPlan(chatId) {
  await sendMessage(chatId, diamondPlanText(), {
    inline_keyboard: [
      [{ text: "ًں“² ظ†طµط¨ ع©غŒظˆط¨ط§ظ†ع© ظ…ظ‡ط±", url: "https://qbank24.ir/downloads" }],
      [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK_MAIN" }]
    ]
  });
}

/* =========================================================
   ط§ط·ظ„ط§ط¹ط§طھ ط­ط³ط§ط¨
========================================================= */

function cashAccountText() {
  return (
    "ًں’µ ط§ط·ظ„ط§ط¹ط§طھ ظˆط§ط±غŒط²\n\n" +
    "ًںڈ¦ ط¨ط§ظ†ع©: ظ…ظ‡ط± ط§غŒط±ط§ظ†\n" +
    "ًں‘¤ ط¨ظ‡ ظ†ط§ظ…: ظ…ظ‡ط¯غŒ ط±ط´غŒط¯غŒط§ظ† ط·ط±ظ‚غŒ\n\n" +
    "ًں’³ ط´ظ…ط§ط±ظ‡ ع©ط§ط±طھ:\n6063731161437174\n\n" +
    "ًںڈ¦ ط´ظ…ط§ط±ظ‡ ط­ط³ط§ط¨:\n363470014517217001\n\n" +
    "ًں”— ط´ظ…ط§ط±ظ‡ ط´ط¨ط§:\nIR160600363470014517217001\n\n" +
    "âڑ ï¸ڈ ظ¾ط³ ط§ط² ظˆط§ط±غŒط²طŒ طھطµظˆغŒط± ظپغŒط´ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†غŒط¯."
  );
}

function diamondPaymentText(request) {
  const total = Number(request.payload?.totalCost || 0);

  if (total > 0) {
    const forty = Math.ceil(total * 0.4);
    return (
      "ًں’ژ ط¯ط±ط®ظˆط§ط³طھ ط·ط±ط­ ط§ظ„ظ…ط§ط³ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
      `ًں†” ط¯ط±ط®ظˆط§ط³طھ: ${request.request_code}\n` +
      `ًں’° ظ‡ط²غŒظ†ظ‡ ع©ظ„: ${toPersianDigits(total)} طھظˆظ…ط§ظ†\n` +
      `ًں’³ ط³ظ‡ظ… ظ…ط³ط§ظپط± غ´غ°ظھ: ${toPersianDigits(forty)} طھظˆظ…ط§ظ†\n\n` +
      "ظ„ط·ظپط§ظ‹ غ´غ°ظھ ط±ط§ ظ¾ط±ط¯ط§ط®طھ ظˆ طھطµظˆغŒط± ظپغŒط´ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†غŒط¯."
    );
  }

  return (
    "ًں’ژ ط¯ط±ط®ظˆط§ط³طھ ط·ط±ط­ ط§ظ„ظ…ط§ط³ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
    `ًں†” ط¯ط±ط®ظˆط§ط³طھ: ${request.request_code}\n\n` +
    "ظ¾ط³ ط§ط² طھع©ظ…غŒظ„ ظ…ط±ط§ط­ظ„ ط·ط±ط­ ظˆ طھط£غŒغŒط¯ ط§ط·ظ„ط§ط¹ط§طھ ط­ط³ط§ط¨طŒ غ´غ°ظھ ظ‡ط²غŒظ†ظ‡ ع©ظ„ ط³ظپط± ظ¾ط±ط¯ط§ط®طھ ظ…غŒâ€Œط´ظˆط¯.\n\n" +
    "ًں§¾ طھطµظˆغŒط± ظپغŒط´ ظˆط§ط±غŒط²غŒ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†غŒط¯."
  );
}

/* =========================================================
   ط«ط¨طھ ط¯ط±ط®ظˆط§ط³طھ ط¯ط± ط¯غŒطھط§ط¨غŒط³ ظˆ ع¯ط±ظˆظ‡
========================================================= */

function makeRequestCode() {
  return "SMT-" + Math.floor(1000 + Math.random() * 9000);
}

async function submitTourRequest(chatId) {
  const session = await getSession(chatId);

  if (!session) {
    await sendMessage(chatId, "â‌Œ ط§ط·ظ„ط§ط¹ط§طھ ط¯ط±ط®ظˆط§ط³طھ ظ¾غŒط¯ط§ ظ†ط´ط¯. ظ„ط·ظپط§ظ‹ ط¯ظˆط¨ط§ط±ظ‡ ط´ط±ظˆط¹ ع©ظ†غŒط¯.", mainKeyboard());
    return;
  }

  const data = session.data || {};
  const requestCode = makeRequestCode();
  const username = data.messageInfo?.username || "ظ†ط¯ط§ط±ط¯";
  const firstName = data.messageInfo?.firstName || "ع©ط§ط±ط¨ط±";

  const payload = {
    tourType: data.tourType,
    departureDate: data.departureDate,
    returnDate: data.returnDate,
    nights: Number(data.nights || 0),
    adults: Number(data.adults || 0),
    children: Number(data.children || 0),
    passengerCount: Number(data.adults || 0) + Number(data.children || 0),
    caravanManager: data.caravanManager || "",
    paymentType: data.paymentType,
    applicantName: data.applicantName,
    phone: data.phone,
    nationalCode: data.nationalCode || "",
    totalCost: data.totalCost || null
  };

  await pool.query(
    `
    INSERT INTO requests
    (request_code,user_id,chat_id,username,applicant_name,phone,bale_id,request_type,payment_type,payload,status)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `,
    [
      requestCode,
      String(chatId),
      String(chatId),
      username,
      payload.applicantName,
      payload.phone,
      String(chatId),
      payload.tourType,
      payload.paymentType,
      JSON.stringify(payload),
      "pending"
    ]
  );

  const totalPeople = payload.passengerCount;

  let adminText =
    "ًں“‹ ط¯ط±ط®ظˆط§ط³طھ ط¬ط¯غŒط¯ ط³ظپط±\n\n" +
    `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}\n\n` +
    `ًںڑچ ظ†ظˆط¹ ط³ظپط±: ${TYPE_NAMES[payload.tourType] || payload.tourType}\n` +
    `ًں“… ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯: ${ltrDate(payload.departureDate)}\n` +
    `ًں“… ط®ط±ظˆط¬ ط§ط² ظ…ط´ظ‡ط¯: ${ltrDate(payload.returnDate)}\n` +
    `ًںŒ™ طھط¹ط¯ط§ط¯ ط´ط¨ ط§ظ‚ط§ظ…طھ: ${toPersianDigits(payload.nights)} ط´ط¨\n` +
    `ًں‘¨ ط¨ط²ط±ع¯ط³ط§ظ„: ${toPersianDigits(payload.adults)} ظ†ظپط±\n` +
    `ًں‘§ ع©ظˆط¯ع© غ³ طھط§ غµ ط³ط§ظ„: ${toPersianDigits(payload.children)} ظ†ظپط±\n` +
    `ًں‘¥ ظ…ط¬ظ…ظˆط¹ ظ…ط³ط§ظپط±ط§ظ†: ${toPersianDigits(totalPeople)} ظ†ظپط±\n`;

  if (payload.tourType === "CARAVAN_BUS" || payload.tourType === "CARAVAN_RAIL") {
    adminText += `ًں‘¤ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ†: ${payload.caravanManager}\n`;
  }

  adminText +=
    `ًں’³ ظ¾ط±ط¯ط§ط®طھ: ${paymentName(payload.paymentType)}\n` +
    `ًں‘¤ ظ…طھظ‚ط§ط¶غŒ: ${payload.applicantName}\n` +
    `ًں“± طھظ…ط§ط³: ${toPersianDigits(payload.phone)}\n` +
    (payload.paymentType === "loan" ? `ًںھھ ع©ط¯ ظ…ظ„غŒ: ${toPersianDigits(payload.nationalCode)}\n` : "") +
    `\nًں‘¤ ع©ط§ط±ط¨ط± ط¨ظ„ظ‡: ${username}\n` +
    `ًں†” Bale ID: ${chatId}`;

  if (!ADMIN_CHAT_ID) {
    throw new Error("ADMIN_CHAT_ID ط¯ط± Environment Variables طھظ†ط¸غŒظ… ظ†ط´ط¯ظ‡ ط§ط³طھ.");
  }

  await sendMessage(ADMIN_CHAT_ID, adminText, {
    inline_keyboard: [
      [
        { text: "âœ… طھط£غŒغŒط¯ ط¯ط±ط®ظˆط§ط³طھ", callback_data: `APPROVE_REQUEST:${requestCode}` },
        { text: "â‌Œ ط±ط¯ ط¯ط±ط®ظˆط§ط³طھ", callback_data: `REJECT_REQUEST:${requestCode}` }
      ]
    ]
  });

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "âœ… ط¯ط±ط®ظˆط§ط³طھ ط´ظ…ط§ ط¨ط§ ظ…ظˆظپظ‚غŒطھ ط¨ط±ط§غŒ ظ…ط¯غŒط± ط§ط±ط³ط§ظ„ ط´ط¯.\n\n" +
    `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}\n\n` +
    "ظ¾ط³ ط§ط² ط¨ط±ط±ط³غŒطŒ ظ†طھغŒط¬ظ‡ ط¨ظ‡ ط´ظ…ط§ ط§ط·ظ„ط§ط¹ ط¯ط§ط¯ظ‡ ظ…غŒâ€Œط´ظˆط¯.",
    mainKeyboard()
  );
}

/* =========================================================
   ظ¾ط³ ط§ط² طھط£غŒغŒط¯ ظ…ط¯غŒط±
========================================================= */

async function approveRequest(adminChatId, code) {
  if (!isAdmin(adminChatId)) return;

  const result = await pool.query(
    `SELECT * FROM requests WHERE request_code = $1`,
    [code]
  );

  if (!result.rows.length) {
    await sendMessage(adminChatId, "â‌Œ ط¯ط±ط®ظˆط§ط³طھ ظ¾غŒط¯ط§ ظ†ط´ط¯.");
    return;
  }

  const request = result.rows[0];
  const payload = request.payload || {};

  await pool.query(
    `UPDATE requests SET status='approved', updated_at=NOW() WHERE request_code=$1`,
    [code]
  );

  await sendMessage(adminChatId, `âœ… ط¯ط±ط®ظˆط§ط³طھ ${code} طھط£غŒغŒط¯ ط´ط¯.`);

  // ظپظ‚ط· ظ‡طھظ„: ظ‡غŒع† ظ„غŒط³طھ ظ‡ظ…ط±ط§ظ‡ط§ظ†غŒ ط¯ط±ط®ظˆط§ط³طھ ظ†ظ…غŒâ€Œط´ظˆط¯.
  if (payload.tourType === "HOTEL") {
    if (request.payment_type === "cash") {
      await sendMessage(
        request.user_id,
        "âœ… ط±ط²ط±ظˆ ظپظ‚ط· ظ‡طھظ„ ط´ظ…ط§ طھط£غŒغŒط¯ ظˆ ط«ط¨طھ ظ‚ط·ط¹غŒ ط´ط¯.\n\n" +
        cashAccountText() +
        `\n\nًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${code}`
      );
    } else {
      await sendMessage(
        request.user_id,
        "âœ… ط¯ط±ط®ظˆط§ط³طھ ظپظ‚ط· ظ‡طھظ„ ط´ظ…ط§ طھط£غŒغŒط¯ ظˆ ط«ط¨طھ ظ‚ط·ط¹غŒ ط´ط¯.\n\n" +
        diamondPaymentText(request),
        {
          inline_keyboard: [
            [{ text: "ًں“² ظ†طµط¨ ع©غŒظˆط¨ط§ظ†ع© ظ…ظ‡ط±", url: "https://qbank24.ir/downloads" }]
          ]
        }
      );
    }
    return;
  }

  // ع©ط§ط±ظˆط§ظ†â€Œظ‡ط§ ظ‡ظ…غŒط´ظ‡ ظپط§غŒظ„ ظ„غŒط³طھ ظ…غŒâ€Œع¯غŒط±ظ†ط¯.
  if (payload.tourType === "CARAVAN_BUS" || payload.tourType === "CARAVAN_RAIL") {
    await askPassengerFile(
      request.user_id,
      code,
      payload.tourType,
      payload.caravanManager || "ط«ط¨طھ ظ†ط´ط¯ظ‡"
    );
  } else {
    // طھظˆط±ظ‡ط§غŒ ط¹ط§ط¯غŒ: طھط§ غ±غ° ظ†ظپط± ظˆط±ظˆط¯ ط¯ط³طھغŒط› ط¨غŒط´طھط± ط§ط² ط¢ظ† ظپط§غŒظ„.
    const total = Number(payload.adults || 0) + Number(payload.children || 0);

    if (total <= MANUAL_PASSENGER_LIMIT) {
      await askManualPassengerList(request.user_id, code, total, payload.tourType);
    } else {
      await askPassengerFile(request.user_id, code, payload.tourType, "");
    }
  }

  if (request.payment_type === "cash") {
    await sendMessage(
      request.user_id,
      "ًں’µ ط¯ط±ط®ظˆط§ط³طھ ط³ظپط± ط´ظ…ط§ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
      cashAccountText() +
      `\n\nًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${code}`
    );
  }

  if (request.payment_type === "loan") {
    await sendMessage(
      request.user_id,
      diamondPaymentText(request) +
      "\n\nًں“Œ ظ…ط±ط§ط­ظ„ ط·ط±ط­ ط§ظ„ظ…ط§ط³:\n" +
      "غ±ï¸ڈâƒ£ ظ†طµط¨ ع©غŒظˆط¨ط§ظ†ع© ظ…ظ‡ط±\n" +
      "غ²ï¸ڈâƒ£ ط§ط­ط±ط§ط² ظ‡ظˆغŒطھ\n" +
      "غ³ï¸ڈâƒ£ ط§ط¹طھط¨ط§ط±ط³ظ†ط¬غŒ\n" +
      "غ´ï¸ڈâƒ£ ط¯ط±غŒط§ظپطھ ط±طھط¨ظ‡ ط§ط¹طھط¨ط§ط±غŒ\n\n" +
      "ًںں¢ ط±طھط¨ظ‡ A ظˆ B: ط¨ط¯ظˆظ† ط¶ط§ظ…ظ†\n" +
      "ًںں، ط±طھط¨ظ‡ C ظˆ D ظˆ ظ¾ط§غŒغŒظ†â€Œطھط±: غŒع© ط¶ط§ظ…ظ† + ظ†ط§ظ…ظ‡ ع©ط³ط± ط§ط² ط­ظ‚ظˆظ‚ + ظپغŒط´ ط­ظ‚ظˆظ‚غŒ\n\n" +
      "ًں“„ ط§طµظ„ ظ…ط¯ط§ط±ع© ط¨ط§غŒط¯ ط¨ط§ط±ع¯ط°ط§ط±غŒ ط´ظˆط¯.",
      {
        inline_keyboard: [
          [{ text: "ًں“² ظ†طµط¨ ع©غŒظˆط¨ط§ظ†ع© ظ…ظ‡ط±", url: "https://qbank24.ir/downloads" }]
        ]
      }
    );
  }
}

/* =========================================================
   ظپط§غŒظ„ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ†
========================================================= */

async function askPassengerFile(chatId, requestCode, tourType, caravanManager) {
  await saveSession(chatId, "WAITING_PASSENGER_FILE", {
    requestCode,
    tourType,
    caravanManager: caravanManager || ""
  });

  if (tourType === "CARAVAN_BUS" || tourType === "CARAVAN_RAIL") {
    await sendMessage(
      chatId,
      "ًں“‹ ط¯ط±ط®ظˆط§ط³طھ ط´ظ…ط§ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
      "ظ„ط·ظپط§ظ‹ ظپط§غŒظ„ ظ„غŒط³طھ ع©ط§ظ…ظ„ ظ…ط³ط§ظپط±ط§ظ† ط±ط§ ط¨ط§ط±ع¯ط°ط§ط±غŒ ع©ظ†غŒط¯.\n\n" +
      "ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ\n" +
      "ًںھھ ع©ط¯ ظ…ظ„غŒ\n" +
      "ًںژ‚ طھط§ط±غŒط® طھظˆظ„ط¯\n\n" +
      "ظپط±ظ…طھ طھط§ط±غŒط® طھظˆظ„ط¯:\n\n\u200E1362/06/17\u200E\n\n" +
      `ًں‘¤ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ†: ${caravanManager || "ط«ط¨طھ ظ†ط´ط¯ظ‡"}\n` +
      `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}`,
      backKeyboard()
    );
  } else {
    await sendMessage(
      chatId,
      "ًں“‹ ط¯ط±ط®ظˆط§ط³طھ ط´ظ…ط§ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
      "طھط¹ط¯ط§ط¯ ظ…ط³ط§ظپط±ط§ظ† ط¨غŒط´طھط± ط§ط² غ±غ° ظ†ظپط± ط§ط³طھط› ظ„ط·ظپط§ظ‹ ظپط§غŒظ„ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ† ط±ط§ ط¨ط§ط±ع¯ط°ط§ط±غŒ ع©ظ†غŒط¯.\n\n" +
      "ظ…ط´ط®طµط§طھ ظ‡ط± ظ…ط³ط§ظپط±:\n" +
      "ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ\n" +
      "ًںھھ ع©ط¯ ظ…ظ„غŒ\n" +
      "ًںژ‚ طھط§ط±غŒط® طھظˆظ„ط¯\n\n" +
      "ظپط±ظ…طھ طھط§ط±غŒط® طھظˆظ„ط¯:\n\n\u200E1362/06/17\u200E\n\n" +
      `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}`,
      backKeyboard()
    );
  }
}

async function forwardPassengerDocument(message, session) {
  if (!message.document) return false;

  const requestCode = session.data.requestCode;
  const tourType = session.data.tourType;
  const manager = session.data.caravanManager || "";

  let caption =
    "ًں“‹ ظپط§غŒظ„ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ†\n\n" +
    `ًں†” ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}\n` +
    `ًںڑچ ظ†ظˆط¹: ${TYPE_NAMES[tourType] || tourType}\n`;

  if (manager) caption += `ًں‘¤ ظ…ط¯غŒط± ع©ط§ط±ظˆط§ظ†: ${manager}\n`;

  caption +=
    `ًں‘¤ ع©ط§ط±ط¨ط±: ${getFirstName(message)}\n` +
    `ًں”¹ ${getUsername(message) || "ط¨ط¯ظˆظ† ظ†ط§ظ… ع©ط§ط±ط¨ط±غŒ"}\n` +
    `ًں†” Bale ID: ${getUserId(message)}`;

  try {
    await baleRequest("sendDocument", {
      chat_id: ADMIN_CHAT_ID,
      document: message.document.file_id,
      caption
    });

    await pool.query(
      `UPDATE requests SET status='passenger_file_received', updated_at=NOW() WHERE request_code=$1`,
      [requestCode]
    );

    await clearSession(getChatId(message));

    await sendMessage(
      getChatId(message),
      "âœ… ظپط§غŒظ„ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ† ط¨ط§ ظ…ظˆظپظ‚غŒطھ ط¨ط±ط§غŒ ظ…ط¯غŒط± ط§ط±ط³ط§ظ„ ط´ط¯.\n\n" +
      `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${requestCode}`,
      mainKeyboard()
    );

    return true;
  } catch (error) {
    console.error("â‌Œ Send passenger file error:", error);
    await sendMessage(getChatId(message), "â‌Œ ط§ط±ط³ط§ظ„ ظپط§غŒظ„ ط§ظ†ط¬ط§ظ… ظ†ط´ط¯.\nظ„ط·ظپط§ظ‹ ط¯ظˆط¨ط§ط±ظ‡ ظپط§غŒظ„ ط±ط§ ط§ط±ط³ط§ظ„ ع©ظ†غŒط¯.", backKeyboard());
    return true;
  }
}

/* =========================================================
   ظ„غŒط³طھ ط¯ط³طھغŒ ط¨ط±ط§غŒ ط­ط¯ط§ع©ط«ط± غ±غ° ظ†ظپط±
========================================================= */

async function askManualPassengerList(chatId, requestCode, count, tourType) {
  await saveSession(chatId, "WAITING_PASSENGER_BUTTON", {
    requestCode,
    tourType,
    passengerCount: Number(count)
  });

  await sendMessage(
    chatId,
    "ًں“‹ ط¯ط±ط®ظˆط§ط³طھ ط´ظ…ط§ طھط£غŒغŒط¯ ط´ط¯.\n\n" +
    `طھط¹ط¯ط§ط¯ ظ…ط³ط§ظپط±ط§ظ†: ${toPersianDigits(count)} ظ†ظپط±\n\n` +
    "ع©ظ„غŒط¯ آ«ظ„غŒط³طھ ظ‡ظ…ط±ط§ظ‡ط§ظ†آ» ط±ط§ ط¨ط²ظ†غŒط¯ طھط§ ظ…ط´ط®طµط§طھ ظ…ط³ط§ظپط±ط§ظ† ط¨ظ‡ طھط±طھغŒط¨ ط¯ط±غŒط§ظپطھ ط´ظˆط¯.\n" +
    "طھط¹ط¯ط§ط¯ ط§ط·ظ„ط§ط¹ط§طھ ظ‚ط§ط¨ظ„ ط«ط¨طھ ط¯ظ‚غŒظ‚ط§ظ‹ ط¨ط±ط§ط¨ط± ط¨ط§ طھط¹ط¯ط§ط¯ ظ…ط³ط§ظپط±ط§ظ† ط§ط³طھ ظˆ ظ†ظپط± ط§ط¶ط§ظپظ‡ ظ¾ط°غŒط±ظپطھظ‡ ظ†ظ…غŒâ€Œط´ظˆط¯.",
    {
      inline_keyboard: [
        [{ text: "ًں“‹ ظ„غŒط³طھ ظ‡ظ…ط±ط§ظ‡ط§ظ†", callback_data: "PASSENGER_START" }],
        [{ text: "ًں”™ ط¨ط§ط²ع¯ط´طھ", callback_data: "BACK_MAIN" }]
      ]
    }
  );
}

async function startManualPassengerEntry(chatId, session) {
  await saveSession(chatId, "PASSENGER_NAME", {
    ...(session.data || {}),
    passengerIndex: 1,
    passengers: [],
    currentPassenger: null,
    history: []
  });

  await sendMessage(
    chatId,
    `ًں‘¤ ظ†ط§ظ… ظˆ ظ†ط§ظ… ط®ط§ظ†ظˆط§ط¯ع¯غŒ ظ…ط³ط§ظپط± غ± ط§ط² ${toPersianDigits(session.data.passengerCount)} ط±ط§ ظˆط§ط±ط¯ ع©ظ†غŒط¯.`,
    backKeyboard()
  );
}

async function submitManualPassengers(chatId, data) {
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];

  if (passengers.length !== Number(data.passengerCount)) {
    await sendMessage(chatId, "â‌Œ طھط¹ط¯ط§ط¯ ظ…ط´ط®طµط§طھ ط¨ط§ طھط¹ط¯ط§ط¯ ظ…ط³ط§ظپط±ط§ظ† ط¨ط±ط§ط¨ط± ظ†غŒط³طھ.", backKeyboard());
    return;
  }

  const lines = passengers.map((p, i) =>
    `${toPersianDigits(i + 1)}. ${p.name}\n` +
    `   ًںھھ ${toPersianDigits(p.nationalCode)}\n` +
    `   ًںژ‚ ${ltrDate(p.birthDate)}`
  );

  const text =
    "ًں“‹ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ† ط¯ط±ط®ظˆط§ط³طھ\n\n" +
    `ًں†” ط¯ط±ط®ظˆط§ط³طھ: ${data.requestCode}\n` +
    `ًںڑچ ظ†ظˆط¹ ط³ظپط±: ${TYPE_NAMES[data.tourType] || data.tourType}\n\n` +
    lines.join("\n\n");

  await sendMessage(ADMIN_CHAT_ID, text);

  await pool.query(
    `UPDATE requests SET status='passenger_list_received', updated_at=NOW() WHERE request_code=$1`,
    [data.requestCode]
  );

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "âœ… ط§ط·ظ„ط§ط¹ط§طھ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ† ط¨ط§ ظ…ظˆظپظ‚غŒطھ ط¨ط±ط§غŒ ظ…ط¯غŒط± ط§ط±ط³ط§ظ„ ط´ط¯.\n\n" +
    `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${data.requestCode}`,
    mainKeyboard()
  );
}

/* =========================================================
   Callback ظ‡ط§غŒ ظپط±ظ…
========================================================= */

async function handleCallback(callback) {
  const data = callback?.data || "";
  const message = callback?.message;
  const chatId = message?.chat?.id;

  if (!chatId) return;

  await answerCallback(callback.id);

  if (data === "BACK_MAIN") {
    await clearSession(chatId);
    await sendMessage(chatId, "ًںڈ  طµظپط­ظ‡ ط§طµظ„غŒ", mainKeyboard());
    return;
  }

  if (data === "BACK") {
    await goBack(chatId);
    return;
  }

  if (data === "TOUR_AIR") {
    await startTourType(chatId, "AIR");
    return;
  }

  if (data === "TOUR_RAIL") {
    await startTourType(chatId, "RAIL");
    return;
  }

  if (data === "TOUR_BUS") {
    await startTourType(chatId, "BUS");
    return;
  }

  if (data === "TOUR_CARAVAN_BUS") {
    await startTourType(chatId, "CARAVAN_BUS");
    return;
  }

  if (data === "TOUR_CARAVAN_RAIL") {
    await startTourType(chatId, "CARAVAN_RAIL");
    return;
  }

  if (data === "TOUR_HOTEL") {
    await startHotelOnly(chatId);
    return;
  }

  if (data === "TOUR_PAYMENT_CASH" || data === "TOUR_PAYMENT_LOAN") {
    const session = await getSession(chatId);
    if (!session) return;

    const paymentType = data === "TOUR_PAYMENT_LOAN" ? "loan" : "cash";

    await askTourName(chatId, {
      ...(session.data || {}),
      paymentType
    });
    return;
  }

  if (data === "TOUR_SUBMIT") {
    await submitTourRequest(chatId);
    return;
  }

  if (data === "TOUR_EDIT") {
    const session = await getSession(chatId);
    if (!session) return;

    await saveSession(chatId, "TOUR_DATE", {
      ...(session.data || {}),
      history: []
    });

    await sendMessage(chatId, "ًں“… طھط§ط±غŒط® ظˆط±ظˆط¯ ط¨ظ‡ ظ…ط´ظ‡ط¯ ط±ط§ ط¯ظˆط¨ط§ط±ظ‡ ظˆط§ط±ط¯ ع©ظ†غŒط¯.", backKeyboard());
    return;
  }

  if (data === "TOUR_CANCEL") {
    await clearSession(chatId);
    await sendMessage(chatId, "â‌Œ ط¯ط±ط®ظˆط§ط³طھ ظ„ط؛ظˆ ط´ط¯.", mainKeyboard());
    return;
  }

  if (data === "PASSENGER_START") {
    const session = await getSession(chatId);
    if (!session) return;

    await startManualPassengerEntry(chatId, session);
    return;
  }

  if (data.startsWith("APPROVE_REQUEST:")) {
    await approveRequest(chatId, data.split(":")[1]);
    return;
  }

  if (data.startsWith("REJECT_REQUEST:")) {
    if (!isAdmin(chatId)) return;

    const code = data.split(":")[1];
    const result = await pool.query(`SELECT * FROM requests WHERE request_code=$1`, [code]);

    if (!result.rows.length) {
      await sendMessage(chatId, "â‌Œ ط¯ط±ط®ظˆط§ط³طھ ظ¾غŒط¯ط§ ظ†ط´ط¯.");
      return;
    }

    await pool.query(
      `UPDATE requests SET status='rejected', updated_at=NOW() WHERE request_code=$1`,
      [code]
    );

    await sendMessage(chatId, `â‌Œ ط¯ط±ط®ظˆط§ط³طھ ${code} ط±ط¯ ط´ط¯.`);
    await sendMessage(
      result.rows[0].user_id,
      "â‌Œ ط¯ط±ط®ظˆط§ط³طھ ط´ظ…ط§ طھظˆط³ط· ظ…ط¯غŒط± طھط£غŒغŒط¯ ظ†ط´ط¯.\n\n" +
      `ًں†” ط´ظ…ط§ط±ظ‡ ط¯ط±ط®ظˆط§ط³طھ: ${code}\n\nâکژï¸ڈ ${CONTACT_PHONE}`,
      mainKeyboard()
    );
    return;
  }
}

/* =========================================================
   ظ¾غŒط§ظ…â€Œظ‡ط§غŒ ظ…طھظ†غŒ
========================================================= */

async function handleMessage(message) {
  const chatId = getChatId(message);
  if (!chatId) return;

  const session = await getSession(chatId);

  // ظپط§غŒظ„ ظ„غŒط³طھ ظ…ط³ط§ظپط±ط§ظ†
  if (message.document && session?.state === "WAITING_PASSENGER_FILE") {
    await forwardPassengerDocument(message, session);
    return;
  }

  const text = String(message.text || "").trim();

  if (text === "/start") {
    await clearSession(chatId);
    await saveSession(chatId, "MAIN", {});
    await sendMessage(
      chatId,
      "ًںŒ¹ ط¨ظ‡ ط±ط¨ط§طھ ط³ظپط± ظ…ط´ظ‡ط¯ طھظˆط³ ط®ظˆط´ ط¢ظ…ط¯غŒط¯.\n\nط¨ط±ط§غŒ ط¯ط±غŒط§ظپطھ ط®ط¯ظ…ط§طھ ع¯ط±ط¯ط´ع¯ط±غŒ ع¯ط²غŒظ†ظ‡ ظ…ظˆط±ط¯ظ†ط¸ط± ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯.",
      mainKeyboard()
    );
    return;
  }

  if (text === "ًںڑŒ طھظˆط±ظ‡ط§غŒ ظ…ط´ظ‡ط¯") {
    await startTours(chatId);
    return;
  }

  if (text === "ًںڈ¨ ط±ط²ط±ظˆ ظ‡طھظ„") {
    await sendMessage(chatId, "ًںڈ¨ ط±ط²ط±ظˆ ظ‡طھظ„ ط§ط² ط§غŒظ† ط¨ط®ط´ ظپط¹ظ„ط§ظ‹ ط؛غŒط±ظپط¹ط§ظ„ ط§ط³طھ.\n\nط¨ط±ط§غŒ ط±ط²ط±ظˆ ظپظ‚ط· ظ‡طھظ„طŒ ط§ط² ظ…ط³غŒط± آ«ًںڑŒ طھظˆط±ظ‡ط§غŒ ظ…ط´ظ‡ط¯آ» ع¯ط²غŒظ†ظ‡ آ«ًںڈ¨ ظپظ‚ط· ظ‡طھظ„آ» ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯.", mainKeyboard());
    return;
  }

  if (text === "ًں’ژ ط·ط±ط­ ط§ظ„ظ…ط§ط³ ط´ظ‡ط± ط¨ظ‡ط´طھ") {
    await sendDiamondPlan(chatId);
    return;
  }

  if (text === "ًں§³ ط®ط¯ظ…ط§طھ ع¯ط±ط¯ط´ع¯ط±غŒ") {
    await sendMessage(
      chatId,
      "ًں§³ ط®ط¯ظ…ط§طھ ع¯ط±ط¯ط´ع¯ط±غŒ\n\n" +
      "âœˆï¸ڈ طھظˆط±ظ‡ط§غŒ ظ‡ظˆط§غŒغŒ\n" +
      "ًںڑ† طھظˆط±ظ‡ط§غŒ ط±غŒظ„غŒ\n" +
      "ًںڑŒ طھظˆط±ظ‡ط§غŒ ط§طھظˆط¨ظˆط³غŒ\n" +
      "ًںڑچ ع©ط§ط±ظˆط§ظ†â€Œظ‡ط§غŒ ط²غŒط§ط±طھغŒ\n" +
      "ًںڈ¨ ظپظ‚ط· ظ‡طھظ„\n\n" +
      `âکژï¸ڈ ${CONTACT_PHONE}`,
      mainKeyboard()
    );
    return;
  }

  if (text === "ًں“‍ طھظ…ط§ط³ ط¨ط§ ظ…ط§") {
    await sendMessage(
      chatId,
      "ًں“‍ طھظ…ط§ط³ ط¨ط§ ظ…ط§\n\n" +
      `ًں‘¤ ${ADMIN_NAME}\n` +
      `âکژï¸ڈ ${CONTACT_PHONE}\n` +
      `${WEBSITE_URL}`,
      mainKeyboard()
    );
    return;
  }

  if (text === "ًں“¢ ع©ط§ظ†ط§ظ„") {
    await sendMessage(chatId, `ًں“¢ ع©ط§ظ†ط§ظ„ ط³ظپط± ظ…ط´ظ‡ط¯ طھظˆط³\n\n${CHANNEL_URL}`, mainKeyboard());
    return;
  }

  if (session) {
    const handled = await handleTourText(chatId, text, session);
    if (handled) return;
  }

  await sendMessage(chatId, "ظ„ط·ظپط§ظ‹ غŒع©غŒ ط§ط² ع¯ط²غŒظ†ظ‡â€Œظ‡ط§غŒ ظ…ظ†ظˆ ط±ط§ ط§ظ†طھط®ط§ط¨ ع©ظ†غŒط¯.", mainKeyboard());
}

/* =========================================================
   WEBHOOK
========================================================= */

app.post("/webhook", async (req, res) => {
  res.sendStatus(200);

  try {
    const update = req.body || {};

    if (update.message) {
      await handleMessage(update.message);
    }

    if (update.callback_query) {
      await handleCallback(update.callback_query);
    }
  } catch (error) {
    console.error("â‌Œ Webhook error:", error);
  }
});

app.get("/", (req, res) => {
  res.send("Safar Mashhad Toos Bot is running âœ…");
});

/* =========================================================
   START
========================================================= */

async function startServer() {
  try {
    await initDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`ًںڑ€ Server running on port ${PORT}`);
      console.log(`ًں‘¤ ADMIN_CHAT_ID: ${ADMIN_CHAT_ID || "undefined"}`);
      console.log(`ًں”‘ BOT_TOKEN: ${BOT_TOKEN ? "configured" : "undefined"}`);
    });
  } catch (error) {
    console.error("â‌Œ Startup error:", error);
    process.exit(1);
  }
}

startServer();
