const fs = require("fs");
const path = require("path");
const express = require("express");
const cron = require("node-cron");
const nodemailer = require("nodemailer");
require("dotenv").config();

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT || 3000);
const TIMEZONE = process.env.TZ || "America/Sao_Paulo";
const DAILY_CRON = process.env.DAILY_CRON || "0 7 * * *";
const AGENDA_FILE = process.env.AGENDA_FILE
  ? path.resolve(process.env.AGENDA_FILE)
  : path.join(__dirname, "agenda.json");

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const TIME_REGEX = /^([01]\d|2[0-3]):([0-5]\d)$/;

function isValidDateFormat(value) {
  if (typeof value !== "string" || !DATE_REGEX.test(value)) {
    return false;
  }

  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidTimeFormat(value) {
  if (value === undefined || value === null || value === "") {
    return true;
  }

  return typeof value === "string" && TIME_REGEX.test(value);
}

function readAgenda() {
  if (!fs.existsSync(AGENDA_FILE)) {
    return { activities: [] };
  }

  const raw = fs.readFileSync(AGENDA_FILE, "utf-8");
  const parsed = JSON.parse(raw);

  if (!Array.isArray(parsed.activities)) {
    return { activities: [] };
  }

  return parsed;
}

function writeAgenda(agenda) {
  fs.writeFileSync(AGENDA_FILE, JSON.stringify(agenda, null, 2) + "\n", "utf-8");
}

function getTodayString() {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });

  return formatter.format(now);
}

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || "false").toLowerCase() === "true";
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass }
  });
}

function buildDailySummary(date) {
  const agenda = readAgenda();
  const todayActivities = agenda.activities
    .filter((item) => item.date === date)
    .sort((a, b) => (a.time || "").localeCompare(b.time || ""));

  if (todayActivities.length === 0) {
    const text = `Bom dia!\n\nNao ha atividades cadastradas para ${date}.`;
    const html = `<p>Bom dia!</p><p>Nao ha atividades cadastradas para <strong>${date}</strong>.</p>`;

    return { text, html, count: 0 };
  }

  const lines = todayActivities.map((item, index) => {
    const time = item.time ? `${item.time} - ` : "";
    const description = item.description ? ` (${item.description})` : "";
    return `${index + 1}. ${time}${item.title}${description}`;
  });

  const text = `Bom dia!\n\nAtividades para ${date}:\n\n${lines.join("\n")}`;
  const htmlItems = todayActivities
    .map((item) => {
      const time = item.time ? `<strong>${item.time}</strong> - ` : "";
      const description = item.description ? ` <em>(${item.description})</em>` : "";
      return `<li>${time}${item.title}${description}</li>`;
    })
    .join("");

  const html = `<p>Bom dia!</p><p>Atividades para <strong>${date}</strong>:</p><ol>${htmlItems}</ol>`;

  return { text, html, count: todayActivities.length };
}

async function sendDailyEmail(date = getTodayString()) {
  const to = process.env.SMTP_TO;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  const transporter = getTransporter();

  if (!to || !from || !transporter) {
    throw new Error("SMTP nao configurado. Defina SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM e SMTP_TO no .env");
  }

  const { text, html, count } = buildDailySummary(date);

  const info = await transporter.sendMail({
    from,
    to,
    subject: `Agenda do dia - ${date}`,
    text,
    html
  });

  return { messageId: info.messageId, count, date };
}

async function sendTestEmailWithEthereal(date = getTodayString()) {
  const account = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: account.smtp.host,
    port: account.smtp.port,
    secure: account.smtp.secure,
    auth: {
      user: account.user,
      pass: account.pass
    }
  });

  const to = process.env.TEST_EMAIL_TO || "teste@exemplo.com";
  const from = `Agenda Bot <${account.user}>`;
  const { text, html, count } = buildDailySummary(date);

  const info = await transporter.sendMail({
    from,
    to,
    subject: `[TESTE] Agenda do dia - ${date}`,
    text,
    html
  });

  return {
    messageId: info.messageId,
    previewUrl: nodemailer.getTestMessageUrl(info),
    count,
    date,
    to
  };
}

