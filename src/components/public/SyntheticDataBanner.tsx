import { getTranslations } from 'next-intl/server';
import { AlertCircle } from 'lucide-react';

/**
 * Inline notice rendered above any public page that surfaces synthetic
 * school names / records. The caller decides whether to show it based on
 * the `nameSynthetic` flag on the underlying School record(s):
 *   - List pages: show if any visible row has nameSynthetic === true.
 *   - Profile page: show only if that record has nameSynthetic === true.
 */
export async function SyntheticDataBanner({ scope }: { scope: 'list' | 'profile' }) {
  const t = await getTranslations('syntheticData');
  const title = t('title');
  const body = scope === 'profile' ? t('bodyProfile') : t('bodyList');

  return (
    <div className="mt-4 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600" aria-hidden />
      <div>
        <p className="font-medium">{title}</p>
        <p className="mt-1 text-amber-800">{body}</p>
      </div>
    </div>
  );
}
