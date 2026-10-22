import cron from 'node-cron';
import { GrammyError } from 'grammy';
import mongoose from 'mongoose';
import Group from '../models/Group.js';
import Promotion from '../models/Promotion.js';
import Setting from '../models/Setting.js';

function parseAdminIds() {
  const value = process.env.ADMIN_IDS;
  if (!value) {
    throw new Error('ADMIN_IDS is required; set comma-separated Telegram user IDs');
  }

  const ids = value
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0 || ids.some((id) => !/^\d+$/.test(id))) {
    throw new Error('ADMIN_IDS must contain comma-separated numeric Telegram user IDs');
  }

  return new Set(ids);
}

function registerAdminCommand(bot, command, adminIds, handler) {
  bot.command(command, async (ctx) => {
    if (!ctx.from || !adminIds.has(String(ctx.from.id))) {
      await ctx.reply('Akses ditolak. Perintah ini khusus admin bot.');
      return;
    }

    await handler(ctx);
  });
}

function getCommandArgs(ctx) {
  return typeof ctx.match === 'string' ? ctx.match.trim() : '';
}

function parseGroupChatId(value) {
  const chatId = value.trim();
  return /^-?\d+$/.test(chatId) ? chatId : null;
}

async function getGlobalSetting() {
  let setting = await Setting.findById('global');
  if (!setting) setting = await Setting.create({ _id: 'global' });
  return setting;
}

