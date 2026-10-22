import 'dotenv/config';
import { Bot } from 'grammy';
import mongoose from 'mongoose';
import connectDatabase from './config/db.js';
import { registerAdminCommands } from './handlers/adminCommands.js';
import Group from './models/Group.js';
import { startPromotionScheduler } from './services/promotionWorker.js';

const botToken = process.env.BOT_TOKEN;
if (!botToken || botToken.startsWith('replace_with_')) {
  throw new Error('Set BOT_TOKEN to your Telegram bot token');
}

const bot = new Bot(botToken);
let scheduler;

bot.on('my_chat_member', async (ctx) => {
  if (!isGroupChat(ctx.chat)) return;

  const { status } = ctx.myChatMember.new_chat_member;
  const chatId = String(ctx.chat.id);

  if (status === 'left' || status === 'kicked') {
    await Group.findOneAndUpdate(
      { chatId },
      {
        $set: {
          name: ctx.chat.title,
          status: 'KICKED',
          promotionsEnabled: false,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.info(`Marked group ${chatId} as KICKED`);
    return;
  }

  if (status === 'member' || status === 'administrator') {
    await Group.findOneAndUpdate(
      { chatId: String(ctx.chat.id) },
      {
        $set: {
          promotionConsent: true,
          title: ctx.chat.title,
          name: ctx.chat.title,
          status: 'ACTIVE',
        },
        $setOnInsert: { promotionsEnabled: false },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );
    console.log(`Group ${chatId} registered automatically`);
  }
});

function isGroupChat(chat) {
  return chat.type === 'group' || chat.type === 'supergroup';
}

async function isGroupAdmin(ctx) {
  if (!ctx.from || !isGroupChat(ctx.chat)) return false;

  const member = await ctx.getChatMember(ctx.from.id);
  return member.status === 'administrator' || member.status === 'creator';
}

async function setGroupPromotionConsent(ctx, enabled) {
  if (!isGroupChat(ctx.chat)) {
    await ctx.reply('Perintah ini hanya dapat digunakan di grup.');
    return;
  }

  if (!(await isGroupAdmin(ctx))) {
    await ctx.reply('Hanya admin grup yang dapat mengubah pengaturan promosi.');
    return;
  }

  await Group.findOneAndUpdate(
    { chatId: String(ctx.chat.id) },
    {
      $set: {
        name: ctx.chat.title,
        status: 'ACTIVE',
        promotionsEnabled: enabled,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  await ctx.reply(
    enabled
      ? 'Promosi bot diaktifkan untuk grup ini.'
      : 'Promosi bot dinonaktifkan untuk grup ini.',
  );
}

bot.command('promos_on', (ctx) => setGroupPromotionConsent(ctx, true));
bot.command('promos_off', (ctx) => setGroupPromotionConsent(ctx, false));

bot.catch((error) => {
  console.error('Telegram bot update failed:', error);
});

async function main() {
  registerAdminCommands(bot);
  await connectDatabase();
  scheduler = await startPromotionScheduler(bot);
  await bot.start();
}

async function shutdown(signal) {
  console.info(`Received ${signal}; shutting down`);
  scheduler?.stop();
  bot.stop();
  await mongoose.disconnect();
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => {
    void shutdown(signal).catch((error) => {
      console.error('Shutdown failed:', error);
      process.exitCode = 1;
    });
  });
}

main().catch(async (error) => {
  console.error('Bot startup failed:', error);
  scheduler?.stop();
  await mongoose.disconnect();
  process.exitCode = 1;
});
