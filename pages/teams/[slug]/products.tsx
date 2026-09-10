import type { GetServerSidePropsContext } from 'next';
import type { NextPageWithLayout } from 'types';

const Products: NextPageWithLayout = () => {
  return null;
};

export async function getServerSideProps(context: GetServerSidePropsContext) {
  const { slug } = context.query;

  return {
    redirect: {
      destination: slug ? `/teams/${slug}/dashboard` : '/dashboard',
      permanent: false,
    },
  };
}

export default Products;
