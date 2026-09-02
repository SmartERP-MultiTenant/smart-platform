import type { ApexOptions } from 'apexcharts';

/*
 * Chart palette — single source of truth for every color used by the
 * dashboard charts. ApexCharts requires concrete hex values (it paints SVG
 * attributes; CSS custom properties do not apply), so each literal mirrors
 * the matching token in styles/tokens.css:
 *
 *   series[0]   : --ds-primary-600 (#2548D9)
 *   series[1]   : --ds-primary-400 (#5D8BFF)
 *   series[2]   : --ds-bronze-500  (#B8733A)
 *   axisText.dark  : --ds-gray-300 (#CBD5E1)
 *   axisText.light : --ds-gray-500 (#64748B)
 *   gridBorder.dark : --ds-gray-700 (#334155)
 *   gridBorder.light: --ds-gray-200 (#E2E8F0)
 *
 * Do not add colors outside this scale here.
 */
export const chartColors = {
  series: ['#2548D9', '#5D8BFF', '#B8733A'],
  axisText: { dark: '#CBD5E1', light: '#64748B' },
  gridBorder: { dark: '#334155', light: '#E2E8F0' },
} as const;

export const chartBaseOptions = (isDark: boolean): ApexOptions => ({
  chart: {
    toolbar: { show: false },
    foreColor: isDark ? chartColors.axisText.dark : chartColors.axisText.light,
    fontFamily: 'inherit',
  },
  dataLabels: { enabled: false },
  tooltip: { theme: isDark ? 'dark' : 'light' },
  grid: {
    borderColor: isDark
      ? chartColors.gridBorder.dark
      : chartColors.gridBorder.light,
  },
});
