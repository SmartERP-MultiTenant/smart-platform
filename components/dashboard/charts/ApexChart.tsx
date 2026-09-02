import dynamic from 'next/dynamic';

/**
 * ApexCharts is client-only: loading it during SSR breaks Pages Router
 * hydration, so the module is resolved dynamically with ssr: false.
 */
const ApexChart = dynamic(
  () => import('react-apexcharts').then((module) => module.default),
  {
    ssr: false,
    loading: () => (
      <div className="h-72 w-full animate-pulse rounded bg-gray-100 dark:bg-gray-800" />
    ),
  }
);

export default ApexChart;
