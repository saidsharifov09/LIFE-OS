// Публичный слой действий Life OS. Описание — docs/AI.md.
// Всё, что меняет данные, импортируйте отсюда.
export { runAction, undoLast, lastUndo, onUndoChange, restore, alive } from './core';
export * from './tasks';
export * from './events';
export * from './inbox';
export * from './money';
export * from './misc';
export * from './day';
export * from './backup';
