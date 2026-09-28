require("dotenv").config();

const express = require("express");
const { Pool } = require("pg");

const app = express();
app.use(express.json({ limit: "20mb" }));

/* =========================================================
   تنظیمات
========================================================= */

const PORT = Number(process.env.PORT) || 10000;
const BOT_TOKEN = process.env.BOT_TOKEN || process.env.BALE_BOT_TOKEN || "";
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID || "";
const BALE_API_BASE = "https://tapi.bale.ai/bot";

const CONTACT_PHONE = "۰۹۱۷۷۷۰۰۹۶۱";
const ADMIN_NAME = "حمید جاویدی";
const CHANNEL_URL = "https://ble.ir/safarmashhadtoos";
const WEBSITE_URL = "https://safarmashhadtoos.ir";

// برای تورهای هوایی/ریلی/اتوبوسی تا ۱۰ نفر، ورود دستی لیست فعال است.
// بیشتر از ۱۰ نفر: فایل لیست دریافت می‌شود.
const MANUAL_PASSENGER_LIMIT = 10;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

/* =========================================================
   ابزار اعداد
========================================================= */

function toEnglishDigits(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/[۰-۹]/g, d => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)))
    .replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
}

function toPersianDigits(value) {
  if (value === undefined || value === null) return "";

  return String(value)
    .replace(/0/g, "۰")
    .replace(/1/g, "۱")
    .replace(/2/g, "۲")
    .replace(/3/g, "۳")
    .replace(/4/g, "۴")
    .replace(/5/g, "۵")
    .replace(/6/g, "۶")
    .replace(/7/g, "۷")
    .replace(/8/g, "۸")
    .replace(/9/g, "۹");
}

// نمایش تاریخ از چپ به راست در محیط راست‌به‌چپ بله
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
   اطلاعات کاربر / بله
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
    "کاربر"
  );
}

/* =========================================================
   دیتابیس
========================================================= */

async function initDB() {
  console.log("🔄 Initializing database...");

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

  console.log("✅ Database initialized successfully");
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
   تاریخچه برای کلید «بازگشت»
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

  // تاریخچه بیش از حد بزرگ نشود
  if (history.length > 20) history.splice(0, history.length - 20);

  await saveSession(chatId, newState, {
    ...(newData || {}),
    history
  });
}

