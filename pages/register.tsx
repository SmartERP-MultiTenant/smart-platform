import { type ReactElement } from 'react';
import type { NextPageWithLayout } from 'types';
import { InferGetServerSidePropsType } from 'next';
import Head from 'next/head';

import { RegisterFunnel } from '@/components/erp/RegisterFunnel';
import env from '@/lib/env';

const Register: NextPageWithLayout<
  InferGetServerSidePropsType<typeof getServerSideProps>
> = ({ erpClientUrl, erpLoginPath, erpBaseDomain }) => {
  return (
    <div
      dir="rtl"
      lang="ar"
      className="min-h-screen bg-white text-[var(--ds-text)]"
    >
      <Head>
        <title>تسجيل شركة جديدة — SMART ERP</title>
      </Head>

      <main className="mx-auto max-w-2xl px-4 py-16">
        <h1 className="mb-2 text-center text-3xl font-bold">
          سجّل شركتك في SMART ERP
        </h1>
        <p className="mb-10 text-center text-gray-600">
          املأ البيانات وابدأ تجربتك المجانية خلال دقيقة
        </p>

        <RegisterFunnel
          erpClientUrl={erpClientUrl}
          erpLoginPath={erpLoginPath}
          erpBaseDomain={erpBaseDomain}
        />
      </main>
    </div>
  );
};

export const getServerSideProps = async () => {
  return {
    props: {
      erpClientUrl: env.erp.clientUrl,
      erpLoginPath: env.erp.clientLoginPath,
      erpBaseDomain: env.erp.baseDomain,
    },
  };
};

Register.getLayout = function getLayout(page: ReactElement) {
  return <>{page}</>;
};

export default Register;
