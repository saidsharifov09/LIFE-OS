// Заглушка для разделов, которые ещё в разработке (см. ROADMAP.md)
import { useLocation } from 'react-router-dom';
import { Construction } from 'lucide-react';
import { NAV } from '@/app/nav';
import { Card, Empty, PageHeader } from '@/ui/primitives';

const PLANS: Record<string, string> = {
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
