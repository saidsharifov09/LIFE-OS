// Действия: люди — близкие, дни рождения, «что обсудить», последний контакт. Этап 6.
import { db } from '@/db/db';
import type { DateStr, Person, PersonTopic } from '@/db/types';
import { PALETTE } from '@/lib/categories';
import { today } from '@/lib/dates';
import { uid } from '@/lib/id';
import { contactDue, daysSinceContact, nextBirthday, validMmdd, type BirthdayInfo } from '@/lib/people';
import { alive, insert, patch, runAction, softDelete } from './core';

type PersonInput = Partial<Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'topics'>> & { name: string; topics?: string[] };

function clean(input: Partial<Person>): Partial<Person> {
  const out = { ...input };
  if ('birthday' in out) out.birthday = validMmdd(out.birthday) ? out.birthday : null;
  if ('birthYear' in out) out.birthYear = out.birthYear && out.birthYear > 1900 && out.birthYear <= 2100 ? Math.round(out.birthYear) : null;
  if ('contactEvery' in out) out.contactEvery = out.contactEvery && out.contactEvery > 0 ? Math.round(out.contactEvery) : null;
  if (typeof out.name === 'string') out.name = out.name.trim();
  return out;
}

export function addPerson(input: PersonInput) {
  return runAction('Новый человек', () => {
    const { topics, ...rest } = input;
    return insert<Person>('people', {
      color: PALETTE[0], ...clean(rest), name: input.name.trim() || 'Без имени',
      topics: (topics ?? []).filter((t) => t.trim()).map((text) => ({ id: uid(), text: text.trim(), done: false })),
    } as Person);
  });
}

export function updatePerson(id: string, changes: Partial<Person>) {
  return runAction('Изменение', () => patch<Person>('people', id, clean(changes)));
}

export function deletePerson(id: string) {
  return runAction('Удаление человека', () => softDelete('people', id));
}

/** Отметить «общались» (по умолчанию — сегодня) */
export function markContact(id: string, date: DateStr = today()) {
  return runAction('Последний контакт', () => patch<Person>('people', id, { lastContact: date }));
}

export function addTopic(personId: string, text: string) {
  return runAction('Что обсудить', async () => {
    const p = await db.people.get(personId);
    if (!p || !text.trim()) return undefined;
    const topic: PersonTopic = { id: uid(), text: text.trim(), done: false };
    await patch<Person>('people', personId, { topics: [...p.topics, topic] });
    return topic;
  });
}

export function toggleTopic(personId: string, topicId: string) {
  return runAction('Что обсудить', async () => {
    const p = await db.people.get(personId);
    if (!p) return undefined;
    return patch<Person>('people', personId, { topics: p.topics.map((t) => (t.id === topicId ? { ...t, done: !t.done } : t)) });
  });
}

export function removeTopic(personId: string, topicId: string) {
  return runAction('Что обсудить', async () => {
    const p = await db.people.get(personId);
    if (!p) return undefined;
    return patch<Person>('people', personId, { topics: p.topics.filter((t) => t.id !== topicId) });
  });
}

/** Все живые: избранные сверху, затем по имени */
export async function listPeople(): Promise<Person[]> {
  return (await db.people.toArray()).filter(alive).sort((a, b) => Number(!!b.favorite) - Number(!!a.favorite) || a.name.localeCompare(b.name, 'ru'));
}

/** Ближайшие дни рождения в пределах `days` дней (0 — сегодня), по порядку */
export async function upcomingBirthdays(days = 30, base: DateStr = today()): Promise<{ person: Person; next: BirthdayInfo }[]> {
  return (await listPeople())
    .map((person) => ({ person, next: nextBirthday(person, base) }))
    .filter((x): x is { person: Person; next: BirthdayInfo } => !!x.next && x.next.daysLeft <= days)
    .sort((a, b) => a.next.daysLeft - b.next.daysLeft);
}

/** Кому пора написать или позвонить: дольше всех без контакта — сверху */
export async function peopleToContact(base: DateStr = today()): Promise<{ person: Person; since: number | null }[]> {
  return (await listPeople())
    .filter((p) => contactDue(p, base))
    .map((person) => ({ person, since: daysSinceContact(person, base) }))
    .sort((a, b) => (b.since ?? 1e9) - (a.since ?? 1e9));
}
