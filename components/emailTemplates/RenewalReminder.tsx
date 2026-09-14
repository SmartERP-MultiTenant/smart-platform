import {
  Button,
  Container,
  Head,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components';
import EmailLayout from './EmailLayout';
import app from '@/lib/app';

interface RenewalReminderProps {
  name: string;
  team: string;
  subject: string;
  daysLeft: number;
  endDate?: string;
  renewUrl: string;
  /** Secondary CTA in the other supported language, when provided. */
  alternativeRenewUrl?: string;
  alternativeRenewLabel?: string;
}

const RenewalReminder = ({
  name,
  team,
  subject,
  daysLeft,
  endDate,
  renewUrl,
  alternativeRenewUrl,
  alternativeRenewLabel,
}: RenewalReminderProps) => {
  const isExpired = daysLeft <= 0;
  const isOneDay = daysLeft === 1;

  return (
    <Html dir="rtl" lang="ar">
      <Head />
      <Preview>{subject}</Preview>
      <EmailLayout>
        <Text
          style={{ fontSize: '18px', fontWeight: 'bold', margin: '0 0 16px 0' }}
        >
          مرحباً {name}،
        </Text>

        {isExpired ? (
          <Section
            style={{
              backgroundColor: '#fee2e2',
              border: '1px solid #f87171',
              borderRadius: '8px',
              padding: '16px',
              margin: '16px 0',
            }}
          >
            <Text
              style={{
                color: '#991b1b',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                fontSize: '16px',
              }}
            >
              ⚠️ انتهى اشتراك منشأتكم ({team})
            </Text>
            <Text style={{ color: '#7f1d1d', margin: 0, fontSize: '14px' }}>
              نود إشعاركم بأن فترة الاشتراك في {app.name} قد انتهت. لتجنب توقف
              خدمات الـ ERP ومتابعة أعمالكم دون انقطاع، يُرجى تجديد الاشتراك
              الآن.
            </Text>
          </Section>
        ) : isOneDay ? (
          <Section
            style={{
              backgroundColor: '#fef3c7',
              border: '1px solid #f59e0b',
              borderRadius: '8px',
              padding: '16px',
              margin: '16px 0',
            }}
          >
            <Text
              style={{
                color: '#92400e',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                fontSize: '16px',
              }}
            >
              ⏳ تذكير عاجل: ينتهي اشتراككم غداً!
            </Text>
            <Text style={{ color: '#78350f', margin: 0, fontSize: '14px' }}>
              يتبقى <b>يوم واحد فقط</b> على نهاية اشتراك منشأة <b>{team}</b> في
              منصة {app.name}
              {endDate ? ` (تاريخ الانتهاء: ${endDate})` : ''}.
            </Text>
          </Section>
        ) : (
          <Section
            style={{
              backgroundColor: '#eff6ff',
              border: '1px solid #60a5fa',
              borderRadius: '8px',
              padding: '16px',
              margin: '16px 0',
            }}
          >
            <Text
              style={{
                color: '#1e40af',
                fontWeight: 'bold',
                margin: '0 0 8px 0',
                fontSize: '16px',
              }}
            >
              📅 تذكير بقرب انتهاء الاشتراك ({daysLeft} أيام متبقية)
            </Text>
            <Text style={{ color: '#1e3a8a', margin: 0, fontSize: '14px' }}>
              نود تذكيركم بأنه يتبقى <b>{daysLeft} أيام</b> على انتهاء اشتراك
              منشأة <b>{team}</b> في منصة {app.name}
              {endDate ? ` (تاريخ الانتهاء: ${endDate})` : ''}.
            </Text>
          </Section>
        )}

        <Text style={{ margin: '16px 0', color: '#4b5563', fontSize: '14px' }}>
          يمكنكم تمديد وتجديد الاشتراك بخطوات بسيطة مباشرة عبر الضغط على الزر
          أدناه:
        </Text>

        <Container style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button
            href={renewUrl}
            style={{
              backgroundColor: '#2563eb',
              color: '#ffffff',
              fontWeight: '600',
              padding: '12px 28px',
              borderRadius: '6px',
              textDecoration: 'none',
              display: 'inline-block',
              fontSize: '15px',
            }}
          >
            تجديد الاشتراك الآن / Renew Now
          </Button>
        </Container>

        {alternativeRenewUrl && alternativeRenewLabel ? (
          <Text
            style={{
              fontSize: '12px',
              color: '#6b7280',
              margin: '0 0 8px 0',
              textAlign: 'center',
            }}
          >
            <Link
              href={alternativeRenewUrl}
              style={{ color: '#2563eb', textDecoration: 'underline' }}
            >
              {alternativeRenewLabel}
            </Link>
          </Text>
        ) : null}

        <Text
          style={{
            fontSize: '12px',
            color: '#9ca3af',
            margin: '24px 0 0 0',
            textAlign: 'center',
          }}
        >
          إذا كان لديك أي استفسار أو ترغب في مساعدة فريق الدعم، يمكنك التواصل
          معنا مباشرة.
        </Text>
      </EmailLayout>
    </Html>
  );
};

export default RenewalReminder;
