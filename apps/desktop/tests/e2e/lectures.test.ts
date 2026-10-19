import { DateTime } from 'luxon';
import { expect, it } from 'vitest';
import { launchIsolatedElectron } from './support/electron-app.js';

// Opt-in only: plain `npm test` must stay green in headless CI without Electron.
const e2e = process.env.CI_ELECTRON_E2E === '1' ? it : it.skip;

e2e(
  'attends the demo lecture and records a manual stop',
  async () => {
    const isolated = await launchIsolatedElectron();
    try {
      const page = await isolated.app.firstWindow();

      await page
        .getByRole('heading', { name: 'Online Lecture' })
        .waitFor({ state: 'visible' });
      await page.getByRole('button', { name: 'Начать' }).click();
      await page
        .getByRole('heading', { name: 'Вход в ТУСУР' })
        .waitFor({ state: 'visible' });
      await page.getByLabel('Логин').fill('student');
      await page.getByLabel('Пароль').fill('fake-password');
      await page.getByRole('button', { name: 'Войти' }).click();

      const current = page.getByText(
        /Сейчас идёт: Демонстрационная лекция, до \d{2}:\d{2}/,
      );
      await current.waitFor({ state: 'visible', timeout: 90_000 });
      await page
        .getByText('Состояние: подключено')
        .waitFor({ state: 'visible', timeout: 60_000 });

      await page.getByRole('button', { name: 'Остановить' }).click();

      const lastRun = page.getByText(
        /Последний запуск: Демонстрационная лекция — завершена, остановлено вручную/,
      );
      await lastRun.waitFor({ state: 'visible', timeout: 60_000 });
      expect(await lastRun.isVisible()).toBe(true);
      await page.getByRole('button', { name: 'Журнал' }).click();
      await page.getByRole('heading', { name: 'Журнал' }).waitFor();
      await page
        .getByRole('listitem')
        .filter({ hasText: 'Демонстрационная лекция' })
        .getByText('Завершена')
        .waitFor();
      await page.getByRole('button', { name: 'Ошибки' }).click();
      await page
        .getByRole('status')
        .filter({ hasText: 'Ошибок не найдено' })
        .waitFor();
    } finally {
      await isolated.close();
    }
  },
  240_000,
);

e2e(
  'shows a failed fake lecture in the journal',
  async () => {
    const isolated = await launchIsolatedElectron({
      ONLINE_LECTURE_FAKE_RUN_FAILURE: '1',
    });
    try {
      const page = await isolated.app.firstWindow();
      await page.getByRole('button', { name: 'Начать' }).click();
      await page.getByLabel('Логин').fill('student');
      await page.getByLabel('Пароль').fill('fake-password');
      await page.getByRole('button', { name: 'Войти' }).click();
      await page
        .getByText(/Последний запуск: Демонстрационная лекция — ошибка/)
        .waitFor({ state: 'visible', timeout: 90_000 });
      await page.getByRole('button', { name: 'Журнал' }).click();
      await page.getByRole('button', { name: 'Ошибки' }).click();
      await page
        .getByRole('listitem')
        .filter({ hasText: 'Демонстрационная лекция' })
        .getByText('Ошибка')
        .waitFor();
    } finally {
      await isolated.close();
    }
  },
  240_000,
);