export function registerAdminCommands(bot) {
  const adminIds = parseAdminIds();

  registerAdminCommand(bot, 'admin_help', adminIds, async (ctx) => {
    await ctx.reply(
      [
        'Perintah admin:',
        '/promo_add <teks iklan>',
        '/promo_list',
        '/promo_toggle <id> <on|off>',
        '/promo_delete <id>',
        '/addgroup <chatId> | <nama>',
        '/group_add <chat_id>',
        '/group_list',
        '/group_remove <chat_id>',
        '/addpromo <teks>',
        '/status',
        '/settings',
        '/settings_delay <min_detik> <max_detik>',
        '/settings_cron <ekspresi_cron>',
        '/settings_toggle <on|off>',
        '',
        'Grup harus memberikan izin dengan /promos_on sebelum menerima promosi.',
      ].join('\n'),
    );
  });

  registerAdminCommand(bot, 'promo_add', adminIds, async (ctx) => {
    const text = getCommandArgs(ctx);
    if (!text || text.length > 4096) {
      await ctx.reply('Format: /promo_add <teks iklan 1-4096 karakter>');
      return;
    }

    const promotion = await Promotion.create({ text });
    await ctx.reply(`Promosi dibuat.\nID: ${promotion.id}\nStatus: aktif`);
  });

  registerAdminCommand(bot, 'addpromo', adminIds, async (ctx) => {
    const text = getCommandArgs(ctx);
    if (!text || text.length > 4096) {
      await ctx.reply('Format: /addpromo <teks 1-4096 karakter>');
      return;
    }

    const promotion = await Promotion.create({ text });
    await ctx.reply(`Promosi dibuat.\nID: ${promotion.id}\nStatus: aktif`);
  });

  registerAdminCommand(bot, 'promo_list', adminIds, async (ctx) => {
    const promotions = await Promotion.find()
      .select('_id text isActive')
      .sort({ createdAt: -1 });

    if (promotions.length === 0) {
      await ctx.reply('Belum ada promosi.');
      return;
    }

    await ctx.reply(
      [
        'Daftar promosi:',
        ...promotions.map(
          (promotion) =>
            `${promotion.isActive ? 'AKTIF' : 'NONAKTIF'} | ${promotion.text.slice(0, 120)}\nID: ${promotion.id}`,
        ),
      ].join('\n'),
    );
  });

  registerAdminCommand(bot, 'promo_toggle', adminIds, async (ctx) => {
    const [id, state, ...extra] = getCommandArgs(ctx).split(/\s+/);
    if (
      extra.length > 0 ||
      !mongoose.isValidObjectId(id) ||
      !['on', 'off'].includes(state)
    ) {
      await ctx.reply('Format: /promo_toggle <id> <on|off>');
      return;
    }

    const promotion = await Promotion.findByIdAndUpdate(
      id,
      { $set: { isActive: state === 'on' } },
      { new: true, runValidators: true },
    );
    await ctx.reply(
      promotion
        ? `Promosi ${promotion.isActive ? 'diaktifkan' : 'dinonaktifkan'}.`
        : 'Promosi tidak ditemukan.',
    );
  });

  registerAdminCommand(bot, 'promo_delete', adminIds, async (ctx) => {
    const id = getCommandArgs(ctx);
    if (!mongoose.isValidObjectId(id)) {
      await ctx.reply('Format: /promo_delete <id>');
      return;
    }

    const promotion = await Promotion.findByIdAndDelete(id);
    await ctx.reply(
      promotion ? 'Promosi berhasil dihapus.' : 'Promosi tidak ditemukan.',
    );
  });

  registerAdminCommand(bot, 'group_add', adminIds, async (ctx) => {
    const chatId = parseGroupChatId(getCommandArgs(ctx));
    if (!chatId) {
      await ctx.reply('Format: /group_add <chat_id>');
      return;
    }

    let chat;
    try {
      chat = await bot.api.getChat(chatId);
    } catch (error) {
      if (!(error instanceof GrammyError)) throw error;

      await ctx.reply(
        'Grup tidak ditemukan atau bot belum dimasukkan ke grup tersebut.',
      );
      return;
    }

    if (chat.type !== 'group' && chat.type !== 'supergroup') {
      await ctx.reply('Chat tersebut bukan grup atau supergrup Telegram.');
      return;
    }

    const group = await Group.findOneAndUpdate(
      { chatId },
      {
        $set: {
          name: chat.title,
          status: 'ACTIVE',
        },
        $setOnInsert: { promotionsEnabled: false },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await ctx.reply(
      `Grup "${group.name}" didaftarkan. Persetujuan promosi: ${
        group.promotionsEnabled ? 'aktif' : 'belum diberikan'
      }.`,
    );
  });

  registerAdminCommand(bot, 'addgroup', adminIds, async (ctx) => {
    const [rawChatId, ...nameParts] = getCommandArgs(ctx).split('|');
    const chatId = parseGroupChatId(rawChatId.trim());
    const name = nameParts.join('|').trim();

    if (!chatId || !name || name.length > 255) {
      await ctx.reply('Format: /addgroup <chatId> | <nama>');
      return;
    }

    const group = await Group.findOneAndUpdate(
      { chatId },
      {
        $set: {
          name,
          status: 'ACTIVE',
        },
        $setOnInsert: { promotionsEnabled: false },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true },
    );

    await ctx.reply(
      `Grup "${group.name}" ditambahkan/diperbarui. Persetujuan promosi: ${
        group.promotionsEnabled ? 'aktif' : 'belum diberikan'
      }.`,
    );
  });

  registerAdminCommand(bot, 'group_list', adminIds, async (ctx) => {
    const groups = await Group.find()
      .select('chatId name status lastSentAt promotionsEnabled')
      .sort({ name: 1 });

    if (groups.length === 0) {
      await ctx.reply('Belum ada grup terdaftar.');
      return;
    }

    await ctx.reply(
      [
        'Daftar grup:',
        ...groups.map(
          (group) =>
            `${group.name} | ${group.chatId} | ${group.status} | promosi ${
              group.promotionsEnabled ? 'diizinkan' : 'belum diizinkan'
            } | terakhir: ${group.lastSentAt?.toISOString() ?? 'belum pernah'}`,
        ),
      ].join('\n'),
    );
  });

  registerAdminCommand(bot, 'group_remove', adminIds, async (ctx) => {
    const chatId = parseGroupChatId(getCommandArgs(ctx));
    if (!chatId) {
      await ctx.reply('Format: /group_remove <chat_id>');
      return;
    }

    const group = await Group.findOneAndDelete({ chatId });
    await ctx.reply(
      group ? `Grup "${group.name}" berhasil dihapus.` : 'Grup tidak ditemukan.',
    );
  });

  registerAdminCommand(bot, 'status', adminIds, async (ctx) => {
    const [activeGroups, activePromotions] = await Promise.all([
      Group.countDocuments({ status: 'ACTIVE' }),
      Promotion.countDocuments({ isActive: true }),
    ]);

    await ctx.reply(
      [
        'Ringkasan bot:',
        `Grup aktif: ${activeGroups}`,
        `Promosi aktif: ${activePromotions}`,
      ].join('\n'),
    );
  });

  registerAdminCommand(bot, 'settings', adminIds, async (ctx) => {
    const setting = await getGlobalSetting();
    await ctx.reply(
      [
        `Status worker: ${setting.isActive ? 'aktif' : 'nonaktif'}`,
        `Jadwal cron: ${setting.cronSchedule}`,
        `Jeda: ${setting.delayMin}-${setting.delayMax} detik`,
      ].join('\n'),
    );
  });

  registerAdminCommand(bot, 'settings_delay', adminIds, async (ctx) => {
    const args = getCommandArgs(ctx).split(/\s+/);
    const [minText, maxText, ...extra] = args;
    const delayMin = Number(minText);
    const delayMax = Number(maxText);

    if (
      !minText ||
      !maxText ||
      extra.length > 0 ||
      !Number.isInteger(delayMin) ||
      !Number.isInteger(delayMax) ||
      delayMin < 0 ||
      delayMax < delayMin
    ) {
      await ctx.reply('Format: /settings_delay <min_detik> <max_detik> (bilangan bulat >= 0)');
      return;
    }

    await Setting.findByIdAndUpdate(
      'global',
      { $set: { delayMin, delayMax } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await ctx.reply(`Jeda pengiriman diatur ke ${delayMin}-${delayMax} detik.`);
  });

  registerAdminCommand(bot, 'settings_cron', adminIds, async (ctx) => {
    const cronSchedule = getCommandArgs(ctx);
    if (!cronSchedule || !cron.validate(cronSchedule)) {
      await ctx.reply('Format: /settings_cron <ekspresi_cron_valid>');
      return;
    }

    await Setting.findByIdAndUpdate(
      'global',
      { $set: { cronSchedule } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await ctx.reply(`Jadwal pengiriman diperbarui: ${cronSchedule}`);
  });

  registerAdminCommand(bot, 'settings_toggle', adminIds, async (ctx) => {
    const state = getCommandArgs(ctx);
    if (!['on', 'off'].includes(state)) {
      await ctx.reply('Format: /settings_toggle <on|off>');
      return;
    }

    await Setting.findByIdAndUpdate(
      'global',
      { $set: { isActive: state === 'on' } },
      { upsert: true, new: true, runValidators: true, setDefaultsOnInsert: true },
    );
    await ctx.reply(`Worker promosi ${state === 'on' ? 'diaktifkan' : 'dinonaktifkan'}.`);
  });
}
