import {
  aggregateRevenueData,
  calculateDaysRemaining,
  createDegradedRevenuePayload,
  deriveSubscriptionStatus,
  formatKsaDate,
} from '@/lib/adminRevenue';

describe('adminRevenue library', () => {
  const mockNow = new Date('2026-09-10T00:00:00.000Z');

  describe('deriveSubscriptionStatus', () => {
    it('returns Active for active subscription with future endDate', () => {
      const res = deriveSubscriptionStatus(
        'Active',
        false,
        '2026-10-10T00:00:00.000Z',
        mockNow
      );
      expect(res.status).toBe('Active');
      expect(res.isExpired).toBe(false);
      expect(res.isTrial).toBe(false);
    });

    it('returns Expired when endDate is in the past even if raw status is Active', () => {
      const res = deriveSubscriptionStatus(
        'Active',
        false,
        '2026-09-01T00:00:00.000Z',
        mockNow
      );
      expect(res.status).toBe('Expired');
      expect(res.isExpired).toBe(true);
    });

    it('returns Trial when isTrial is true and endDate is in future', () => {
      const res = deriveSubscriptionStatus(
        'Trial',
        true,
        '2026-09-20T00:00:00.000Z',
        mockNow
      );
      expect(res.status).toBe('Trial');
      expect(res.isTrial).toBe(true);
      expect(res.isExpired).toBe(false);
    });

    it('handles missing endDate gracefully without marking expired', () => {
      const res = deriveSubscriptionStatus('Active', false, null, mockNow);
      expect(res.status).toBe('Active');
      expect(res.isExpired).toBe(false);
    });
  });

  describe('calculateDaysRemaining', () => {
    it('calculates days remaining accurately', () => {
      const days = calculateDaysRemaining(
        '2026-09-15T00:00:00.000Z',
        mockNow
      );
      expect(days).toBe(5);
    });

    it('returns 0 for past dates', () => {
      const days = calculateDaysRemaining(
        '2026-09-05T00:00:00.000Z',
        mockNow
      );
      expect(days).toBe(0);
    });

    it('returns 0 for missing date', () => {
      expect(calculateDaysRemaining(null, mockNow)).toBe(0);
    });
  });

  describe('formatKsaDate', () => {
    it('formats date string in KSA locale', () => {
      const formatted = formatKsaDate('2026-09-10T12:00:00.000Z');
      expect(formatted).toBeTruthy();
      expect(typeof formatted).toBe('string');
    });

    it('returns null for null date', () => {
      expect(formatKsaDate(null)).toBeNull();
    });
  });

  describe('aggregateRevenueData', () => {
    it('aggregates raw subscriptions correctly and computes counts & MRR', () => {
      const rawData = [
        {
          id: 'tenant-1',
          tenantName: 'شركة النخبة',
          subdomain: 'nokhba',
          planName: 'باقة الشركات',
          priceMonthly: 500,
          status: 'Active',
          isTrial: false,
          endDate: '2026-10-10T00:00:00.000Z',
        },
        {
          id: 'tenant-2',
          tenantName: 'مؤسسة الأفق',
          subdomain: 'ofuq',
          planName: 'باقة الأعمال',
          priceMonthly: 300,
          status: 'Active',
          isTrial: false,
          endDate: '2026-11-10T00:00:00.000Z',
        },
        {
          id: 'tenant-3',
          tenantName: 'متجر الوفاء',
          subdomain: 'wafaa',
          planName: 'باقة التجربة',
          priceMonthly: 0,
          status: 'Trial',
          isTrial: true,
          endDate: '2026-09-14T00:00:00.000Z',
        },
        {
          id: 'tenant-4',
          tenantName: 'شركة الشرق',
          subdomain: 'sharq',
          planName: 'باقة التجربة',
          priceMonthly: 0,
          status: 'Trial',
          isTrial: true,
          endDate: '2026-09-12T00:00:00.000Z',
        },
        {
          id: 'tenant-5',
          tenantName: 'مؤسسة الرياض',
          subdomain: 'riyadh',
          planName: 'باقة أساسية',
          priceMonthly: 200,
          status: 'Active',
          isTrial: false,
          endDate: '2026-08-01T00:00:00.000Z', // Expired
        },
      ];

      const payload = aggregateRevenueData(rawData, 'erp-aggregate', mockNow);

      expect(payload.ok).toBe(true);
      expect(payload.counts.total).toBe(5);
      expect(payload.counts.active).toBe(2);
      expect(payload.counts.trial).toBe(2);
      expect(payload.counts.expired).toBe(1);
      expect(payload.mrr).toBe(800); // 500 + 300

      // Verify trial expirations are sorted by nearest endDate first (sharq 09-12 before wafaa 09-14)
      expect(payload.trialExpirations.length).toBe(2);
      expect(payload.trialExpirations[0].subdomain).toBe('sharq');
      expect(payload.trialExpirations[1].subdomain).toBe('wafaa');
    });

    it('handles empty or malformed data safely', () => {
      const payload = aggregateRevenueData(null, 'erp-aggregate', mockNow);
      expect(payload.ok).toBe(true);
      expect(payload.counts.total).toBe(0);
      expect(payload.counts.active).toBe(0);
      expect(payload.mrr).toBe(0);
      expect(payload.subscriptions).toEqual([]);
      expect(payload.trialExpirations).toEqual([]);
    });
  });

  describe('createDegradedRevenuePayload', () => {
    it('returns a valid fallback object with ok=false', () => {
      const degraded = createDegradedRevenuePayload('خادم الـ ERP غير متاح', mockNow);
      expect(degraded.ok).toBe(false);
      expect(degraded.error).toBe('خادم الـ ERP غير متاح');
      expect(degraded.counts.total).toBe(0);
      expect(degraded.mrr).toBe(0);
    });
  });
});
