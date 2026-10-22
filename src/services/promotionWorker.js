import cron from 'node-cron';
import Group from '../models/Group.js';
import Promotion from '../models/Promotion.js';
import Setting from '../models/Setting.js';

function randomDelayMs(delayMin, delayMax) {
  return (Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin) * 1000;
}

const delay = (milliseconds) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

function isBotRemovedError(error) {
  return (
    error?.error_code === 403 &&
    /bot was kicked|bot is not a member|bot was not a member/i.test(
      error.description ?? '',
    )
  );
}

async function sendPromotions(bot, state) {
  if (state.running) return;
  state.running = true;

  try {
    const setting = await Setting.findById('global');
    if (!setting?.isActive) return;

    const [promotions, groups] = await Promise.all([
      Promotion.find({ isActive: true }).sort({ createdAt: 1 }),
      Group.find({ status: 'ACTIVE', promotionsEnabled: true }).sort({ _id: 1 }),
    ]);

    if (promotions.length === 0 || groups.length === 0) return;

    let deliveryCount = 0;

    for (const [index, group] of groups.entries()) {
      const promotion = promotions[Math.floor(Math.random() * promotions.length)];
      let sent = false;

      try {
        await bot.api.sendMessage(group.chatId, promotion.text);
        deliveryCount += 1;
        sent = true;
      } catch (error) {
        console.error(
          `Failed to send promotion ${promotion.id} to group ${group.chatId}:`,
          error,
        );

        if (isBotRemovedError(error)) {
          await Group.updateOne(
            { _id: group._id },
            { $set: { status: 'KICKED', promotionsEnabled: false } },
          );
          console.info(`Marked group ${group.chatId} as KICKED after Telegram API error`);
        }
      }

      if (sent) {
        try {
          await Group.updateOne(
            { _id: group._id },
            { $set: { lastSentAt: new Date() } },
          );
        } catch (error) {
          console.error(
            `Failed to update lastSentAt for group ${group.chatId}:`,
            error,
          );
        }
      }

      if (index < groups.length - 1) {
        await delay(randomDelayMs(setting.delayMin, setting.delayMax));
      }
    }

    console.info(`Promotion run completed: ${deliveryCount}/${groups.length} sent`);
  } finally {
    state.running = false;
  }
}

export async function startPromotionScheduler(bot) {
  let scheduleTask;
  let activeSchedule;
  let synchronizing = false;
  const state = { running: false };

  const setting = await Setting.findById('global');
  if (!setting) {
    await Setting.create({ _id: 'global' });
  }

  async function synchronizeSchedule() {
    if (synchronizing) return;
    synchronizing = true;

    try {
      const currentSetting = await Setting.findById('global');
      if (!currentSetting) {
        throw new Error('Global bot settings are missing');
      }

      if (currentSetting.cronSchedule === activeSchedule) return;
      scheduleTask?.stop();
      scheduleTask = undefined;
      activeSchedule = currentSetting.cronSchedule;

      if (!cron.validate(activeSchedule)) {
        console.error(`Invalid cronSchedule in settings: ${activeSchedule}`);
        return;
      }

      scheduleTask = cron.schedule(
        activeSchedule,
        () => {
          void sendPromotions(bot, state).catch((error) => {
            console.error('Promotion worker failed:', error);
          });
        },
        { timezone: process.env.TZ || 'UTC' },
      );
    } finally {
      synchronizing = false;
    }
  }

  await synchronizeSchedule();

  const refreshInterval = setInterval(() => {
    void synchronizeSchedule().catch((error) => {
      console.error('Failed to refresh promotion schedule:', error);
    });
  }, 30_000);

  return {
    stop() {
      clearInterval(refreshInterval);
      scheduleTask?.stop();
    },
  };
}
