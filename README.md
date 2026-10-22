# Telegram Auto-Promosi Bot

Bot Node.js berbasis grammY yang menyimpan grup, promosi, dan pengaturan worker di MongoDB Atlas.

## Persiapan

- Node.js 20 atau lebih baru
- Token bot dari BotFather
- Cluster MongoDB Atlas dan database user dengan akses ke database proyek
- Telegram user ID admin bot

1. Isi `.env` (atau salin `.env.example`), lalu atur `BOT_TOKEN`, `ADMIN_IDS`, dan `MONGODB_URI`.
2. Pastikan alamat IP server diizinkan pada Network Access MongoDB Atlas.
3. Pasang dependensi dan jalankan bot:

   ```sh
   npm install
   npm start
   ```

`ADMIN_IDS` menerima satu atau beberapa Telegram user ID yang dipisahkan koma. Ganti semua nilai placeholder sebelum menjalankan bot. Jangan commit file `.env`.

Entry point bot adalah `src/bot.js`; koneksi MongoDB didefinisikan di `src/config/db.js`.

## Model database

- `Group`: `chatId`, `name`, `status` (`ACTIVE` atau `KICKED`), `lastSentAt`, dan `promotionsEnabled`.
- `Promotion`: `text` dan `isActive`.
- `Setting`: satu dokumen global dengan `delayMin`, `delayMax`, `cronSchedule`, dan `isActive`. Jeda dinyatakan dalam detik; default-nya 15–30 detik. Jadwal cron default-nya setiap jam.

Worker hanya mengirim promosi aktif ke grup berstatus `ACTIVE` yang memberi izin promosi. Setelah bot ditambahkan ke grup, admin grup perlu mengirim `/promos_on`; `/promos_off` mencabut izin. Ketika bot dikeluarkan, status grup menjadi `KICKED` dan izin promosi dicabut.

## Perintah Telegram

Kirim perintah admin lewat chat pribadi bot:

- `/admin_help`
- `/addgroup <chatId> | <nama>`, `/addpromo <teks>`, `/status`
- `/promo_add <teks iklan>`, `/promo_list`, `/promo_toggle <id> <on|off>`, `/promo_delete <id>`
- `/group_add <chat_id>`, `/group_list`, `/group_remove <chat_id>`
- `/settings`
- `/settings_delay <min_detik> <max_detik>`
- `/settings_cron <ekspresi_cron>`
- `/settings_toggle <on|off>`

Bot harus sudah menjadi anggota grup sebelum `/group_add` dapat mengambil informasi grup dari Telegram. Perintah untuk mengizinkan promosi hanya bisa dijalankan oleh admin grup.
