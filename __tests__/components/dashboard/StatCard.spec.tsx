/**
 * @jest-environment jsdom
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import StatCard from '@/components/dashboard/StatCard';

describe('StatCard', () => {
  it('renders title, value and description', () => {
    // Note: pass description as an expression — check-locale.js treats
    // double-quoted prop attribute strings as i18n key references.
    const description = '+3 this month';

    render(
      <StatCard title="Total Members" value={42} description={description} />
    );

    expect(screen.getByText('Total Members')).toBeInTheDocument();
    expect(screen.getByText('42')).toBeInTheDocument();
    expect(screen.getByText(description)).toBeInTheDocument();
  });

  it('renders a numeric zero value', () => {
    render(<StatCard title="Pending Invitations" value={0} />);

    expect(screen.getByText('Pending Invitations')).toBeInTheDocument();
    expect(screen.getByText('0')).toBeInTheDocument();
  });
});
