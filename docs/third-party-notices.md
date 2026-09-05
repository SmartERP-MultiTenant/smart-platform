# Third-Party Notices

This project adapts components from the following open-source projects:

## DashWind — daisyUI Admin Dashboard Template

- **Project:** DashWind (HTML) — `daisyui-admin-dashboard-template`
- **Source:** <https://github.com/robbins23/daisyui-admin-dashboard-template>
- **License:** MIT
- **Adapted for:** the team dashboard (`pages/teams/[slug]/dashboard.tsx`,
  `components/dashboard/*`) — stat cards (daisyUI `stats` markup), card/title
  layout, chart presentation patterns, table styling. Charts were re-implemented
  with ApexCharts (the project's own renderer) instead of Chart.js.

## DashWind — Admin Dashboard (Next.js + TypeScript variant)

- **Project:** `admin-dashboard-nextjs-typescript-daisyui`
- **Source:** <https://github.com/robbins23/admin-dashboard-nextjs-typescript-daisyui>
- **License:** MIT
- **Adapted for:** same dashboard above; used as a reference for component
  structure and dark-mode token handling.

## ApexCharts / react-apexcharts

- **Project:** ApexCharts (`apexcharts`) and `react-apexcharts`
- **Source:** <https://github.com/apexcharts/apexcharts.js> · <https://github.com/apexcharts/react-apexcharts>
- **License:** MIT
- **Used for:** donut (role distribution) and area (member growth) charts,
  rendered client-only via `next/dynamic({ ssr: false })`.
