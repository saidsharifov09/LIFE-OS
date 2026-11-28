// Настройки → PIN-код: включить, сменить, выключить, когда блокировать.
import { useEffect, useState } from 'react';
import { KeyRound, Lock, ScanFace } from 'lucide-react';
import { biometryName, disableFaceId, enableFaceId, faceIdAvailable, faceIdEnabled } from '@/lib/faceid';
import { clearPin, getPinConfig, LOCK_AFTER_OPTIONS, setLockAfter, setPin, verifyPin } from '@/lib/pin';
import { Button, Card, Label, Segmented, Switch } from '@/ui/primitives';
import { Sheet, useToast } from '@/ui/overlay';
import { PinPad } from './PinPad';
import { usePinLock } from './PinLock';

type Flow = null | { step: 'old'; then: 'change' | 'off' } | { step: 'new' } | { step: 'repeat'; first: string };

export function PinCard() {
  const toast = useToast();
  const pinLock = usePinLock();
  const [cfg, setCfg] = useState(getPinConfig);
  const [flow, setFlow] = useState<Flow>(null);
  const [bioAvail, setBioAvail] = useState(false);
  const [bio, setBio] = useState(faceIdEnabled);
  useEffect(() => { void faceIdAvailable().then(setBioAvail); }, []);
  const reload = () => { setCfg(getPinConfig()); setBio(faceIdEnabled()); pinLock.refresh(); };
  const bioName = biometryName();
  const toggleBio = async (on: boolean) => {
    if (!on) { disableFaceId(); setBio(false); toast.show(`${bioName} выключен — вход по PIN`); return; }
    try {
      await enableFaceId();
      setBio(true);
      toast.show(`Вход по ${bioName} включён ✓`);
    } catch (e) {
      const name = (e as Error).name;
      toast.show(name === 'NotAllowedError' ? 'Отменено' : `Не получилось включить ${bioName}: ${(e as Error).message}`, { tone: 'error' });
    }
  };
  const close = () => setFlow(null);

  return (
    <Card title="PIN-код" icon={<KeyRound size={18} />}>
      <p className="text-sm text-muted">
        PIN закрывает приложение от посторонних глаз — например, если дали телефон другу.
        <b className="font-medium text-fg"> Это не шифрование:</b> данные на устройстве хранятся как и без PIN.
        Для настоящей защиты включите код-пароль iPhone и шифрование облака. PIN задаётся отдельно на каждом устройстве.
      </p>
      {!cfg ? (
        <Button className="mt-3" variant="primary" size="sm" icon={<Lock size={15} />} onClick={() => setFlow({ step: 'new' })}>Включить PIN</Button>
      ) : (
        <>
          <p className="mt-3 text-sm font-medium text-emerald-700 dark:text-emerald-300">PIN включён ✓ ({cfg.length} цифр)</p>
          <div className="mt-3">
            <Label>Блокировать, если приложение было свёрнуто</Label>
            <Segmented<string>
              value={String(cfg.lockAfter)}
              onChange={(v) => { setLockAfter(Number(v)); reload(); }}
              options={LOCK_AFTER_OPTIONS.map((m) => ({ value: String(m), label: m === 0 ? 'Сразу' : `${m} мин` }))}
            />
          </div>
          {bioAvail && (
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-[rgb(var(--line)/0.05)] px-3 py-2.5">
              <ScanFace size={20} className="shrink-0 text-accent-teal" />
              <div className="flex-1">
                <p className="font-medium">Входить по {bioName}</p>
                <p className="text-sm text-muted">Не получилось или отменили — вводите PIN, как обычно.</p>
              </div>
              <Switch checked={bio} onChange={toggleBio} label={`Входить по ${bioName}`} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={<Lock size={15} />} onClick={pinLock.lock}>Заблокировать сейчас</Button>
            <Button size="sm" variant="soft" onClick={() => setFlow({ step: 'old', then: 'change' })}>Сменить PIN</Button>
            <Button size="sm" variant="ghost" onClick={() => setFlow({ step: 'old', then: 'off' })}>Выключить</Button>
          </div>
        </>
      )}

      <Sheet open={!!flow} onClose={close} title={flow?.step === 'old' ? (flow.then === 'off' ? 'Выключить PIN' : 'Сменить PIN') : 'Новый PIN'}>
        <div className="py-2">
          {flow?.step === 'old' && cfg && (
            <PinPad key="old" length={cfg.length} title="Текущий PIN" hint="Чтобы подтвердить, что это вы"
              onSubmit={async (p) => {
                const r = await verifyPin(p);
                if (!r.ok) return r.waitMs ? `Пауза ${Math.ceil(r.waitMs / 1000)} с — слишком много попыток` : 'Неверный PIN';
                if (flow.then === 'off') { clearPin(); reload(); close(); toast.show('PIN выключен'); }
                else setFlow({ step: 'new' });
                return null;
              }} />
          )}
          {flow?.step === 'new' && (
            <PinPad key="new" title="Придумайте PIN" hint="От 4 до 6 цифр. Не дата рождения 🙂"
              onSubmit={(p) => { setFlow({ step: 'repeat', first: p }); return null; }} />
          )}
          {flow?.step === 'repeat' && (
            <PinPad key="repeat" length={flow.first.length} title="Повторите PIN" hint="Ещё раз, чтобы не ошибиться"
              onSubmit={async (p) => {
                if (p !== flow.first) { setTimeout(() => setFlow({ step: 'new' }), 900); return 'Не совпало — придумайте заново'; }
                await setPin(p);
                reload();
                close();
                toast.show('PIN включён. Запомните его!');
                return null;
              }} />
          )}
        </div>
      </Sheet>
    </Card>
  );
}
