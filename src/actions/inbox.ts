// Быстрый захват и разбор «Входящих»
import { db } from '@/db/db';
import type { InboxItem } from '@/db/types';
import { guessCategory } from '@/lib/categories';
import { today } from '@/lib/dates';
import { parseCapture } from '@/lib/parse';
import { insert, patch, runAction, softDelete } from './core';
import { addTask } from './tasks';
import { addEvent } from './events';
import { addExpense, addIncome } from './money';
import { addLater, addNote } from './notes';

/** Записать мысль во «Входящие» (3–5 секунд: написал → Enter) */
export function capture(text: string, demo?: boolean): Promise<InboxItem> {
  return runAction('Запись во входящие', () =>
    insert<InboxItem>('inbox', { text: text.trim(), hints: parseCapture(text), processed: false, demo }),
  );
}

export type InboxTarget = 'task' | 'event' | 'note' | 'expense' | 'income' | 'later';

export interface ProcessOptions {
  /** Применить распознанные подсказки (дату, время, сумму). По умолчанию — да. */
  useHints?: boolean;
  /** Переопределить название */
  title?: string;
}

/** Разобрать запись входящих в один тап */
export function processInbox(id: string, target: InboxTarget, opts: ProcessOptions = {}) {
  return runAction('Разбор входящих', async () => {
    const item = await db.inbox.get(id);
    if (!item) return null;
    const h = opts.useHints === false ? {} : item.hints ?? {};
    const title = opts.title ?? h.cleanText ?? item.text;
    let created: unknown = null;
    switch (target) {
      case 'task':
        created = await addTask({ title, date: h.date ?? null, time: h.time ?? null });
        break;
      case 'event':
        created = await addEvent({ title, date: h.date ?? today(), start: h.time ?? nextHour() });
        break;
      case 'note':
        created = await addNote({ title, body: title === item.text ? '' : item.text });
        break;
      case 'later':
        created = await addLater({ title: item.text });
        break;
      case 'expense':
      case 'income': {
        if (!h.amount) throw new Error('В записи нет суммы');
        const fn = target === 'income' ? addIncome : addExpense;
        created = await fn({
          amount: h.amount, currency: h.currency ?? 'RUB', date: h.date ?? today(), note: title,
          category: guessCategory(item.text, target),
        });
        break;
      }
    }
    await patch<InboxItem>('inbox', id, { processed: true });
    return created;
  });
}

export function deleteInbox(id: string) {
  return runAction('Удаление из входящих', () => softDelete('inbox', id));
}

export function updateInboxText(id: string, text: string) {
  return runAction('Правка входящих', () => patch<InboxItem>('inbox', id, { text, hints: parseCapture(text) }));
}

function nextHour() {
  const h = (new Date().getHours() + 1) % 24;
  return `${String(h).padStart(2, '0')}:00`;
}
