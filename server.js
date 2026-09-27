require("dotenv").config();

const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

// ================================
// تنظیمات ربات
// ================================

const BOT_TOKEN = process.env.BOT_TOKEN;

const BALE_API = "https://tapi.bale.ai/bot";

// ================================
// ارسال پیام به بله
// ================================

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

// ================================
// منوی اصلی
// ================================

function mainMenu() {

  return {

    keyboard: [

      [
        {
          text: "🏨 رزرو هتل"
        },
        {
          text: "🚌 تورهای مشهد"
        }
      ],

      [
        {
          text: "💎 طرح الماس شهر بهشت"
        }
      ],

      [
        {
          text: "🧳 خدمات گردشگری"
        },
        {
          text: "📞 تماس با ما"
        }
      ],

      [
        {
          text: "📢 کانال"
        }
      ]

    ],

    resize_keyboard: true

  };

}

// ================================
// منوی تورهای مشهد
// ================================

function mashhadToursMenu() {

  return {

    keyboard: [

      [
        {
          text: "✈️ تور هوایی"
        },
        {
          text: "🚆 تور ریلی"
        }
      ],

      [
        {
          text: "🚌 تور اتوبوسی"
        }
      ],

      [
        {
          text: "🚌 کاروان اتوبوسی"
        },
        {
          text: "🚆 کاروان ریلی"
        }
      ],

      [
        {
          text: "🏨 فقط هتل"
        }
      ],

      [
        {
          text: "🔙 بازگشت"
        }
      ]

    ],

    resize_keyboard: true

  };

}

// ================================
// دریافت Webhook بله
// ================================

app.post("/webhook", async (req, res) => {

  try {

    console.log(
      "📥 Bale update:",
      JSON.stringify(req.body, null, 2)
    );

    const update = req.body;

    // پاسخ سریع به بله
    res.sendStatus(200);

    // ================================
    // بررسی پیام
    // ================================

    if (!update.message) {
      return;
    }

    const message = update.message;

    const chatId =
      message.chat?.id;

    const text =
      message.text?.trim();

    if (!chatId) {
      return;
    }

    console.log("💬 Message:", {
      chatId,
      text
    });

    // ================================
    // /start
    // ================================

    if (text === "/start") {

      await sendMessage(
        chatId,
        "سلام و خوش آمدید 🌹\n\n" +
        "به ربات سفر مشهد توس خوش آمدید.\n\n" +
        "لطفاً یکی از گزینه‌های منو را انتخاب کنید:",
        mainMenu()
      );

      return;
    }

    // ================================
    // تورهای مشهد
    // ================================

    if (text === "🚌 تورهای مشهد") {

      await sendMessage(
        chatId,
        "لطفاً نوع سفر خود را انتخاب کنید:",
        mashhadToursMenu()
      );

      return;
    }

    // ================================
    // بازگشت
    // ================================

    if (text === "🔙 بازگشت") {

      await sendMessage(
        chatId,
        "لطفاً یکی از گزینه‌های منو را انتخاب کنید:",
        mainMenu()
      );

      return;
    }

    // ================================
    // گزینه نامشخص
    // ================================

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

// ================================
// مسیر تست سرور
// ================================

app.get("/", (req, res) => {

  res.send(
    "سفر مشهد توس - ربات بله فعال است ✅"
  );

});

// ================================
// شروع سرور
// ================================

app.listen(PORT, () => {

  console.log(
    `🚀 Server running on port ${PORT}`
  );

});
```
