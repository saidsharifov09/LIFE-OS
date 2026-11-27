// Формат резервной копии Life OS и шифрование паролем (WebCrypto: PBKDF2 + AES-GCM).
// Чистые функции без доступа к базе — работа с базой в src/actions/backup.ts.
import type { BaseRecord, Setting } from '@/db/types';
import { deriveKey, fromB64, PBKDF2_ITERATIONS, toB64 } from './crypto';

export const BACKUP_FORMAT = 1;

/** Открытая (незашифрованная) копия */
export interface Backup {
  app: 'life-os';
  format: number;
  /** Версия схемы БД, из которой сделана копия (см. docs/DATA.md) */
  schemaVersion: number;
  exportedAt: number;
  /** Записи по таблицам, включая удалённые в корзину */
  tables: Record<string, BaseRecord[]>;
  settings: Setting[];
}

/** Зашифрованная копия: внутри `data` — та же Backup в JSON */
export interface EncryptedBackup {
  app: 'life-os';
  format: number;
  encrypted: true;
  exportedAt: number;
  kdf: { name: 'PBKDF2'; hash: 'SHA-256'; iterations: number; salt: string };
  cipher: { name: 'AES-GCM'; iv: string };
  data: string;
}

/** Ключи настроек, которые относятся к устройству и не переносятся копией */
export const LOCAL_SETTING_KEYS = ['lastBackupAt', 'backupSnoozeUntil', 'lastSyncAt'];

export async function encryptBackup(b: Backup, password: string): Promise<EncryptedBackup> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, PBKDF2_ITERATIONS);
  const plain = new TextEncoder().encode(JSON.stringify(b));
  const data = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    app: 'life-os', format: BACKUP_FORMAT, encrypted: true, exportedAt: b.exportedAt,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: toB64(salt) },
    cipher: { name: 'AES-GCM', iv: toB64(iv) },
    data: toB64(data),
  };
}

export class WrongPasswordError extends Error {
  constructor() { super('Неверный пароль'); }
}

export async function decryptBackup(e: EncryptedBackup, password: string): Promise<Backup> {
  const key = await deriveKey(password, fromB64(e.kdf.salt), e.kdf.iterations);
  let plain: ArrayBuffer;
  try {
    plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromB64(e.cipher.iv) }, key, fromB64(e.data));
  } catch {
    // AES-GCM проверяет целостность: неверный пароль или повреждённый файл
    throw new WrongPasswordError();
  }
  return validateBackup(JSON.parse(new TextDecoder().decode(plain)));
}

export type ParsedFile =
  | { kind: 'plain'; backup: Backup }
  | { kind: 'encrypted'; encrypted: EncryptedBackup };

/** Разобрать текст файла копии. Бросает Error с понятным текстом. */
export function parseBackupFile(text: string): ParsedFile {
  let obj: unknown;
  try { obj = JSON.parse(text.replace(/^﻿/, '')); } catch { throw new Error('Это не файл копии Life OS (не JSON).'); }
  const o = obj as Partial<EncryptedBackup & Backup>;
  if (!o || o.app !== 'life-os') throw new Error('Это не файл копии Life OS.');
  if (typeof o.format !== 'number' || o.format > BACKUP_FORMAT) throw new Error('Копия сделана в более новой версии приложения. Обновите приложение.');
  if (o.encrypted) {
    if (!o.kdf?.salt || !o.cipher?.iv || typeof o.data !== 'string') throw new Error('Файл копии повреждён.');
    return { kind: 'encrypted', encrypted: o as EncryptedBackup };
  }
  return { kind: 'plain', backup: validateBackup(o) };
}

/** Проверить структуру и привести старую копию к текущей схеме */
export function validateBackup(o: unknown, currentSchema?: number): Backup {
  const b = o as Partial<Backup>;
  if (!b || b.app !== 'life-os' || typeof b.tables !== 'object' || !b.tables) throw new Error('Файл копии повреждён.');
  if (currentSchema !== undefined && (b.schemaVersion ?? 0) > currentSchema) {
    throw new Error('Копия сделана в более новой версии приложения. Обновите приложение.');
  }
  const tables: Record<string, BaseRecord[]> = {};
  for (const [name, rows] of Object.entries(b.tables)) {
    if (!Array.isArray(rows)) throw new Error(`Файл копии повреждён (таблица ${name}).`);
    tables[name] = rows.filter((r): r is BaseRecord => !!r && typeof r === 'object' && typeof (r as BaseRecord).id === 'string');
  }
  return {
    app: 'life-os',
    format: b.format ?? BACKUP_FORMAT,
    schemaVersion: b.schemaVersion ?? 1,
    exportedAt: b.exportedAt ?? 0,
    tables: migrateTables(tables, b.schemaVersion ?? 1),
    settings: Array.isArray(b.settings) ? b.settings.filter((s) => s && typeof s.key === 'string') : [],
  };
}

/**
 * Миграции данных копии между версиями схемы — те же шаги, что в db.ts upgrade().
 * v1 → v2: новые таблицы и необязательные поля, преобразование не нужно.
 * Новые шаги добавлять сюда: if (from < 3) { ... }
 */
function migrateTables(tables: Record<string, BaseRecord[]>, _from: number) {
  return tables;
}

/** Сводка копии для экрана «Восстановить»: сколько записей в разделах */
export function summarize(b: Backup): { label: string; count: number }[] {
  const names: Record<string, string> = {
    tasks: 'Задачи', events: 'События', inbox: 'Входящие', transactions: 'Операции', accounts: 'Счета',
    notes: 'Заметки', later: 'Посмотреть позже', log: 'История', budgets: 'Бюджеты', recurring: 'Платежи',
    debts: 'Долги', savings: 'Копилки',
  };
  return Object.entries(names)
    .map(([t, label]) => ({ label, count: (b.tables[t] ?? []).filter((r) => !r.deletedAt).length }))
    .filter((x) => x.count > 0);
}

export function backupFileName(date: string, encrypted: boolean) {
  return `life-os-${date}${encrypted ? '-zashifrovano' : ''}.json`;
}