app.get("/health", (req, res) => {
  res.json({ ok: true, timezone: TIMEZONE, cron: DAILY_CRON });
});

app.get("/agenda", (req, res) => {
  const agenda = readAgenda();
  const date = req.query.date;

  if (!date) {
    return res.json(agenda.activities);
  }

  if (!isValidDateFormat(String(date))) {
    return res.status(400).json({ error: "Formato de date invalido. Use YYYY-MM-DD" });
  }

  const filtered = agenda.activities.filter((item) => item.date === date);
  return res.json(filtered);
});

app.get("/agenda/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido" });
  }

  const agenda = readAgenda();
  const item = agenda.activities.find((activity) => activity.id === id);

  if (!item) {
    return res.status(404).json({ error: "Compromisso nao encontrado" });
  }

  return res.json(item);
});

app.post("/agenda", (req, res) => {
  const { title, date, time, description } = req.body;

  if (!title || !date) {
    return res.status(400).json({ error: "Campos obrigatorios: title e date (YYYY-MM-DD)" });
  }

  if (!isValidDateFormat(date)) {
    return res.status(400).json({ error: "Formato de date invalido. Use YYYY-MM-DD" });
  }

  if (!isValidTimeFormat(time)) {
    return res.status(400).json({ error: "Formato de time invalido. Use HH:mm (00:00 a 23:59)" });
  }

  const agenda = readAgenda();
  const nextId = agenda.activities.reduce((max, item) => Math.max(max, item.id || 0), 0) + 1;

  const newItem = {
    id: nextId,
    title,
    date,
    time: time || "",
    description: description || ""
  };

  agenda.activities.push(newItem);
  writeAgenda(agenda);

  return res.status(201).json(newItem);
});

app.put("/agenda/:id", (req, res) => {
  const id = Number(req.params.id);
  const { title, date, time, description } = req.body;

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido" });
  }

  if (!title || !date) {
    return res.status(400).json({ error: "Campos obrigatorios: title e date (YYYY-MM-DD)" });
  }

  if (!isValidDateFormat(date)) {
    return res.status(400).json({ error: "Formato de date invalido. Use YYYY-MM-DD" });
  }

  if (!isValidTimeFormat(time)) {
    return res.status(400).json({ error: "Formato de time invalido. Use HH:mm (00:00 a 23:59)" });
  }

  const agenda = readAgenda();
  const index = agenda.activities.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Compromisso nao encontrado" });
  }

  const updatedItem = {
    id,
    title,
    date,
    time: time || "",
    description: description || ""
  };

  agenda.activities[index] = updatedItem;
  writeAgenda(agenda);

  return res.json(updatedItem);
});

app.delete("/agenda/:id", (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: "ID invalido" });
  }

  const agenda = readAgenda();
  const index = agenda.activities.findIndex((item) => item.id === id);

  if (index === -1) {
    return res.status(404).json({ error: "Compromisso nao encontrado" });
  }

  const [removed] = agenda.activities.splice(index, 1);
  writeAgenda(agenda);

  return res.json({ ok: true, removed });
});

app.post("/agenda/enviar-resumo-hoje", async (req, res) => {
  try {
    const result = await sendDailyEmail();
    return res.json({ ok: true, ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

app.post("/agenda/testar-email", async (req, res) => {
  try {
    const result = await sendTestEmailWithEthereal();
    return res.json({ ok: true, mode: "ethereal", ...result });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error.message });
  }
});

function startServer() {
  app.listen(PORT, () => {
    console.log(`Agenda API rodando em http://localhost:${PORT}`);
    console.log(`Resumo diario agendado em '${DAILY_CRON}' (${TIMEZONE})`);
  });

  cron.schedule(
    DAILY_CRON,
    async () => {
      try {
        const result = await sendDailyEmail();
        console.log(`[cron] E-mail enviado (${result.date}) id=${result.messageId}`);
      } catch (error) {
        console.error(`[cron] Falha ao enviar e-mail diario: ${error.message}`);
      }
    },
    { timezone: TIMEZONE }
  );
}

if (require.main === module) {
  startServer();
}

module.exports = app;
