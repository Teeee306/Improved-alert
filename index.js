import fetch from "node-fetch";
import TelegramBot from "node-telegram-bot-api";

const token = process.env.BOT_TOKEN;
const chatId = process.env.TELEGRAM_CHAT_ID;

const bot = new TelegramBot(token, { polling: true });

// Tracking states
let tracking = { london: false, nyc: false };
let lastData = { london: {}, nyc: {} };

// Format today's date
const getTodayDate = () => {
  const today = new Date();
  return today.toLocaleDateString("en-US", { month: "long", day: "numeric" });
};

// Fetch market from Polymarket GraphQL
async function fetchMarket(station) {
  const query = `
  {
    markets(first: 10, query: "highest temperature in ${station} on ${getTodayDate()}") {
      edges {
        node {
          slug
          question
          outcomes {
            name
            price
          }
          volume
          resolvedOutcome {
            name
          }
        }
      }
    }
  }`;

  try {
    const res = await fetch("https://api.polymarket.com/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    const data = await res.json();
    if (!data.data?.markets?.edges.length) return null;

    return data.data.markets.edges[0].node;
  } catch (err) {
    console.error(`Error fetching ${station} market:`, err);
    return null;
  }
}

// Compare and alert changes
async function checkMarket(station) {
  if (!tracking[station]) return;

  const market = await fetchMarket(station);
  if (!market) return;

  const top3 = market.outcomes
    .sort((a, b) => b.price - a.price)
    .slice(0, 3);

  let changes = [];
  top3.forEach((o) => {
    const cents = (o.price * 100).toFixed(2);
    const percent = (o.price * 100).toFixed(0) + "%";

    if (lastData[station][o.name] !== undefined && lastData[station][o.name] !== o.price) {
      const arrow = o.price > lastData[station][o.name] ? "↑" : "↓";
      changes.push(`${o.name} ${arrow} ${percent} (${cents}¢)`);
    }
    lastData[station][o.name] = o.price;
  });

  const totalVolume = market.volume || 0;

  if (changes.length > 0) {
    const message = [${station.toUpperCase()}] ${changes.join(", ")}\nTotal Volume: $${totalVolume.toLocaleString()};
    bot.sendMessage(chatId, message);
  }
}

// Resolve alert
async function checkResolve(station) {
  if (!tracking[station]) return;

  const market = await fetchMarket(station);
  if (!market || !market.resolvedOutcome) return;

  const resolvedName = market.resolvedOutcome.name;
  bot.sendMessage(chatId, `✅ [${station.toUpperCase()}] Resolved: ${resolvedName} (${getTodayDate()})`);
}

// Run every 1 minute
setInterval(() => checkMarket("london"), 60 * 1000);
setInterval(() => checkMarket("nyc"), 60 * 1000);
setInterval(() => checkResolve("london"), 60 * 1000);
setInterval(() => checkResolve("nyc"), 60 * 1000);

// Telegram commands
bot.onText(/\/start|\/help/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    `Hi! Commands:\n
/alert london\n/stop london\n/alert nyc\n/stop nyc\n/current london\n/current nyc\n/resolve\n/streak london\n/streak nyc`
  );
});

bot.onText(/alert london/i, (msg) => {
  tracking.london = true;
  bot.sendMessage(msg.chat.id, "✅ Now tracking London weather markets!");
});

bot.onText(/stop london/i, (msg) => {
  tracking.london = false;
  bot.sendMessage(msg.chat.id, "⏹ Stopped tracking London.");
});

bot.onText(/alert nyc/i, (msg) => {
  tracking.nyc = true;
  bot.sendMessage(msg.chat.id, "✅ Now tracking NYC weather markets!");
});

bot.onText(/stop nyc/i, (msg) => {
  tracking.nyc = false;
  bot.sendMessage(msg.chat.id, "⏹ Stopped tracking NYC.");
});

bot.onText(/\/current london/i, async (msg) => {
  const market = await fetchMarket("London");
  if (!market) return bot.sendMessage(msg.chat.id, "❌ No market found for London today.");
  const top3 = market.outcomes.sort((a, b) => b.price - a.price).slice(0, 3);
  let text = *London Top 3 Options (${getTodayDate()})*\n;
  top3.forEach((o) => {
    const cents = (o.price * 100).toFixed(2);
    const percent = (o.price * 100).toFixed(0) + "%";text += • ${o.name}: ${percent} (${cents}¢)\n;
  });
  text += Total Volume: $${(market.volume || 0).toLocaleString()};
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

bot.onText(/\/current nyc/i, async (msg) => {
  const market = await fetchMarket("NYC");
  if (!market) return bot.sendMessage(msg.chat.id, "❌ No market found for NYC today.");
  const top3 = market.outcomes.sort((a, b) => b.price - a.price).slice(0, 3);
  let text = *NYC Top 3 Options (${getTodayDate()})*\n;
  top3.forEach((o) => {
    const cents = (o.price * 100).toFixed(2);
    const percent = (o.price * 100).toFixed(0) + "%";
    text += • ${o.name}: ${percent} (${cents}¢)\n;
  });
  text += Total Volume: $${(market.volume || 0).toLocaleString()};
  bot.sendMessage(msg.chat.id, text, { parse_mode: "Markdown" });
});

console.log("✅ Bot running...");
