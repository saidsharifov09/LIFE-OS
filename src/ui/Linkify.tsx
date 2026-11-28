// Текст с кликабельными ссылками (переносы строк сохраняются). Открываются только http/https.
import { Fragment } from 'react';
import { linkLabel } from '@/lib/links';
import { cx } from '@/lib/format';

const SPLIT = /(\bhttps?:\/\/[^\s<>"'«»]+)/gi;

export function Linkify({ text, className }: { text: string; className?: string }) {
  const parts = text.split(SPLIT);
  return (
    <span className={cx('whitespace-pre-wrap break-words', className)}>
      {parts.map((p, i) => {
        if (i % 2 === 0) return <Fragment key={i}>{p}</Fragment>;
        const url = p.replace(/[.,;:!?…)]+$/, '');
        const tail = p.slice(url.length);
        return (
          <Fragment key={i}>
            <a href={url} target="_blank" rel="noopener noreferrer" className="text-sky-700 underline decoration-sky-400/40 underline-offset-2 dark:text-sky-300" onClick={(e) => e.stopPropagation()}>
              {linkLabel(url)}
            </a>
            {tail}
          </Fragment>
        );
      })}
    </span>
  );
}
