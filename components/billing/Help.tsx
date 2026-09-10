import Link from 'next/link';
import { ArrowTopRightOnSquareIcon } from '@heroicons/react/24/outline';
import { useTranslation } from 'next-i18next';

import { Card } from '@/components/shared';
import env from '@/lib/env';

const Help = () => {
  const { t } = useTranslation('common');

  // This card's copy states that our team is available to provide support, and
  // its only affordance is the contact link below. With no approved support URL
  // configured the whole card is omitted rather than left as a heading and
  // description promising a channel that does not exist. The link itself must
  // never render with an empty href: it is `target="_blank"`, so an unset URL
  // would open a new tab at the current page.
  if (!env.supportUrl) {
    return null;
  }

  return (
    <Card>
      <Card.Body>
        <Card.Header>
          <Card.Title>{t('need-anything-else')}</Card.Title>
          <Card.Description>{t('billing-assistance-message')}</Card.Description>
        </Card.Header>
        <div>
          <Link
            href={env.supportUrl}
            className="btn btn-primary btn-outline btn-sm"
            target="_blank"
            rel="noopener noreferrer"
          >
            {t('contact-support')}
            <ArrowTopRightOnSquareIcon className="w-5 h-5 ml-2" />
          </Link>
        </div>
      </Card.Body>
    </Card>
  );
};

export default Help;