e2e(
  'adds a manual pair and cancels an imported move in the fake session',
  async () => {
    const isolated = await launchIsolatedElectron({
      ONLINE_LECTURE_FAKE_EDIT_SCENARIO: '1',
    });
    try {
      const page = await isolated.app.firstWindow();
      await page.getByRole('button', { name: 'Начать' }).click();
      await page.getByLabel('Логин').fill('student');
      await page.getByLabel('Пароль').fill('fake-password');
      await page.getByRole('button', { name: 'Войти' }).click();
      await page
        .getByText('Будущая импортированная пара', { exact: true })
        .waitFor({ state: 'visible', timeout: 90_000 });

      const tomorrow = DateTime.now()
        .setZone('Asia/Krasnoyarsk')
        .plus({ days: 1 })
        .toISODate()!;
      await page.getByRole('button', { name: 'Добавить пару' }).click();
      await page.getByLabel('Курс СДО или ссылка на курс').fill('Демо');
      await page.getByRole('button', { name: 'Найти активность' }).click();
      await page
        .getByRole('button', { name: /Демонстрационная лекция/ })
        .click();
      await page.getByLabel('Название пары').fill('Моя ручная пара');
      await page
        .getByLabel('Дата', { exact: true })
        .fill(DateTime.fromISO(tomorrow).toFormat('dd.MM.yyyy'));
      await page.getByLabel('Вход').fill('12:00');
      await page.getByLabel('Выход').fill('13:00');
      await page.getByRole('button', { name: 'Сохранить пару' }).click();
      await page.getByText('Моя ручная пара').waitFor({ state: 'visible' });

      const source = page
        .getByRole('listitem')
        .filter({ hasText: 'Будущая импортированная пара' })
        .filter({ hasText: 'из расписания' });
      await source
        .getByRole('button', {
          name: 'Действия для пары: Будущая импортированная пара',
        })
        .click();
      await page.getByRole('menuitem', { name: 'Перенести' }).click();
      const movedDate = DateTime.now()
        .setZone('Asia/Krasnoyarsk')
        .plus({ days: 3 })
        .toFormat('dd.MM.yyyy');
      await page.getByLabel('Новая дата').fill(movedDate);
      await page.getByRole('button', { name: 'Сохранить перенос' }).click();

      const sourceActions = source.getByRole('button', {
        name: 'Действия для пары: Будущая импортированная пара',
      });
      await sourceActions.click();
      await page.getByRole('menuitem', { name: 'Вернуть' }).waitFor();
      await sourceActions.click();

      const replacement = page
        .getByRole('listitem')
        .filter({ hasText: 'вручную' })
        .filter({ hasText: 'перенос' });
      await replacement
        .getByText('Демонстрационная лекция', { exact: true })
        .waitFor();
      await replacement
        .getByRole('button', {
          name: 'Действия для пары: Демонстрационная лекция',
        })
        .click();
      await page.getByRole('menuitem', { name: 'Отменить перенос' }).click();

      const restoredSource = page
        .getByRole('listitem')
        .filter({ hasText: 'Будущая импортированная пара' })
        .filter({ hasText: 'из расписания' });
      await replacement.waitFor({ state: 'detached' });
      await source
        .getByRole('button', {
          name: 'Действия для пары: Будущая импортированная пара',
        })
        .waitFor({ state: 'visible' });
      expect(await restoredSource.count()).toBe(1);
      expect(await replacement.count()).toBe(0);
      await restoredSource
        .getByRole('button', {
          name: 'Действия для пары: Будущая импортированная пара',
        })
        .click();
      await page.getByRole('menuitem', { name: 'Пропустить' }).waitFor();
      await page
        .getByRole('button', {
          name: 'Действия для пары: Будущая импортированная пара',
        })
        .click();

      expect(await page.getByText('Моя ручная пара').isVisible()).toBe(true);

      const manualPair = page
        .getByRole('listitem')
        .filter({ hasText: 'Моя ручная пара' })
        .filter({ hasText: 'вручную' });
      await manualPair
        .getByRole('button', { name: 'Действия для пары: Моя ручная пара' })
        .click();
      await page.getByRole('menuitem', { name: 'Удалить' }).click();
      await page.getByRole('dialog', { name: 'Удалить пару?' }).waitFor();
      await page.getByRole('button', { name: 'Удалить пару' }).click();
      await manualPair.waitFor({ state: 'detached' });
      expect(await manualPair.count()).toBe(0);
    } finally {
      await isolated.close();
    }
  },
  240_000,
);
