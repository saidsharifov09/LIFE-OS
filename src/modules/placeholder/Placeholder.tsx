// Заглушка для разделов, которые ещё в разработке (см. ROADMAP.md)
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { NAV } from '@/app/nav';
import { Card, Empty, PageHeader } from '@/ui/primitives';

const PLANS: Record<string, string> = {
  '/goals': 'Цели с этапами и сроками, привычки с отметками, сериями и статистикой.',
  '/health': 'Сон, вода, тренировки, вес, самочувствие и настроение с графиками.',
  '/notes': 'Свои разделы, заметки с тегами, ссылками и изображениями, закрепление и архив. Заметки из «Входящих» уже сохраняются.',
  '/later': 'Ссылки, видео, фильмы и статьи со статусом «посмотрел». Записи из «Входящих» уже сохраняются.',
  '/people': 'Близкие, дни рождения с напоминанием, «что обсудить», последний контакт.',
  '/log': 'Лента дня: где был, что делал, с кем, что узнал, какие решения принял.',
  '/search': 'Поиск по всему приложению.',
};

export default function Placeholder() {
  const { pathname } = useLocation();
  const item = NAV.find((n) => n.path === pathname);
  return (
    <>
      <PageHeader title={item?.label ?? 'Раздел'} />
      <Card>
        <Empty
          icon={<Construction size={26} />}
          title={`Раздел появится на Этапе ${item?.stage ?? '?'}`}
          hint={PLANS[pathname] ?? 'Этот раздел в планах — см. ROADMAP.md.'}
        />
      </Card>
    </>
  );
}
