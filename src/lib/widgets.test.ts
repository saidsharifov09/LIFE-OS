import { describe, expect, it } from 'vitest';
import { DEFAULT_WIDGETS, moveWidget, visibleWidgets, widgetOrder } from './widgets';

describe('виджеты главной', () => {
  it('без настроек — порядок по умолчанию', () => {
    expect(widgetOrder(undefined)).toEqual([...DEFAULT_WIDGETS]);
  });

  it('сохранённый порядок + новые виджеты в конец; мусор и дубли отбрасываются', () => {
    const o = widgetOrder(['money', 'quote', 'money', 'старый-виджет', 42]);
    expect(o.slice(0, 2)).toEqual(['money', 'quote']);
    expect(o).toHaveLength(DEFAULT_WIDGETS.length);
    expect(new Set(o).size).toBe(o.length);
  });

  it('скрытые не показываются', () => {
    const v = visibleWidgets(['quote', 'money'], ['quote', 'inbox']);
    expect(v[0]).toBe('money');
    expect(v).not.toContain('quote');
    expect(v).not.toContain('inbox');
  });

  it('сдвиг вверх/вниз и на краях', () => {
    const o = widgetOrder(undefined);
    expect(moveWidget(o, 'progress', -1).slice(0, 2)).toEqual(['progress', 'review']);
    expect(moveWidget(o, 'review', -1)).toBe(o);
    expect(moveWidget(o, 'quote', 1)).toBe(o);
  });
});
