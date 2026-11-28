// Переход «прямо к записи» по ссылке вида /#/tasks?open=<id> (из поиска, позже — из ИИ-чата).
// Обработчик вызывается, пока параметр есть в адресе; вернул false — данные ещё грузятся, попробуем
// на следующей отрисовке. После обработки параметр убирается из адреса (кнопка «Назад» не откроет снова).
import { useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';

/** alsoClear — другие параметры, которые убрать вместе с этим (например, date у календаря) */
export function useOpenParam(key: string, handle: (value: string, params: URLSearchParams) => boolean | void, alsoClear: string[] = []) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key);
  useEffect(() => {
    if (!value) return;
    if (handle(value, params) === false) return;
    const next = new URLSearchParams(params);
    next.delete(key);
    for (const k of alsoClear) next.delete(k);
    setParams(next, { replace: true });
  });
}
