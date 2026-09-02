import {
  buildMemberGrowth,
  buildRoleCounts,
  monthKey,
} from '../../lib/dashboard';

/** First calendar day of the month `offset` months before `from`. */
const monthOffset = (from: Date, offset: number): Date =>
  new Date(from.getFullYear(), from.getMonth() - offset, 1);

describe('Lib - dashboard', () => {
  describe('monthKey', () => {
    it('formats a calendar month as YYYY-MM', () => {
      expect(monthKey(new Date(2026, 0, 15))).toBe('2026-01');
      expect(monthKey(new Date(2026, 11, 1))).toBe('2026-12');
    });
  });

  describe('buildMemberGrowth', () => {
    // Fixed reference clock so growth math never crosses a month boundary.
    const NOW = new Date(2026, 5, 15); // 15 June 2026, local time

    it('zero-fills the last 6 calendar months in chronological order', () => {
      const growth = buildMemberGrowth([], 6, NOW);

      expect(growth).toHaveLength(6);
      expect(growth.map((point) => point.month)).toEqual(
        [5, 4, 3, 2, 1, 0].map((offset) => monthKey(monthOffset(NOW, offset)))
      );
      expect(growth.every((point) => point.count === 0)).toBe(true);
    });

    it('counts members in their creation month', () => {
      const createdAt = new Date(NOW.getFullYear(), NOW.getMonth(), 15);
      const growth = buildMemberGrowth([createdAt], 6, NOW);

      expect(growth[growth.length - 1].month).toBe(monthKey(NOW));
      expect(growth[growth.length - 1].count).toBe(1);
    });

    it('ignores dates outside the window', () => {
      const old = new Date(2000, 0, 1);
      const growth = buildMemberGrowth([old], 6, NOW);

      expect(growth.every((point) => point.count === 0)).toBe(true);
    });
  });

  describe('buildRoleCounts', () => {
    it('aggregates roles in stable order and skips empty roles', () => {
      expect(buildRoleCounts(['OWNER', 'MEMBER', 'OWNER'])).toEqual([
        { role: 'OWNER', count: 2 },
        { role: 'MEMBER', count: 1 },
      ]);
    });

    it('returns an empty array when there are no members', () => {
      expect(buildRoleCounts([])).toEqual([]);
    });
  });
});
