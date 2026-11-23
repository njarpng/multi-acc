require('dotenv').config();
const { Client } = require('discord.js-selfbot-v13');
const { joinVoiceChannel } = require('@discordjs/voice');
const express = require('express');

// Web server kecil agar Railway tetap menjaga aplikasi tetap hidup
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Service is running.'));
app.listen(PORT, () => console.log(`Keep-alive server aktif di port ${PORT}`));

// Ambil konfigurasi dari Environment Variables
const tokens = process.env.TOKENS ? process.env.TOKENS.split(',') : [];
const GUILD_ID = process.env.GUILD_IDS ? process.env.GUILD_IDS.split(',') : [];
const CHANNEL_ID = process.env.CHANNEL_IDS ? process.env.CHANNEL_IDS.split(',') : [];
const SELF_MUTE = process.env.SELF_MUTES ? process.env.SELF_MUTES.split(',') : [];  // default: true
const SELF_DEAF = process.env.SELF_DEAFS ? process.env.SELF_DEAFS.split(',') : []; // default: false
const TARGET_CHANNEL_ID = process.env.TARGET_CHANNEL_IDS ? process.env.TARGET_CHANNEL_IDS.split(',') : []; 
// ID Asli Jockie Music Bot (biasanya diawali 411916947773587456 atau varian premiumnya)
const JOCKIE_BOT_ID = process.env.JOCKIE_BOT_IDS ? process.env.JOCKIE_BOT_IDS.split(',') : [];
// Nomor akun (urutan di TOKENS, mulai dari 1) yang merespons Jockie. Default: akun #1
const RESPONDER_INDEXES = (process.env.RESPONDER_INDEXS ? process.env.RESPONDER_INDEXS.split(',') : [])
  .map((n) => parseInt(n.trim(), 10))
  .filter((n) => !Number.isNaN(n));
if (RESPONDER_INDEXES.length === 0) RESPONDER_INDEXES.push(1);

// Ambil nilai untuk akun ke-index; jika hanya satu nilai diisi, dipakai untuk semua akun
const pick = (list, index) => (list.length > 0 ? list[index] !== undefined ? list[index] : list[0] : undefined);
const toBool = (value, fallback) => (value === undefined || value === '' ? fallback : String(value).trim().toLowerCase() === 'true');

if (tokens.length === 0 || GUILD_ID.length === 0 || CHANNEL_ID.length === 0) {
  console.error('Error: Pastikan TOKENS, GUILD_ID, dan CHANNEL_ID sudah diisi di Environment Variables.');
  process.exit(1);
}

// Variabel penanda waktu untuk jeda 30 detik
let lastResponseTime = 0;
const COOLDOWN_MS = 30000; // 30 detik dalam milidetik

// Fungsi untuk menjalankan satu klien akun
function startClient(token, index) {
  const client = new Client({
    checkUpdate: false,
  });

  client.on('ready', async () => {
    console.log(`[Akun #${index + 1}] Login sebagai ${client.user.tag}`);

    try {
      const guildId = (pick(GUILD_ID, index) || '').trim();
      const channelId = (pick(CHANNEL_ID, index) || '').trim();
      const guild = await client.guilds.fetch(guildId);
      const channel = await guild.channels.fetch(channelId);

      if (!channel || !channel.isVoice()) {
        console.error(`[Akun #${index + 1}] Channel tidak ditemukan atau bukan voice channel.`);
        return;
      }

      joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        group: client.user.id, // grup unik per akun agar koneksi tidak saling menimpa
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: toBool(pick(SELF_DEAF, index), false), // Otomatis deafen
        selfMute: toBool(pick(SELF_MUTE, index), true), // Otomatis mute
      });

      console.log(`[Akun #${index + 1}] Berhasil masuk ke voice channel: ${channel.name}`);
    } catch (error) {
      console.error(`[Akun #${index + 1}] Gagal bergabung ke voice:`, error.message);
    }
  });

  client.on('messageCreate', async (message) => {
      // 0. Hanya satu akun yang boleh merespons
      if (!RESPONDER_INDEXES.includes(index + 1)) return;

      // 1. Pastikan pesan masuk di channel yang ditargetkan
      if (!TARGET_CHANNEL_ID.map((v) => v.trim()).includes(message.channel.id)) return;

      // 2. Pastikan pengirimnya adalah bot Jockie Music
      if (!JOCKIE_BOT_ID.map((v) => v.trim()).includes(message.author.id)) return;

      // 2b. Hanya merespons jika Jockie berada di voice channel yang sama dengan akun ini
      const myVoiceId = message.guild?.members?.me?.voice?.channelId;
      if (!myVoiceId) return;
      let jockieVoiceId = message.guild.members.cache.get(message.author.id)?.voice?.channelId;
      if (jockieVoiceId === undefined) {
        const m = await message.guild.members.fetch(message.author.id).catch(() => null);
        jockieVoiceId = m?.voice?.channelId;
      }
      if (jockieVoiceId !== myVoiceId) return;

      // 3. Periksa apakah pesan mengandung embed
      if (message.embeds.length === 0) return;

      // Ambil teks dari konten pesan biasa atau dari dalam deskripsi/title embed
      const contentText = message.content ? message.content.toLowerCase() : "";
      const embedTitle = message.embeds[0].title ? message.embeds[0].title.toLowerCase() : "";
      const embedDescription = message.embeds[0].description ? message.embeds[0].description.toLowerCase() : "";

      // 4. Periksa apakah ada teks "hey wake up" di pesan atau di embed
      const hasTriggerText = contentText.includes('hey wake up!') || 
                             embedTitle.includes('are you still here?') || 
                             embedDescription.includes('are you still here?');

      if (hasTriggerText) {
          const currentTime = Date.now();

          // 5. Cek apakah jeda 30 detik sudah terpenuhi
          if (currentTime - lastResponseTime >= COOLDOWN_MS) {
              // Berikan jeda variatif (1-3 detik) sebelum mengirim agar terlihat seperti manusia (mengurangi risiko ban)
              setTimeout(async () => {
                  try {
                      await message.channel.send('yes');
                      console.log(`[${new Date().toLocaleTimeString()}] [Akun #${index + 1}] Berhasil merespons Jockie Music.`);
                      lastResponseTime = Date.now(); // Perbarui waktu respons terakhir
                  } catch (error) {
                      console.error(`[Akun #${index + 1}] Gagal mengirim pesan:`, error);
                  }
              }, Math.floor(Math.random() * 2000) + 1000); 
          } else {
              const timeLeft = Math.ceil((COOLDOWN_MS - (currentTime - lastResponseTime)) / 1000);
              console.log(`Trigger terdeteksi, tetapi dilewati karena cooldown tersisa ${timeLeft} detik.`);
          }
      }
  });

  client.login(token.trim()).catch((err) => {
    console.error(`[Akun #${index + 1}] Gagal login (Token tidak valid atau diblokir):`, err.message);
  });
}

// Jalankan semua token secara bertahap dengan jeda untuk menghindari rate-limit
tokens.forEach((token, index) => {
  setTimeout(() => {
    startClient(token, index);
  }, index * 5000); // Jeda 5 detik antar akun
});
