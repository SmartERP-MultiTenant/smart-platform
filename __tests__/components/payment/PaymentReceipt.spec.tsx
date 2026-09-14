/**
 * @jest-environment jsdom
 *
 * PG-23 — the order receipt.
 *
 * The whole point of this component is that it cannot invent a field, so the
 * tests are mostly about what it must NOT render: no empty row, and above all
 * no placeholder standing in for a value nobody confirmed. A receipt that
 * shows "—" for the amount reads as a receipt for zero, which is worse than a
 * receipt that shows no amount at all.
 */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import PaymentReceipt from '../../../components/payment/PaymentReceipt';
// Imported (not `require`d) so the mock factory below can resolve against the
// real English catalogue instead of echoing the key — the assertions then pin
// the actual customer-facing copy, notably the TRN. The `mock` name prefix is
// what lets a hoisted `jest.mock` factory close over it.
import mockEn from '../../../locales/en/common.json';

jest.mock('next-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, vars?: Record<string, unknown>) => {
      let out: string = (mockEn as Record<string, string>)[key] ?? key;
      if (vars) {
        for (const [name, value] of Object.entries(vars)) {
          out = out.split(`{{${name}}}`).join(String(value));
        }
      }
      return out;
    },
  }),
}));

const ORDER = 'pay-abc12345-1757851200000';

/** Anything that would read as a value we did not actually resolve. */
const PLACEHOLDERS = ['—', '–', '-', 'N/A', 'n/a', 'null', 'undefined', '0'];

describe('PG-23 — PaymentReceipt', () => {
  it('renders the order reference and the merchant tax identity', () => {
    render(<PaymentReceipt orderReference={ORDER} />);

    expect(screen.getByText('Order details')).toBeInTheDocument();
    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
    expect(screen.getByText('Order reference')).toBeInTheDocument();
    expect(screen.getByText(/310428442600003/)).toBeInTheDocument();
    expect(screen.getByText(/15% VAT/)).toBeInTheDocument();
  });

  it('renders the package name and monthly price when both resolved', () => {
    render(
      <PaymentReceipt
        orderReference={ORDER}
        packageName="Gold"
        amountMonthly={500}
      />
    );

    expect(screen.getByText('Package')).toBeInTheDocument();
    expect(screen.getByText('Gold')).toBeInTheDocument();
    expect(screen.getByText('Amount')).toBeInTheDocument();
    // Reuses the pricing page's existing currency convention verbatim.
    expect(screen.getByText('500 SAR / month')).toBeInTheDocument();
  });

  it('omits the package row entirely when nothing resolved', () => {
    render(<PaymentReceipt orderReference={ORDER} />);

    expect(screen.queryByText('Package')).not.toBeInTheDocument();
  });

  it('omits the package row for a blank or whitespace-only name', () => {
    const { rerender } = render(
      <PaymentReceipt orderReference={ORDER} packageName="" />
    );
    expect(screen.queryByText('Package')).not.toBeInTheDocument();

    rerender(<PaymentReceipt orderReference={ORDER} packageName="   " />);
    expect(screen.queryByText('Package')).not.toBeInTheDocument();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['zero', 0],
    ['negative', -1],
  ])('omits the amount row when the price is %s', (_label, amountMonthly) => {
    render(
      <PaymentReceipt
        orderReference={ORDER}
        amountMonthly={amountMonthly as number | null | undefined}
      />
    );

    expect(screen.queryByText('Amount')).not.toBeInTheDocument();
    expect(screen.queryByText(/SAR \/ month/)).not.toBeInTheDocument();
  });

  it('never renders a placeholder in place of an unresolved field', () => {
    const { container } = render(<PaymentReceipt orderReference={ORDER} />);

    // Only the order row exists — no second row standing in for a value.
    expect(container.querySelectorAll('dt')).toHaveLength(1);
    expect(container.querySelectorAll('dd')).toHaveLength(1);

    for (const placeholder of PLACEHOLDERS) {
      // The reference itself contains digits, so compare on the text nodes of
      // the value cells rather than the whole container.
      const cells = Array.from(container.querySelectorAll('dd')).map((node) =>
        node.textContent?.trim()
      );
      expect(cells).not.toContain(placeholder);
    }
  });

  it('exposes the receipt as a description list of label/value pairs', () => {
    const { container } = render(
      <PaymentReceipt
        orderReference={ORDER}
        packageName="Gold"
        amountMonthly={500}
      />
    );

    expect(container.querySelector('dl')).not.toBeNull();
    const terms = container.querySelectorAll('dt');
    const descriptions = container.querySelectorAll('dd');

    expect(terms).toHaveLength(3);
    expect(descriptions).toHaveLength(3);
    // Every dt has a sibling dd, so no label is announced without its value.
    terms.forEach((term, index) => {
      expect(term.nextElementSibling).toBe(descriptions[index]);
    });
  });

  it('labels the section so assistive technology can name it', () => {
    render(<PaymentReceipt orderReference={ORDER} />);

    expect(
      screen.getByRole('region', { name: 'Order details' })
    ).toBeInTheDocument();
  });

  it('hides the tax block for a payment that never completed', () => {
    render(
      <PaymentReceipt orderReference={ORDER} showTaxInformation={false} />
    );

    expect(screen.queryByText(/310428442600003/)).not.toBeInTheDocument();
    expect(screen.queryByText(/15% VAT/)).not.toBeInTheDocument();
    // The reference is still shown: it is what support needs to trace.
    expect(screen.getByTestId('receipt-order-reference')).toHaveTextContent(
      ORDER
    );
  });
});