async function goBack(chatId) {
  const session = await getSession(chatId);

  if (!session) {
    await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
    return;
  }

  const history = Array.isArray(session.data?.history)
    ? [...session.data.history]
    : [];

  if (!history.length) {
    await saveSession(chatId, "MAIN", {});
    await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
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
    throw new Error("BOT_TOKEN در Environment Variables تنظیم نشده است.");
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
   منوها
========================================================= */

function mainKeyboard() {
  return {
    keyboard: [
      [
        { text: "🏨 رزرو هتل" },
        { text: "🚌 تورهای مشهد" }
      ],
      [
        { text: "💎 طرح الماس شهر بهشت" },
        { text: "🧳 خدمات گردشگری" }
      ],
      [
        { text: "📞 تماس با ما" },
        { text: "📢 کانال" }
      ]
    ],
    resize_keyboard: true
  };
}

function backKeyboard() {
  return {
    inline_keyboard: [
      [{ text: "🔙 بازگشت", callback_data: "BACK" }]
    ]
  };
}

function tourMenu() {
  return {
    inline_keyboard: [
      [{ text: "✈️ تور هوایی", callback_data: "TOUR_AIR" }],
      [{ text: "🚆 تور ریلی", callback_data: "TOUR_RAIL" }],
      [{ text: "🚌 تور اتوبوسی", callback_data: "TOUR_BUS" }],
      [{ text: "🚍 کاروان اتوبوسی", callback_data: "TOUR_CARAVAN_BUS" }],
      [{ text: "🚆 کاروان ریلی", callback_data: "TOUR_CARAVAN_RAIL" }],
      [{ text: "🏨 فقط هتل", callback_data: "TOUR_HOTEL" }],
      [{ text: "🔙 بازگشت", callback_data: "BACK_MAIN" }]
    ]
  };
}

const TYPE_NAMES = {
  AIR: "✈️ تور هوایی",
  RAIL: "🚆 تور ریلی",
  BUS: "🚌 تور اتوبوسی",
  CARAVAN_BUS: "🚍 کاروان اتوبوسی",
  CARAVAN_RAIL: "🚆 کاروان ریلی",
  HOTEL: "🏨 فقط هتل"
};

function paymentName(paymentType) {
  return paymentType === "loan" ? "💎 طرح الماس" : "💵 نقدی";
}

/* =========================================================
   شروع تورها
========================================================= */

async function startTours(chatId) {
  await saveSession(chatId, "TOUR_CATEGORY", {});

  await sendMessage(
    chatId,
    "🚌 تورهای مشهد\n\nنوع سفر موردنظر را انتخاب کنید:",
    tourMenu()
  );
}

async function startTourType(chatId, type) {
  await pushStep(chatId, "TOUR_DATE", {
    tourType: type
  });

  await sendMessage(
    chatId,
    `${TYPE_NAMES[type]}\n\n📅 تاریخ ورود به مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۰`,
    backKeyboard()
  );
}

async function startHotelOnly(chatId) {
  await pushStep(chatId, "TOUR_DATE", {
    tourType: "HOTEL"
  });

  await sendMessage(
    chatId,
    "🏨 فقط هتل\n\n📅 تاریخ ورود به مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۰",
    backKeyboard()
  );
}

/* =========================================================
   مراحل فرم
========================================================= */

async function askTourReturnDate(chatId, data) {
  await pushStep(chatId, "TOUR_RETURN_DATE", data);
  await sendMessage(
    chatId,
    "📅 تاریخ خروج از مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۳",
    backKeyboard()
  );
}

async function askTourNights(chatId, data) {
  await pushStep(chatId, "TOUR_NIGHTS", data);
  await sendMessage(
    chatId,
    "🌙 تعداد شب اقامت را وارد کنید.\n\nمثلاً: ۳",
    backKeyboard()
  );
}

async function askCaravanCount(chatId, data) {
  await pushStep(chatId, "CARAVAN_COUNT", data);
  await sendMessage(
    chatId,
    "👥 تعداد کل مسافران کاروان را وارد کنید.\n\nمثلاً: ۱۰۰\n\nتعداد محدودیتی ندارد.",
    backKeyboard()
  );
}

async function askTourAdults(chatId, data) {
  await pushStep(chatId, "TOUR_ADULTS", data);
  await sendMessage(
    chatId,
    "👨 تعداد بزرگسال را وارد کنید.\n\nمثلاً: ۲",
    backKeyboard()
  );
}

async function askTourChildren(chatId, data) {
  await pushStep(chatId, "TOUR_CHILDREN", data);
  await sendMessage(
    chatId,
    "👧 تعداد کودک ۳ تا ۵ سال را وارد کنید.\n\nاگر کودک ندارید ۰ وارد کنید.",
    backKeyboard()
  );
}

async function askCaravanManager(chatId, data) {
  await pushStep(chatId, "CARAVAN_MANAGER", data);
  await sendMessage(
    chatId,
    "👤 نام و نام خانوادگی مدیر کاروان را وارد کنید.",
    backKeyboard()
  );
}

async function askTourPayment(chatId, data) {
  await pushStep(chatId, "TOUR_PAYMENT", data);

  await sendMessage(
    chatId,
    "💳 نوع پرداخت را انتخاب کنید:",
    {
      inline_keyboard: [
        [{ text: "💵 پرداخت نقدی", callback_data: "TOUR_PAYMENT_CASH" }],
        [{ text: "💎 طرح الماس شهر بهشت", callback_data: "TOUR_PAYMENT_LOAN" }],
        [{ text: "🔙 بازگشت", callback_data: "BACK" }]
      ]
    }
  );
}

async function askTourName(chatId, data) {
  await pushStep(chatId, "TOUR_NAME", data);
  await sendMessage(chatId, "👤 لطفاً نام و نام خانوادگی متقاضی را وارد کنید.", backKeyboard());
}

async function askTourPhone(chatId, data) {
  await pushStep(chatId, "TOUR_PHONE", data);
  await sendMessage(chatId, "📱 شماره تماس را وارد کنید.\n\nمثال: ۰۹۱۷۷۷۰۰۹۶۱", backKeyboard());
}

async function askTourNationalCode(chatId, data) {
  await pushStep(chatId, "TOUR_NATIONAL_CODE", data);
  await sendMessage(chatId, "🪪 کد ملی متقاضی اصلی را وارد کنید.", backKeyboard());
}

/* =========================================================
   تأیید نهایی
========================================================= */

async function showTourConfirmation(chatId, data) {
  const totalPeople = Number(data.adults || 0) + Number(data.children || 0);

  let text =
    "📋 لطفاً اطلاعات درخواست خود را بررسی کنید.\n\n" +
    `🚍 نوع سفر: ${TYPE_NAMES[data.tourType] || data.tourType}\n` +
    `📅 ورود به مشهد: ${ltrDate(data.departureDate)}\n` +
    `📅 خروج از مشهد: ${ltrDate(data.returnDate)}\n` +
    `🌙 تعداد شب اقامت: ${toPersianDigits(data.nights)} شب\n` +
    `👨 بزرگسال: ${toPersianDigits(data.adults)} نفر\n` +
    `👧 کودک ۳ تا ۵ سال: ${toPersianDigits(data.children)} نفر\n` +
    `👥 مجموع مسافران: ${toPersianDigits(totalPeople)} نفر\n`;

  if (data.tourType === "CARAVAN_BUS" || data.tourType === "CARAVAN_RAIL") {
    text += `👤 مدیر کاروان: ${data.caravanManager}\n`;
  }

  text +=
    `💳 نوع پرداخت: ${paymentName(data.paymentType)}\n` +
    `👤 نام و نام خانوادگی: ${data.applicantName}\n` +
    `📱 شماره تماس: ${toPersianDigits(data.phone)}\n`;

  if (data.paymentType === "loan") {
    text += `🪪 کد ملی: ${toPersianDigits(data.nationalCode)}\n`;
  }

  text += "\nآیا اطلاعات صحیح است؟";

  await sendMessage(chatId, text, {
    inline_keyboard: [
      [{ text: "✅ ارسال درخواست برای مدیر", callback_data: "TOUR_SUBMIT" }],
      [{ text: "✏️ اصلاح اطلاعات", callback_data: "TOUR_EDIT" }],
      [{ text: "❌ لغو درخواست", callback_data: "TOUR_CANCEL" }],
      [{ text: "🔙 بازگشت", callback_data: "BACK" }]
    ]
  });
}

/* =========================================================
   پردازش متن فرم
========================================================= */

async function handleTourText(chatId, text, session) {
  const data = session.data || {};

  if (session.state === "TOUR_DATE") {
    const date = normalizeDate(text);
    if (!date) {
      await sendMessage(chatId, "❌ تاریخ نامعتبر است.\nمثال: ۱۴۰۵/۰۷/۱۰", backKeyboard());
      return true;
    }

    await askTourReturnDate(chatId, { ...data, departureDate: date });
    return true;
  }

  if (session.state === "TOUR_RETURN_DATE") {
    const date = normalizeDate(text);
    if (!date) {
      await sendMessage(chatId, "❌ تاریخ نامعتبر است.\nمثال: ۱۴۰۵/۰۷/۱۳", backKeyboard());
      return true;
    }

    await askTourNights(chatId, { ...data, returnDate: date });
    return true;
  }

  if (session.state === "TOUR_NIGHTS") {
    const nights = parseInteger(text);
    if (nights === null) {
      await sendMessage(chatId, "❌ تعداد شب اقامت نامعتبر است.", backKeyboard());
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
      await sendMessage(chatId, "❌ تعداد بزرگسال باید حداقل ۱ نفر باشد.", backKeyboard());
      return true;
    }

    await askTourChildren(chatId, { ...data, adults });
    return true;
  }

  if (session.state === "CARAVAN_COUNT") {
    const passengerCount = parseInteger(text);
    if (passengerCount === null) {
      await sendMessage(chatId, "❌ تعداد مسافران باید حداقل ۱ نفر باشد.", backKeyboard());
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
      await sendMessage(chatId, "❌ تعداد کودک نامعتبر است.", backKeyboard());
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
      await sendMessage(chatId, "❌ لطفاً نام و نام خانوادگی مدیر کاروان را کامل وارد کنید.", backKeyboard());
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
      await sendMessage(chatId, "❌ لطفاً نام و نام خانوادگی کامل را وارد کنید.", backKeyboard());
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
      await sendMessage(chatId, "❌ شماره تماس صحیح نیست.\nمثال: ۰۹۱۷۷۷۰۰۹۶۱", backKeyboard());
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
      await sendMessage(chatId, "❌ کد ملی باید ۱۰ رقم باشد.", backKeyboard());
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
      await sendMessage(chatId, `❌ نام و نام خانوادگی مسافر ${toPersianDigits(index)} را کامل وارد کنید.`, backKeyboard());
      return true;
    }

    await pushStep(chatId, "PASSENGER_NATIONAL", {
      ...data,
      currentPassenger: {
        name: text.trim()
      },
      passengers: passengerList
    });

    await sendMessage(chatId, `🪪 کد ملی مسافر ${toPersianDigits(index)} را وارد کنید.`, backKeyboard());
    return true;
  }

  if (session.state === "PASSENGER_NATIONAL") {
    const code = normalizeNationalCode(text);
    if (!code) {
      await sendMessage(chatId, "❌ کد ملی باید ۱۰ رقم باشد.", backKeyboard());
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
      "🎂 تاریخ تولد را وارد کنید.\n\nفرمت صحیح و از چپ به راست:\n\n\u200E1362/06/17\u200E",
      backKeyboard()
    );
    return true;
  }

  if (session.state === "PASSENGER_BIRTH") {
    const birthDate = normalizeBirthDate(text);
    if (!birthDate) {
      await sendMessage(
        chatId,
        "❌ تاریخ تولد نامعتبر است.\nفرمت صحیح:\n\n\u200E1362/06/17\u200E",
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
      `👤 نام و نام خانوادگی مسافر ${toPersianDigits(nextIndex)} از ${toPersianDigits(total)} را وارد کنید.`,
      backKeyboard()
    );
    return true;
  }

  return false;
}

/* =========================================================
   نمایش دوباره مرحله برای برگشت
========================================================= */

async function showStatePrompt(chatId, state, data) {
  switch (state) {
    case "MAIN":
      await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
      return;
    case "TOUR_CATEGORY":
      await sendMessage(chatId, "🚌 تورهای مشهد\n\nنوع سفر موردنظر را انتخاب کنید:", tourMenu());
      return;
    case "TOUR_DATE":
      await sendMessage(chatId, `${TYPE_NAMES[data.tourType] || "تور"}\n\n📅 تاریخ ورود به مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۰`, backKeyboard());
      return;
    case "TOUR_RETURN_DATE":
      await sendMessage(chatId, "📅 تاریخ خروج از مشهد را وارد کنید.\n\nمثال: ۱۴۰۵/۰۷/۱۳", backKeyboard());
      return;
    case "TOUR_NIGHTS":
      await sendMessage(chatId, "🌙 تعداد شب اقامت را وارد کنید.", backKeyboard());
      return;
    case "CARAVAN_COUNT":
      await sendMessage(chatId, "👥 تعداد کل مسافران کاروان را وارد کنید.\n\nمثلاً: ۱۰۰\n\nتعداد محدودیتی ندارد.", backKeyboard());
      return;
    case "TOUR_ADULTS":
      await sendMessage(chatId, "👨 تعداد بزرگسال را وارد کنید.", backKeyboard());
      return;
    case "TOUR_CHILDREN":
      await sendMessage(chatId, "👧 تعداد کودک ۳ تا ۵ سال را وارد کنید.\n\nاگر کودک ندارید ۰ وارد کنید.", backKeyboard());
      return;
    case "CARAVAN_MANAGER":
      await sendMessage(chatId, "👤 نام و نام خانوادگی مدیر کاروان را وارد کنید.", backKeyboard());
      return;
    case "TOUR_PAYMENT":
      await sendMessage(chatId, "💳 نوع پرداخت را انتخاب کنید:", {
        inline_keyboard: [
          [{ text: "💵 پرداخت نقدی", callback_data: "TOUR_PAYMENT_CASH" }],
          [{ text: "💎 طرح الماس شهر بهشت", callback_data: "TOUR_PAYMENT_LOAN" }],
          [{ text: "🔙 بازگشت", callback_data: "BACK" }]
        ]
      });
      return;
    case "TOUR_NAME":
      await sendMessage(chatId, "👤 لطفاً نام و نام خانوادگی متقاضی را وارد کنید.", backKeyboard());
      return;
    case "TOUR_PHONE":
      await sendMessage(chatId, "📱 شماره تماس را وارد کنید.\n\nمثال: ۰۹۱۷۷۷۰۰۹۶۱", backKeyboard());
      return;
    case "TOUR_NATIONAL_CODE":
      await sendMessage(chatId, "🪪 کد ملی متقاضی اصلی را وارد کنید.", backKeyboard());
      return;
    case "PASSENGER_NAME":
      await sendMessage(chatId, `👤 نام و نام خانوادگی مسافر ${toPersianDigits(data.passengerIndex || 1)} از ${toPersianDigits(data.passengerCount || 0)} را وارد کنید.`, backKeyboard());
      return;
    case "PASSENGER_NATIONAL":
      await sendMessage(chatId, `🪪 کد ملی مسافر ${toPersianDigits(data.passengerIndex || 1)} را وارد کنید.`, backKeyboard());
      return;
    case "PASSENGER_BIRTH":
      await sendMessage(chatId, "🎂 تاریخ تولد را وارد کنید.\n\nفرمت صحیح:\n\n\u200E1362/06/17\u200E", backKeyboard());
      return;
    default:
      await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
  }
}

/* =========================================================
   طرح الماس
========================================================= */

function diamondPlanText() {
  return (
    "💎 طرح الماس شهر بهشت\n\n" +
    "۴۰ درصد با تو / ۶۰ درصد با ما\n\n" +
    "📌 مراحل:\n" +
    "۱️⃣ نصب اپلیکیشن کیوبانک مهر\n" +
    "۲️⃣ تکمیل احراز هویت\n" +
    "۳️⃣ انجام اعتبارسنجی\n" +
    "۴️⃣ دریافت رتبه اعتباری\n\n" +
    "🟢 رتبه A و B: بدون ضامن؛ خودت ضامن حسابت هستی.\n\n" +
    "🟡 رتبه C و D و پایین‌تر: یک ضامن + نامه کسر از حقوق + فیش حقوقی\n\n" +
    "⏳ بازپرداخت: ۱۲ ماهه\n" +
    "💰 کارمزد/سود: ۳ درصد\n" +
    "🚫 بدون مراجعه به شعبه\n" +
    "📄 اصل مدارک باید بارگذاری شود.\n\n" +
    "پس از دریافت رتبه اعتباری، کد ملی متقاضی اصلی را ارسال کنید.\n\n" +
    "💳 در سفر با طرح الماس، پس از تأیید اطلاعات حساب، ۴۰٪ هزینه کل سفر توسط مسافر پرداخت می‌شود.\n\n" +
    "🧾 پس از ارسال فیش و بررسی آن، مراحل فعال‌سازی انجام می‌شود.\n\n" +
    `📞 پشتیبانی: ${CONTACT_PHONE}`
  );
}

async function sendDiamondPlan(chatId) {
  await sendMessage(chatId, diamondPlanText(), {
    inline_keyboard: [
      [{ text: "📲 نصب کیوبانک مهر", url: "https://qbank24.ir/downloads" }],
      [{ text: "🔙 بازگشت", callback_data: "BACK_MAIN" }]
    ]
  });
}

/* =========================================================
   اطلاعات حساب
========================================================= */

function cashAccountText() {
  return (
    "💵 اطلاعات واریز\n\n" +
    "🏦 بانک: مهر ایران\n" +
    "👤 به نام: مهدی رشیدیان طرقی\n\n" +
    "💳 شماره کارت:\n6063731161437174\n\n" +
    "🏦 شماره حساب:\n363470014517217001\n\n" +
    "🔗 شماره شبا:\nIR160600363470014517217001\n\n" +
    "⚠️ پس از واریز، تصویر فیش را ارسال کنید."
  );
}

function diamondPaymentText(request) {
  const total = Number(request.payload?.totalCost || 0);

  if (total > 0) {
    const forty = Math.ceil(total * 0.4);
    return (
      "💎 درخواست طرح الماس تأیید شد.\n\n" +
      `🆔 درخواست: ${request.request_code}\n` +
      `💰 هزینه کل: ${toPersianDigits(total)} تومان\n` +
      `💳 سهم مسافر ۴۰٪: ${toPersianDigits(forty)} تومان\n\n` +
      "لطفاً ۴۰٪ را پرداخت و تصویر فیش را ارسال کنید."
    );
  }

  return (
    "💎 درخواست طرح الماس تأیید شد.\n\n" +
    `🆔 درخواست: ${request.request_code}\n\n` +
    "پس از تکمیل مراحل طرح و تأیید اطلاعات حساب، ۴۰٪ هزینه کل سفر پرداخت می‌شود.\n\n" +
    "🧾 تصویر فیش واریزی را ارسال کنید."
  );
}

/* =========================================================
   ثبت درخواست در دیتابیس و گروه
========================================================= */

function makeRequestCode() {
  return "SMT-" + Math.floor(1000 + Math.random() * 9000);
}

async function submitTourRequest(chatId) {
  const session = await getSession(chatId);

  if (!session) {
    await sendMessage(chatId, "❌ اطلاعات درخواست پیدا نشد. لطفاً دوباره شروع کنید.", mainKeyboard());
    return;
  }

  const data = session.data || {};
  const requestCode = makeRequestCode();
  const username = data.messageInfo?.username || "ندارد";
  const firstName = data.messageInfo?.firstName || "کاربر";

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
    "📋 درخواست جدید سفر\n\n" +
    `🆔 شماره درخواست: ${requestCode}\n\n` +
    `🚍 نوع سفر: ${TYPE_NAMES[payload.tourType] || payload.tourType}\n` +
    `📅 ورود به مشهد: ${ltrDate(payload.departureDate)}\n` +
    `📅 خروج از مشهد: ${ltrDate(payload.returnDate)}\n` +
    `🌙 تعداد شب اقامت: ${toPersianDigits(payload.nights)} شب\n` +
    `👨 بزرگسال: ${toPersianDigits(payload.adults)} نفر\n` +
    `👧 کودک ۳ تا ۵ سال: ${toPersianDigits(payload.children)} نفر\n` +
    `👥 مجموع مسافران: ${toPersianDigits(totalPeople)} نفر\n`;

  if (payload.tourType === "CARAVAN_BUS" || payload.tourType === "CARAVAN_RAIL") {
    adminText += `👤 مدیر کاروان: ${payload.caravanManager}\n`;
  }

  adminText +=
    `💳 پرداخت: ${paymentName(payload.paymentType)}\n` +
    `👤 متقاضی: ${payload.applicantName}\n` +
    `📱 تماس: ${toPersianDigits(payload.phone)}\n` +
    (payload.paymentType === "loan" ? `🪪 کد ملی: ${toPersianDigits(payload.nationalCode)}\n` : "") +
    `\n👤 کاربر بله: ${username}\n` +
    `🆔 Bale ID: ${chatId}`;

  if (!ADMIN_CHAT_ID) {
    throw new Error("ADMIN_CHAT_ID در Environment Variables تنظیم نشده است.");
  }

  await sendMessage(ADMIN_CHAT_ID, adminText, {
    inline_keyboard: [
      [
        { text: "✅ تأیید درخواست", callback_data: `APPROVE_REQUEST:${requestCode}` },
        { text: "❌ رد درخواست", callback_data: `REJECT_REQUEST:${requestCode}` }
      ]
    ]
  });

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "✅ درخواست شما با موفقیت برای مدیر ارسال شد.\n\n" +
    `🆔 شماره درخواست: ${requestCode}\n\n` +
    "پس از بررسی، نتیجه به شما اطلاع داده می‌شود.",
    mainKeyboard()
  );
}

/* =========================================================
   پس از تأیید مدیر
========================================================= */

async function approveRequest(adminChatId, code) {
  if (!isAdmin(adminChatId)) return;

  const result = await pool.query(
    `SELECT * FROM requests WHERE request_code = $1`,
    [code]
  );

  if (!result.rows.length) {
    await sendMessage(adminChatId, "❌ درخواست پیدا نشد.");
    return;
  }

  const request = result.rows[0];
  const payload = request.payload || {};

  await pool.query(
    `UPDATE requests SET status='approved', updated_at=NOW() WHERE request_code=$1`,
    [code]
  );

  await sendMessage(adminChatId, `✅ درخواست ${code} تأیید شد.`);

  // فقط هتل: هیچ لیست همراهانی درخواست نمی‌شود.
  if (payload.tourType === "HOTEL") {
    if (request.payment_type === "cash") {
      await sendMessage(
        request.user_id,
        "✅ رزرو فقط هتل شما تأیید و ثبت قطعی شد.\n\n" +
        cashAccountText() +
        `\n\n🆔 شماره درخواست: ${code}`
      );
    } else {
      await sendMessage(
        request.user_id,
        "✅ درخواست فقط هتل شما تأیید و ثبت قطعی شد.\n\n" +
        diamondPaymentText(request),
        {
          inline_keyboard: [
            [{ text: "📲 نصب کیوبانک مهر", url: "https://qbank24.ir/downloads" }]
          ]
        }
      );
    }
    return;
  }

  // کاروان‌ها همیشه فایل لیست می‌گیرند.
  if (payload.tourType === "CARAVAN_BUS" || payload.tourType === "CARAVAN_RAIL") {
    await askPassengerFile(
      request.user_id,
      code,
      payload.tourType,
      payload.caravanManager || "ثبت نشده"
    );
  } else {
    // تورهای عادی: تا ۱۰ نفر ورود دستی؛ بیشتر از آن فایل.
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
      "💵 درخواست سفر شما تأیید شد.\n\n" +
      cashAccountText() +
      `\n\n🆔 شماره درخواست: ${code}`
    );
  }

  if (request.payment_type === "loan") {
    await sendMessage(
      request.user_id,
      diamondPaymentText(request) +
      "\n\n📌 مراحل طرح الماس:\n" +
      "۱️⃣ نصب کیوبانک مهر\n" +
      "۲️⃣ احراز هویت\n" +
      "۳️⃣ اعتبارسنجی\n" +
      "۴️⃣ دریافت رتبه اعتباری\n\n" +
      "🟢 رتبه A و B: بدون ضامن\n" +
      "🟡 رتبه C و D و پایین‌تر: یک ضامن + نامه کسر از حقوق + فیش حقوقی\n\n" +
      "📄 اصل مدارک باید بارگذاری شود.",
      {
        inline_keyboard: [
          [{ text: "📲 نصب کیوبانک مهر", url: "https://qbank24.ir/downloads" }]
        ]
      }
    );
  }
}

/* =========================================================
   فایل لیست مسافران
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
      "📋 درخواست شما تأیید شد.\n\n" +
      "لطفاً فایل لیست کامل مسافران را بارگذاری کنید.\n\n" +
      "👤 نام و نام خانوادگی\n" +
      "🪪 کد ملی\n" +
      "🎂 تاریخ تولد\n\n" +
      "فرمت تاریخ تولد:\n\n\u200E1362/06/17\u200E\n\n" +
      `👤 مدیر کاروان: ${caravanManager || "ثبت نشده"}\n` +
      `🆔 شماره درخواست: ${requestCode}`,
      backKeyboard()
    );
  } else {
    await sendMessage(
      chatId,
      "📋 درخواست شما تأیید شد.\n\n" +
      "تعداد مسافران بیشتر از ۱۰ نفر است؛ لطفاً فایل لیست مسافران را بارگذاری کنید.\n\n" +
      "مشخصات هر مسافر:\n" +
      "👤 نام و نام خانوادگی\n" +
      "🪪 کد ملی\n" +
      "🎂 تاریخ تولد\n\n" +
      "فرمت تاریخ تولد:\n\n\u200E1362/06/17\u200E\n\n" +
      `🆔 شماره درخواست: ${requestCode}`,
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
    "📋 فایل لیست مسافران\n\n" +
    `🆔 درخواست: ${requestCode}\n` +
    `🚍 نوع: ${TYPE_NAMES[tourType] || tourType}\n`;

  if (manager) caption += `👤 مدیر کاروان: ${manager}\n`;

  caption +=
    `👤 کاربر: ${getFirstName(message)}\n` +
    `🔹 ${getUsername(message) || "بدون نام کاربری"}\n` +
    `🆔 Bale ID: ${getUserId(message)}`;

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
      "✅ فایل لیست مسافران با موفقیت برای مدیر ارسال شد.\n\n" +
      `🆔 شماره درخواست: ${requestCode}`,
      mainKeyboard()
    );

    return true;
  } catch (error) {
    console.error("❌ Send passenger file error:", error);
    await sendMessage(getChatId(message), "❌ ارسال فایل انجام نشد.\nلطفاً دوباره فایل را ارسال کنید.", backKeyboard());
    return true;
  }
}

/* =========================================================
   لیست دستی برای حداکثر ۱۰ نفر
========================================================= */

async function askManualPassengerList(chatId, requestCode, count, tourType) {
  await saveSession(chatId, "WAITING_PASSENGER_BUTTON", {
    requestCode,
    tourType,
    passengerCount: Number(count)
  });

  await sendMessage(
    chatId,
    "📋 درخواست شما تأیید شد.\n\n" +
    `تعداد مسافران: ${toPersianDigits(count)} نفر\n\n` +
    "کلید «لیست همراهان» را بزنید تا مشخصات مسافران به ترتیب دریافت شود.\n" +
    "تعداد اطلاعات قابل ثبت دقیقاً برابر با تعداد مسافران است و نفر اضافه پذیرفته نمی‌شود.",
    {
      inline_keyboard: [
        [{ text: "📋 لیست همراهان", callback_data: "PASSENGER_START" }],
        [{ text: "🔙 بازگشت", callback_data: "BACK_MAIN" }]
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
    `👤 نام و نام خانوادگی مسافر ۱ از ${toPersianDigits(session.data.passengerCount)} را وارد کنید.`,
    backKeyboard()
  );
}

async function submitManualPassengers(chatId, data) {
  const passengers = Array.isArray(data.passengers) ? data.passengers : [];

  if (passengers.length !== Number(data.passengerCount)) {
    await sendMessage(chatId, "❌ تعداد مشخصات با تعداد مسافران برابر نیست.", backKeyboard());
    return;
  }

  const lines = passengers.map((p, i) =>
    `${toPersianDigits(i + 1)}. ${p.name}\n` +
    `   🪪 ${toPersianDigits(p.nationalCode)}\n` +
    `   🎂 ${ltrDate(p.birthDate)}`
  );

  const text =
    "📋 لیست مسافران درخواست\n\n" +
    `🆔 درخواست: ${data.requestCode}\n` +
    `🚍 نوع سفر: ${TYPE_NAMES[data.tourType] || data.tourType}\n\n` +
    lines.join("\n\n");

  await sendMessage(ADMIN_CHAT_ID, text);

  await pool.query(
    `UPDATE requests SET status='passenger_list_received', updated_at=NOW() WHERE request_code=$1`,
    [data.requestCode]
  );

  await clearSession(chatId);

  await sendMessage(
    chatId,
    "✅ اطلاعات لیست مسافران با موفقیت برای مدیر ارسال شد.\n\n" +
    `🆔 شماره درخواست: ${data.requestCode}`,
    mainKeyboard()
  );
}

/* =========================================================
   Callback های فرم
========================================================= */

async function handleCallback(callback) {
  const data = callback?.data || "";
  const message = callback?.message;
  const chatId = message?.chat?.id;

  if (!chatId) return;

  await answerCallback(callback.id);

  if (data === "BACK_MAIN") {
    await clearSession(chatId);
    await sendMessage(chatId, "🏠 صفحه اصلی", mainKeyboard());
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

    await sendMessage(chatId, "📅 تاریخ ورود به مشهد را دوباره وارد کنید.", backKeyboard());
    return;
  }

  if (data === "TOUR_CANCEL") {
    await clearSession(chatId);
    await sendMessage(chatId, "❌ درخواست لغو شد.", mainKeyboard());
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
      await sendMessage(chatId, "❌ درخواست پیدا نشد.");
      return;
    }

    await pool.query(
      `UPDATE requests SET status='rejected', updated_at=NOW() WHERE request_code=$1`,
      [code]
    );

    await sendMessage(chatId, `❌ درخواست ${code} رد شد.`);
    await sendMessage(
      result.rows[0].user_id,
      "❌ درخواست شما توسط مدیر تأیید نشد.\n\n" +
      `🆔 شماره درخواست: ${code}\n\n☎️ ${CONTACT_PHONE}`,
      mainKeyboard()
    );
    return;
  }
}

/* =========================================================
   پیام‌های متنی
========================================================= */

async function handleMessage(message) {
  const chatId = getChatId(message);
  if (!chatId) return;

  const session = await getSession(chatId);

  // فایل لیست مسافران
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
      "🌹 به ربات سفر مشهد توس خوش آمدید.\n\nبرای دریافت خدمات گردشگری گزینه موردنظر را انتخاب کنید.",
      mainKeyboard()
    );
    return;
  }

  if (text === "🚌 تورهای مشهد") {
    await startTours(chatId);
    return;
  }

  if (text === "🏨 رزرو هتل") {
    await sendMessage(chatId, "🏨 رزرو هتل از این بخش فعلاً غیرفعال است.\n\nبرای رزرو فقط هتل، از مسیر «🚌 تورهای مشهد» گزینه «🏨 فقط هتل» را انتخاب کنید.", mainKeyboard());
    return;
  }

  if (text === "💎 طرح الماس شهر بهشت") {
    await sendDiamondPlan(chatId);
    return;
  }

  if (text === "🧳 خدمات گردشگری") {
    await sendMessage(
      chatId,
      "🧳 خدمات گردشگری\n\n" +
      "✈️ تورهای هوایی\n" +
      "🚆 تورهای ریلی\n" +
      "🚌 تورهای اتوبوسی\n" +
      "🚍 کاروان‌های زیارتی\n" +
      "🏨 فقط هتل\n\n" +
      `☎️ ${CONTACT_PHONE}`,
      mainKeyboard()
    );
    return;
  }

  if (text === "📞 تماس با ما") {
    await sendMessage(
      chatId,
      "📞 تماس با ما\n\n" +
      `👤 ${ADMIN_NAME}\n` +
      `☎️ ${CONTACT_PHONE}\n` +
      `${WEBSITE_URL}`,
      mainKeyboard()
    );
    return;
  }

  if (text === "📢 کانال") {
    await sendMessage(chatId, `📢 کانال سفر مشهد توس\n\n${CHANNEL_URL}`, mainKeyboard());
    return;
  }

  if (session) {
    const handled = await handleTourText(chatId, text, session);
    if (handled) return;
  }

  await sendMessage(chatId, "لطفاً یکی از گزینه‌های منو را انتخاب کنید.", mainKeyboard());
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
    console.error("❌ Webhook error:", error);
  }
});

app.get("/", (req, res) => {
  res.send("Safar Mashhad Toos Bot is running ✅");
});

/* =========================================================
   START
========================================================= */

async function startServer() {
  try {
    await initDB();

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`👤 ADMIN_CHAT_ID: ${ADMIN_CHAT_ID || "undefined"}`);
      console.log(`🔑 BOT_TOKEN: ${BOT_TOKEN ? "configured" : "undefined"}`);
    });
  } catch (error) {
    console.error("❌ Startup error:", error);
    process.exit(1);
  }
}

startServer();
