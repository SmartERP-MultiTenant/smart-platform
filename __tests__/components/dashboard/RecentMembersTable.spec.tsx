/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import RecentMembersTable from '@/components/dashboard/RecentMembersTable';
import type { DashboardMember } from '@/lib/dashboard';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'en' },
  }),
}));

const members: DashboardMember[] = [
  {
    id: '1',
    name: 'Ahmed Ali',
    email: 'ahmed@example.com',
    image: null,
    role: 'OWNER',
    createdAt: '2026-06-01T10:00:00.000Z',
  },
  {
    id: '2',
    name: 'Sara Hassan',
    email: 'sara@example.com',
    image: null,
    role: 'MEMBER',
    createdAt: '2026-07-15T10:00:00.000Z',
  },
];

describe('RecentMembersTable', () => {
  it('renders a row per member with name, email, role and joined date', () => {
    render(<RecentMembersTable members={members} viewAllHref={null} />);

    expect(screen.getByText('Ahmed Ali')).toBeInTheDocument();
    expect(screen.getByText('ahmed@example.com')).toBeInTheDocument();
    expect(screen.getByText('OWNER')).toBeInTheDocument();

    expect(screen.getByText('Sara Hassan')).toBeInTheDocument();
    expect(screen.getByText('sara@example.com')).toBeInTheDocument();
    expect(screen.getByText('MEMBER')).toBeInTheDocument();
  });

  it('renders the view-all link when a href is provided', () => {
    render(
      <RecentMembersTable members={members} viewAllHref="/teams/acme/members" />
    );

    const link = screen.getByRole('link', { name: 'view-all' });
    expect(link).toHaveAttribute('href', '/teams/acme/members');
  });

  it('renders an empty state when there are no members', () => {
    render(<RecentMembersTable members={[]} viewAllHref={null} />);

    expect(screen.getByText('no-recent-members')).toBeInTheDocument();
  });
});
