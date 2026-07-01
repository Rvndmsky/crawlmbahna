// Login sekali ke Telegram -> cetak session string.
// Jalankan: npm run tg-login   (baca TG_API_ID / TG_API_HASH dari .env.local)
// Lalu salin string yang dicetak ke TG_SESSION di .env.local.

import { TelegramClient } from "telegram";
import { StringSession } from "telegram/sessions/index.js";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const apiId = Number(process.env.TG_API_ID);
const apiHash = process.env.TG_API_HASH;

if (!apiId || !apiHash) {
  console.error("TG_API_ID / TG_API_HASH belum di-set di .env.local");
  process.exit(1);
}

const rl = readline.createInterface({ input, output });
const client = new TelegramClient(new StringSession(""), apiId, apiHash, {
  connectionRetries: 3,
});

await client.start({
  phoneNumber: async () => rl.question("Nomor HP (mis. +628123...): "),
  password: async () => rl.question("Password 2FA (kalau ada): "),
  phoneCode: async () => rl.question("Kode OTP dari Telegram: "),
  onError: (err) => console.error(err),
});

console.log("\n=== LOGIN SUKSES ===");
console.log("Salin baris di bawah ke TG_SESSION di .env.local:\n");
console.log(client.session.save());
console.log("");

await client.disconnect();
await rl.close();
process.exit(0);
