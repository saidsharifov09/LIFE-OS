// Настройки помощника: уровень (без ИИ / облачный ИИ / на устройстве), провайдер, согласие, проверка, код функции.
import { useEffect, useState } from 'react';
import { Copy, ExternalLink, Sparkles } from 'lucide-react';
import { Button, Card, Segmented } from '@/ui/primitives';
import { functionCode } from '@/sync/functions';
import { useToast } from '@/ui/overlay';
import {
  askCloud, cloudReady, CloudAiError, FAIL_TEXT, getAiSettings, PROVIDER_LABEL, setAiSettings,
  type AiLevel, type AiProvider, type AiSettings,
} from '@/ai/cloud';

const DOCS = 'https://github.com/saidsharifov09/LIFE-OS/blob/main/docs/SETUP-IPHONE.md';

export function AssistantCard() {
  const toast = useToast();
  const [s, setS] = useState<AiSettings>(getAiSettings);
  const [askConsent, setAskConsent] = useState(false);
  const [checking, setChecking] = useState(false);
  const [webgpu, setWebgpu] = useState<boolean | null>(null);
  useEffect(() => { setWebgpu(typeof navigator !== 'undefined' && 'gpu' in navigator); }, []);

  const save = (p: Partial<AiSettings>) => { setAiSettings(p); setS(getAiSettings()); };
  const level: AiLevel = s.level === 'cloud' && s.consent ? 'cloud' : s.level === 'device' ? 'device' : 'rules';
  const ready = cloudReady();

  const choose = (v: AiLevel) => {
    if (v === 'cloud' && !s.consent) { setAskConsent(true); return; }
    setAskConsent(false);
    save({ level: v });
  };

  const check = async () => {
    setChecking(true);
    try {
      const r = await askCloud('что у меня завтра?', s.provider);
      toast.show(`Облачный ИИ отвечает ✓${r.provider ? ` (${PROVIDER_LABEL[r.provider as AiProvider] ?? r.provider})` : ''}`);
    } catch (e) {
      toast.show(`Не работает: ${e instanceof CloudAiError ? e.message : FAIL_TEXT.error}`, { tone: 'error' });
    } finally {
      setChecking(false);
    }
  };

  const copyCode = async () => {
    try {
      const code = await functionCode();
      await navigator.clipboard.writeText(code);
      toast.show('Код функции скопирован — вставьте его в редактор функции в Supabase');
    } catch {
      toast.show('Не удалось скопировать — откройте инструкцию, там ссылка на файл', { tone: 'error' });
    }
  };

  return (
    <Card title="Помощник (ИИ-чат)" icon={<Sparkles size={18} />}>
      <p className="mb-3 text-sm text-muted">
        Кнопка ✨ рядом с быстрой записью. Помощник ничего не меняет сам: сначала показывает «Что я сделаю», выполняет после «Подтвердить», всё отменяется.
      </p>
      <Segmented<AiLevel>
        value={level}
        onChange={choose}
        options={[
          { value: 'rules', label: 'Без ИИ' },
          { value: 'cloud', label: 'Облачный ИИ' },
          { value: 'device', label: 'На устройстве' },
        ]}
      />

      {level === 'rules' && !askConsent && (
        <p className="mt-3 text-sm text-muted">Разбор фраз по шаблонам прямо на устройстве: работает офлайн, ничего никуда не отправляет. Понимает даты, время, суммы, «перенеси…», «что у меня…», «сколько потратил…».</p>
      )}

      {askConsent && (
        <div className="mt-3 rounded-2xl bg-amber-400/15 p-3 text-sm text-amber-950 dark:text-amber-50">
          <p className="font-semibold">Перед включением</p>
          <p className="mt-1">Текст ваших запросов к помощнику будет уходить через ваш проект Supabase стороннему ИИ-сервису (Groq, Google Gemini или OpenRouter). Ваши данные из приложения туда не отправляются — только сама фраза и сегодняшняя дата. Бесплатные сервисы могут использовать запросы для улучшения моделей — не пишите помощнику пароли и номера карт.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => { save({ level: 'cloud', consent: true }); setAskConsent(false); }}>Понимаю, включить</Button>
            <Button size="sm" variant="ghost" onClick={() => setAskConsent(false)}>Не сейчас</Button>
          </div>
        </div>
      )}

      {level === 'cloud' && (
        <div className="mt-3 space-y-3 text-sm">
          <p className="text-muted">
            Нужно: облако подключено (карточка «Облако»), в Supabase создана функция <code>life-os</code>, в её секретах — бесплатный ключ ИИ.
            Нет сети или закончился лимит — помощник сам переключится на разбор без ИИ и скажет об этом.
          </p>
          {ready && <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-amber-900 dark:text-amber-100">Сейчас не сработает: {FAIL_TEXT[ready]}.</p>}
          <label className="block">
            <span className="text-muted">Сервис ИИ</span>
            <select className="field mt-1 h-11" value={s.provider} onChange={(e) => save({ provider: e.target.value as AiProvider })}>
              <option value="auto">Авто — любой, для которого есть ключ</option>
              <option value="groq">Groq (Llama)</option>
              <option value="gemini">Google Gemini</option>
              <option value="openrouter">OpenRouter (бесплатные модели)</option>
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="soft" disabled={checking || !!ready} onClick={check}>{checking ? 'Проверяю…' : 'Проверить'}</Button>
            <Button size="sm" variant="soft" icon={<Copy size={14} />} onClick={copyCode}>Скопировать код функции</Button>
            <Button size="sm" variant="ghost" onClick={() => save({ consent: false, level: 'rules' })}>Выключить</Button>
          </div>
        </div>
      )}

      {level === 'device' && (
        <div className="mt-3 space-y-2 text-sm text-muted">
          <p>
            Пока не сделано — честно: маленькой модели в браузере нужно скачать 0,5–2 ГБ и много памяти видеокарты (WebGPU).
            На iPhone Safari может закрыть вкладку из-за нехватки памяти, а проверить на настоящем iPhone в облачной сессии нельзя.
            Подробности — в docs/AI.md. Сейчас работает разбор без ИИ.
          </p>
          <p>WebGPU в этом браузере: {webgpu === null ? '…' : webgpu ? 'есть' : 'нет'}.</p>
        </div>
      )}

      <a href={DOCS} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-sm text-sky-700 dark:text-sky-300">
        Как бесплатно подключить облачный ИИ с iPhone <ExternalLink size={13} />
      </a>
    </Card>
  );
}
