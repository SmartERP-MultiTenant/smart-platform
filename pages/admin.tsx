import { type ReactElement } from 'react';
import Head from 'next/head';
import { ApiError } from 'lib/errors';
import { requirePlatformAdmin } from 'lib/guardPlatformAdmin';
import type { NextPageWithLayout } from 'types';

const AdminPage: NextPageWithLayout<{ forbidden: boolean }> = ({
  forbidden,
}) => {
  return (
    // P5.2 placeholder — Arabic RTL shell per the funnel convention.
    // Dashboard content (tenants, subscriptions, ERP health) ships in P5.3.
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-white text-[var(--ds-text)]"
    >
      <Head>
        <title>لوحة تحكم المنصة — SMART PLATFORM</title>
      </Head>

      <main className="mx-auto max-w-2xl px-4 py-16">
        {forbidden ? (
          <>
            <h1 className="mb-2 text-center text-3xl font-bold">غير مصرّح</h1>
            <p className="text-center text-gray-600">
              هذه الصفحة مخصّصة لمشرفي المنصة فقط.
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-center text-3xl font-bold">
              لوحة التحكم — قيد التطوير
            </h1>
            <p className="text-center text-gray-600">
              محتوى لوحة تحكم مشرف المنصة (قائمة المستأجرين، حالة الاشتراكات،
              وصحة ERP) قادم في المهمة{' '}
              <a
                href="https://app.clickup.com/t/86cbbpypy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline"
              >
                P5.3
              </a>
              .
            </p>
          </>
        )}
      </main>
    </div>
  );
};

export const getServerSideProps = async (context) => {
  try {
    await requirePlatformAdmin(context.req, context.res);
  } catch (error) {
    // Not signed in — follow the existing login-redirect convention.
    if (error instanceof ApiError && error.status === 401) {
      return {
        redirect: {
          destination: `/auth/login?callbackUrl=${encodeURIComponent(
            context.resolvedUrl
          )}`,
          permanent: false,
        },
      };
    }

    // Signed in but not a platform admin: render a safe forbidden state.
    if (error instanceof ApiError && error.status === 403) {
      context.res.statusCode = 403;

      return {
        props: { forbidden: true },
      };
    }

    // Anything else is an unexpected failure (e.g. database outage) —
    // rethrow so it surfaces as a real 500 instead of a misleading 403.
    throw error;
  }

  return {
    props: { forbidden: false },
  };
};

AdminPage.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default AdminPage;
