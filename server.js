require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

const BOT_TOKEN = process.env.BOT_TOKEN;

const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

const BALE_API = "https://tapi.bale.ai/bot";

// ========================================
// حافظه موقت کاربران
// ========================================

const sessions = {};

const requests = {};

let requestCounter = 1000;

// ========================================
// ارسال پیام
// ========================================

async function sendMessage(chatId, text, replyMarkup = undefined) {

  if (!BOT_TOKEN) {
    console.error("❌ BOT_TOKEN تنظیم نشده است.");
    return;
  }

  const body = {
    chat_id: chatId,
    text: text
  };

  if (replyMarkup) {
    body.reply_markup = replyMarkup;
  }

  try {

    const response = await fetch(
      `${BALE_API}${BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      }
    );

    const result = await response.json();

    console.log("📤 Bale response:", result);

    return result;

  } catch (error) {

    console.error(
      "❌ Send message error:",
      error
    );

  }
}

// ========================================
// منوی اصلی
// ========================================

function mainMenu() {

  return {
    keyboard: [
      [
        { text: "🏨 رزرو هتل" },
        { text: "🚌 تورهای مشهد" }
      ],
      [
        { text: "💎 طرح الماس شهر بهشت" }
      ],
      [
        { text: "🧳 خدمات گردشگری" },
        { text: "📞 تماس با ما" }
      ],
      [
        { text: "📢 کانال" }
      ]
    ],
    resize_keyboard: true
  };

}

// ========================================
// منوی تورها
// ========================================

function mashhadToursMenu() {

  return {
    keyboard: [
      [
        { text: "✈️ تور هوایی" },
        { text: "🚆 تور ریلی" }
      ],
      [
        { text: "🚌 تور اتوبوسی" }
      ],
      [
        { text: "🚌 کاروان اتوبوسی" },
        { text: "🚆 کاروان ریلی" }
      ],
      [
        { text: "🏨 فقط هتل" }
      ],
      [
        { text: "🔙 بازگشت" }
      ]
    ],
    resize_keyboard: true
  };

}

// ========================================
// منوی نوع پرداخت
// ========================================

function paymentMenu() {

  return {
    keyboard: [
      [
        { text: "💵 پرداخت نقدی" },
        { text: "💎 طرح الماس" }
      ],
      [
        { text: "🔙 بازگشت" }
      ]
    ],
    resize_keyboard: true
  };

}

// ========================================
// منوی تأیید درخواست
// ========================================

function confirmationMenu() {

  return {
    keyboard: [
      [
        { text: "✅ تأیید و ارسال درخواست" }
      ],
      [
        { text: "🔙 بازگشت" }
      ]
    ],
    resize_keyboard: true
  };

}

// ========================================
// دکمه‌های مدیر
// ========================================

function adminRequestMenu(requestId) {

  return {
    inline_keyboard: [
      [
        {
          text: "✅ تأیید درخواست",
          callback_data: `approve_${requestId}`
        },
        {
          text: "❌ رد درخواست",
          callback_data: `reject_${requestId}`
        }
      ]
    ]
  };

}

// ========================================
// شروع فرم رزرو
// ========================================

function startBooking(chatId, tourType) {

  sessions[chatId] = {

    step: "checkin",

    tourType: tourType,

    checkin: null,

    checkout: null,

    adults: null,

    children: null,

    payment: null,

    name: null,

    phone: null,

    nationalCode: null,

    companions: []

  };

}

// ========================================
// تشخیص نوع سفر
// ========================================

function getTourName(text) {

  const tours = {

    "✈️ تور هوایی": "تور هوایی",

    "🚆 تور ریلی": "تور ریلی",

    "🚌 تور اتوبوسی": "تور اتوبوسی",

    "🚌 کاروان اتوبوسی": "کاروان اتوبوسی",

    "🚆 کاروان ریلی": "کاروان ریلی",

    "🏨 فقط هتل": "فقط هتل",

    "🏨 رزرو هتل": "رزرو هتل"

  };

  return tours[text] || null;

}

// ========================================
// اعتبارسنجی تاریخ ساده
// ========================================

function validDate(text) {

  const value = String(text).trim();

  const match = value.match(
    /^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})$/
  );

  if (!match) {
    return false;
  }

  const year = Number(match[1]);

  const month = Number(match[2]);

  const day = Number(match[3]);

  if (month < 1 || month > 12) {
    return false;
  }

  if (day < 1 || day > 31) {
    return false;
  }

  if (year < 1400 || year > 1500) {
    return false;
  }

  return true;

}

// ========================================
// خلاصه درخواست
// ========================================

function bookingSummary(data) {

  let text = "";

  text += "📋 خلاصه درخواست سفر\n\n";

  text += `نوع سفر: ${data.tourType}\n`;

  text += `📅 تاریخ ورود به مشهد: ${data.checkin}\n`;

  text += `📅 تاریخ خروج از مشهد: ${data.checkout}\n`;

  text += `👨‍👩‍👧 بزرگسال: ${data.adults} نفر\n`;

  text += `👶 کودک ۳ تا ۵ سال: ${data.children} نفر\n`;

  text += `💳 نوع پرداخت: ${data.payment}\n`;

  text += `👤 نام و نام خانوادگی: ${data.name}\n`;

  text += `📱 شماره تماس: ${data.phone}\n`;

  if (data.payment === "💎 طرح الماس") {

    text += `🪪 کد ملی: ${data.nationalCode}\n`;

  }

  text += "\n";

  text += "در صورت صحت اطلاعات، درخواست را ارسال کنید.";

  return text;

}

// ========================================
// متن درخواست مدیر
// ========================================

function adminRequestText(request) {

  let text = "";

  text += "🔔 درخواست جدید سفر\n\n";

  text += `🆔 شماره درخواست: ${request.id}\n`;

  text += `🚍 نوع سفر: ${request.tourType}\n`;

  text += `📅 ورود: ${request.checkin}\n`;

  text += `📅 خروج: ${request.checkout}\n`;

  text += `👨‍👩‍👧 بزرگسال: ${request.adults} نفر\n`;

  text += `👶 کودک ۳ تا ۵ سال: ${request.children} نفر\n`;

  text += `💳 پرداخت: ${request.payment}\n`;

  text += `👤 نام: ${request.name}\n`;

  text += `📱 تماس: ${request.phone}\n`;

  if (request.nationalCode) {

    text += `🪪 کد ملی: ${request.nationalCode}\n`;

  }

  text += `\n👤 Bale ID: ${request.chatId}\n`;

  if (request.username) {

    text += `🔹 Username: @${request.username}\n`;

  }

  text += "\nلطفاً درخواست را بررسی کنید.";

  return text;

}

// ========================================
// Webhook
// ========================================

app.post("/webhook", async (req, res) => {

  try {

    console.log(
      "📥 Bale update:",
      JSON.stringify(req.body, null, 2)
    );

    const update = req.body;

    res.sendStatus(200);

    // ====================================
    // Callback Query مدیر
    // ====================================

    if (update.callback_query) {

      const callback = update.callback_query;

      const data = callback.data;

      const adminChatId =
        callback.message?.chat?.id;

      console.log(
        "🔘 Callback:",
        data
      );

      if (!adminChatId) {
        return;
      }

      if (
        !ADMIN_CHAT_ID ||
        String(adminChatId) !== String(ADMIN_CHAT_ID)
      ) {

        console.log(
          "⚠️ Callback از مدیر مجاز نیست."
        );

        return;

      }

      const parts = data.split("_");

      const action = parts[0];

      const requestId = parts.slice(1).join("_");

      const request = requests[requestId];

      if (!request) {

        await sendMessage(
          adminChatId,
          "❌ این درخواست دیگر در سیستم موجود نیست."
        );

        return;
      }

      // ----------------------------------
      // تأیید
      // ----------------------------------

      if (action === "approve") {

        request.status = "approved";

        await sendMessage(
          adminChatId,
          `✅ درخواست ${requestId} تأیید شد.`
        );

        await sendMessage(
          request.chatId,
          "✅ درخواست شما توسط مدیر تأیید شد.\n\n" +
          "لطفاً مشخصات همراهان را ارسال کنید."
        );

        // --------------------------------
        // فقط هوایی و ریلی
        // --------------------------------

        if (
          request.tourType === "تور هوایی" ||
          request.tourType === "تور ریلی"
        ) {

          sessions[request.chatId] = {

            step: "companion_name",

            requestId: requestId,

            companionIndex: 1,

            currentCompanion: {}

          };

          await sendMessage(
            request.chatId,
            "👤 همراه شماره ۱\n\n" +
            "نام و نام خانوادگی همراه را وارد کنید.\n\n" +
            "اگر همراهی ندارید، بنویسید: بدون همراه"
          );

        }

        return;
      }

      // ----------------------------------
      // رد درخواست
      // ----------------------------------

      if (action === "reject") {

        request.status = "rejected";

        await sendMessage(
          adminChatId,
          `❌ درخواست ${requestId} رد شد.`
        );

        await sendMessage(
          request.chatId,
          "❌ درخواست شما توسط مدیر رد شد.\n\n" +
          "در صورت تمایل می‌توانید درخواست جدیدی ثبت کنید."
        );

        delete sessions[request.chatId];

        return;
      }

      return;
    }

    // ====================================
    // پیام عادی
    // ====================================

    if (!update.message) {
      return;
    }

    const message = update.message;

    const chatId = message.chat?.id;

    const text = message.text?.trim();

    if (!chatId || !text) {
      return;
    }

    const username =
      message.from?.username || "";

    console.log(
      "💬 Message:",
      {
        chatId,
        text
      }
    );

    // ====================================
    // /start
    // ====================================

    if (text === "/start") {

      delete sessions[chatId];

      await sendMessage(
        chatId,
        "سلام و خوش آمدید 🌹\n\n" +
        "به ربات سفر مشهد توس خوش آمدید.\n\n" +
        "لطفاً یکی از گزینه‌های منو را انتخاب کنید:",
        mainMenu()
      );

      return;
    }

    // ====================================
    // بازگشت کلی
    // ====================================

    if (
      text === "🔙 بازگشت" ||
      text === "بازگشت"
    ) {

      delete sessions[chatId];

      await sendMessage(
        chatId,
        "به منوی اصلی برگشتید:",
        mainMenu()
      );

      return;
    }

    // ====================================
    // منوی تورهای مشهد
    // ====================================

    if (
      text === "تورهای مشهد" ||
      text === "🚌 تورهای مشهد"
    ) {

      await sendMessage(
        chatId,
        "لطفاً نوع سفر خود را انتخاب کنید:",
        mashhadToursMenu()
      );

      return;
    }

    // ====================================
    // انتخاب نوع سفر
    // ====================================

    const selectedTour =
      getTourName(text);

    if (selectedTour) {

      startBooking(
        chatId,
        selectedTour
      );

      await sendMessage(
        chatId,
        "📅 لطفاً تاریخ ورود به مشهد را وارد کنید.\n\n" +
        "فرمت تاریخ:\n" +
        "مثال: 1405/07/10"
      );

      return;
    }

    // ====================================
    // رزرو هتل
    // ====================================

    if (text === "🏨 رزرو هتل") {

      startBooking(
        chatId,
        "رزرو هتل"
      );

      await sendMessage(
        chatId,
        "📅 لطفاً تاریخ ورود به مشهد را وارد کنید.\n\n" +
        "مثال: 1405/07/10"
      );

      return;
    }

    // ====================================
    // طرح الماس
    // ====================================

    if (text === "💎 طرح الماس شهر بهشت") {

      await sendMessage(
        chatId,
        "💎 طرح الماس شهر بهشت\n\n" +
        "۴۰٪ با تو / ۶۰٪ با ما\n\n" +
        "برای ثبت درخواست سفر، از منوی «تورهای مشهد» نوع سفر خود را انتخاب کنید."
      );

      return;
    }

    // ====================================
    // خدمات گردشگری
    // ====================================

    if (text === "🧳 خدمات گردشگری") {

      await sendMessage(
        chatId,
        "🧳 خدمات گردشگری\n\n" +
        "رزرو هتل\n" +
        "تورهای مشهد\n" +
        "خدمات سفر و زیارت\n\n" +
        "برای شروع، یکی از گزینه‌های منوی اصلی را انتخاب کنید.",
        mainMenu()
      );

      return;
    }

    // ====================================
    // تماس با ما
    // ====================================

    if (text === "📞 تماس با ما") {

      await sendMessage(
        chatId,
        "📞 تماس با ما\n\n" +
        "حمید جاویدی\n" +
        "☎️ ۰۹۱۷۷۷۰۰۹۶۱"
      );

      return;
    }

    // ====================================
    // کانال
    // ====================================

    if (text === "📢 کانال") {

      await sendMessage(
        chatId,
        "📢 کانال سفر مشهد توس\n\n" +
        "https://ble.ir/safarmashhadtoos"
      );

      return;
    }

    // ====================================
    // ادامه فرم رزرو
    // ====================================

    const session = sessions[chatId];

    if (session) {

      // ----------------------------------
      // تاریخ ورود
      // ----------------------------------

      if (session.step === "checkin") {

        if (!validDate(text)) {

          await sendMessage(
            chatId,
            "❌ تاریخ واردشده صحیح نیست.\n\n" +
            "لطفاً به شکل زیر وارد کنید:\n" +
            "1405/07/10"
          );

          return;
        }

        session.checkin = text;

        session.step = "checkout";

        await sendMessage(
          chatId,
          "📅 حالا تاریخ خروج از مشهد را وارد کنید.\n\n" +
          "مثال: 1405/07/13"
        );

        return;
      }

      // ----------------------------------
      // تاریخ خروج
      // ----------------------------------

      if (session.step === "checkout") {

        if (!validDate(text)) {

          await sendMessage(
            chatId,
            "❌ تاریخ واردشده صحیح نیست.\n\n" +
            "مثال: 1405/07/13"
          );

          return;
        }

        session.checkout = text;

        session.step = "adults";

        await sendMessage(
          chatId,
          "👨‍👩‍👧 تعداد بزرگسالان را وارد کنید.\n\n" +
          "مثال: 2"
        );

        return;
      }

      // ----------------------------------
      // بزرگسال
      // ----------------------------------

      if (session.step === "adults") {

        const number = Number(text);

        if (
          !Number.isInteger(number) ||
          number < 1 ||
          number > 50
        ) {

          await sendMessage(
            chatId,
            "❌ لطفاً تعداد بزرگسال را به صورت عدد صحیح وارد کنید."
          );

          return;
        }

        session.adults = number;

        session.step = "children";

        await sendMessage(
          chatId,
          "👶 تعداد کودکان ۳ تا ۵ سال را وارد کنید.\n\n" +
          "اگر کودک ندارید، عدد 0 را وارد کنید."
        );

        return;
      }

      // ----------------------------------
      // کودک
      // ----------------------------------

      if (session.step === "children") {

        const number = Number(text);

        if (
          !Number.isInteger(number) ||
          number < 0 ||
          number > 20
        ) {

          await sendMessage(
            chatId,
            "❌ لطفاً تعداد کودکان را به صورت عدد صحیح وارد کنید."
          );

          return;
        }

        session.children = number;

        session.step = "payment";

        await sendMessage(
          chatId,
          "💳 لطفاً نوع پرداخت را انتخاب کنید:",
          paymentMenu()
        );

        return;
      }

      // ----------------------------------
      // پرداخت
      // ----------------------------------

      if (session.step === "payment") {

        if (
          text !== "💵 پرداخت نقدی" &&
          text !== "💎 طرح الماس"
        ) {

          await sendMessage(
            chatId,
            "لطفاً یکی از گزینه‌های نوع پرداخت را انتخاب کنید.",
            paymentMenu()
          );

          return;
        }

        session.payment = text;

        session.step = "name";

        await sendMessage(
          chatId,
          "👤 لطفاً نام و نام خانوادگی خود را وارد کنید."
        );

        return;
      }

      // ----------------------------------
      // نام
      // ----------------------------------

      if (session.step === "name") {

        if (text.length < 3) {

          await sendMessage(
            chatId,
            "❌ لطفاً نام و نام خانوادگی را کامل وارد کنید."
          );

          return;
        }

        session.name = text;

        session.step = "phone";

        await sendMessage(
          chatId,
          "📱 لطفاً شماره تماس خود را وارد کنید."
        );

        return;
      }

      // ----------------------------------
      // تلفن
      // ----------------------------------

      if (session.step === "phone") {

        const phoneDigits =
          text.replace(/\D/g, "");

        if (phoneDigits.length < 10) {

          await sendMessage(
            chatId,
            "❌ شماره تماس صحیح نیست.\n\n" +
            "لطفاً شماره تماس را وارد کنید."
          );

          return;
        }

        session.phone = text;

        if (session.payment === "💎 طرح الماس") {

          session.step = "nationalCode";

          await sendMessage(
            chatId,
            "🪪 لطفاً کد ملی خود را وارد کنید."
          );

          return;
        }

        session.step = "confirm";

        await sendMessage(
          chatId,
          bookingSummary(session),
          confirmationMenu()
        );

        return;
      }

      // ----------------------------------
      // کد ملی
      // ----------------------------------

      if (session.step === "nationalCode") {

        const nationalCode =
          text.replace(/\D/g, "");

        if (nationalCode.length !== 10) {

          await sendMessage(
            chatId,
            "❌ کد ملی باید ۱۰ رقم باشد.\n\n" +
            "لطفاً دوباره وارد کنید."
          );

          return;
        }

        session.nationalCode = nationalCode;

        session.step = "confirm";

        await sendMessage(
          chatId,
          bookingSummary(session),
          confirmationMenu()
        );

        return;
      }

      // ----------------------------------
      // تأیید درخواست
      // ----------------------------------

      if (session.step === "confirm") {

        if (text === "✅ تأیید و ارسال درخواست") {

          const requestId =
            `SMT-${++requestCounter}`;

          const request = {

            id: requestId,

            chatId: chatId,

            username: username,

            tourType: session.tourType,

            checkin: session.checkin,

            checkout: session.checkout,

            adults: session.adults,

            children: session.children,

            payment: session.payment,

            name: session.name,

            phone: session.phone,

            nationalCode:
              session.nationalCode || null,

            status: "pending",

            companions: []

          };

          requests[requestId] = request;

          // --------------------------------
          // ارسال به مدیر
          // --------------------------------

          if (ADMIN_CHAT_ID) {

            await sendMessage(
              ADMIN_CHAT_ID,
              adminRequestText(request),
              adminRequestMenu(requestId)
            );

          } else {

            console.error(
              "❌ ADMIN_CHAT_ID تنظیم نشده است."
            );

          }

          await sendMessage(
            chatId,
            "✅ درخواست شما با موفقیت ثبت شد.\n\n" +
            `🆔 شماره درخواست: ${requestId}\n\n` +
            "درخواست شما برای مدیر ارسال شد.\n" +
            "پس از بررسی، نتیجه به شما اطلاع داده می‌شود.",
            mainMenu()
          );

          delete sessions[chatId];

          return;
        }

      }

      // ----------------------------------
      // همراه - نام
      // ----------------------------------

      if (session.step === "companion_name") {

        if (
          text === "بدون همراه" ||
          text === "بدون همراه."
        ) {

          const request =
            requests[session.requestId];

          if (request) {

            request.companions = [];

            request.status =
              "companions_completed";

          }

          delete sessions[chatId];

          await sendMessage(
            chatId,
            "✅ اطلاعات همراهان ثبت شد.\n\n" +
            "درخواست شما در حال پیگیری است.",
            mainMenu()
          );

          return;
        }

        session.currentCompanion = {

          name: text

        };

        session.step = "companion_nationalCode";

        await sendMessage(
          chatId,
          "🪪 کد ملی همراه را وارد کنید."
        );

        return;
      }

      // ----------------------------------
      // همراه - کد ملی
      // ----------------------------------

      if (session.step === "companion_nationalCode") {

        const nationalCode =
          text.replace(/\D/g, "");

        if (nationalCode.length !== 10) {

          await sendMessage(
            chatId,
            "❌ کد ملی همراه باید ۱۰ رقم باشد."
          );

          return;
        }

        session.currentCompanion.nationalCode =
          nationalCode;

        session.step = "companion_birthDate";

        await sendMessage(
          chatId,
          "🎂 تاریخ تولد همراه را وارد کنید.\n\n" +
          "فرمت:\n" +
          "روز/ماه/سال\n\n" +
          "مثال:\n" +
          "15/02/1385"
        );

        return;
      }

      // ----------------------------------
      // همراه - تاریخ تولد
      // ----------------------------------

      if (session.step === "companion_birthDate") {

        const birthDate =
          text.trim();

        if (
          !/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(
            birthDate
          )
        ) {

          await sendMessage(
            chatId,
            "❌ تاریخ تولد صحیح نیست.\n\n" +
            "مثال:\n" +
            "15/02/1385"
          );

          return;
        }

        session.currentCompanion.birthDate =
          birthDate;

        const request =
          requests[session.requestId];

        if (request) {

          request.companions.push(
            session.currentCompanion
          );

        }

        session.companionIndex++;

        session.currentCompanion = {};

        session.step = "companion_name";

        await sendMessage(
          chatId,
          `👤 همراه شماره ${session.companionIndex}\n\n` +
          "اگر همراه دیگری دارید، نام و نام خانوادگی او را وارد کنید.\n\n" +
          "اگر همراه دیگری ندارید، بنویسید:\n" +
          "بدون همراه"
        );

        return;
      }

    }

    // ====================================
    // گزینه نامشخص
    // ====================================

    await sendMessage(
      chatId,
      "لطفاً یکی از گزینه‌های منو را انتخاب کنید.",
      mainMenu()
    );

  } catch (error) {

    console.error(
      "❌ Webhook error:",
      error
    );

  }

});

// ========================================
// تست سرور
// ========================================

app.get("/", (req, res) => {

  res.send(
    "سفر مشهد توس - ربات بله فعال است ✅"
  );

});

// ========================================
// اجرای سرور
// ========================================

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
