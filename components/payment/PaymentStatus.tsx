import Link from 'next/link';
import type { ReactNode } from 'react';

interface PaymentStatusProps {
  variant: 'loading' | 'success' | 'failed' | 'error' | 'pending';
  title: string;
  message?: string;
  primaryLabel?: string;
  primaryHref?: string;
  /**
   * When provided, the primary CTA renders as a button that runs this handler
   * instead of a GET link — used for the ERP POST token handoff so the token
   * never reaches the URL bar/history. Never combine with `primaryHref`.
   */
  onPrimaryClick?: () => void;
  secondaryLabel?: string;
  secondaryHref?: string;
}

const icons: Record<
  PaymentStatusProps['variant'],
  { className: string; svg: ReactNode }
> = {
  pending: {
    className: 'bg-blue-100 text-blue-600',
    svg: (
      <svg
        className="h-12 w-12 animate-pulse"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
    ),
  },
  loading: {
    className: 'border-gray-300 text-gray-500',
    svg: (
      <svg className="h-12 w-12 animate-spin" fill="none" viewBox="0 0 24 24">
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        />
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
        />
      </svg>
    ),
  },
  success: {
    className: 'bg-green-100 text-green-600',
    svg: (
      <svg
        className="h-12 w-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
      </svg>
    ),
  },
  failed: {
    className: 'bg-red-100 text-red-600',
    svg: (
      <svg
        className="h-12 w-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M6 18L18 6M6 6l12 12"
        />
      </svg>
    ),
  },
  error: {
    className: 'bg-amber-100 text-amber-600',
    svg: (
      <svg
        className="h-12 w-12"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v2m0 4h.01m-6.9 5h13.8a1 1 0 00.9-1.4l-6.9-13a1 1 0 00-1.8 0l-6.9 13a1 1 0 00.9 1.4z"
        />
      </svg>
    ),
  },
};

/**
 * Dumb presentational panel for the payment callback pages (Arabic RTL).
 * Variants: loading | success | failed | error — CTAs are passed via props.
 */
const PaymentStatus = ({
  variant,
  title,
  message,
  primaryLabel,
  primaryHref,
  onPrimaryClick,
  secondaryLabel,
  secondaryHref,
}: PaymentStatusProps) => {
  const icon = icons[variant];
  const hasPrimaryCta = Boolean(
    primaryLabel && (onPrimaryClick || primaryHref)
  );

  return (
    <div className="mx-auto mt-10 max-w-md rounded-xl border bg-white p-8 text-center shadow-sm">
      <div
        className={`mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full ${icon.className}`}
      >
        {icon.svg}
      </div>

      <h2 className="text-xl font-bold text-gray-900">{title}</h2>

      {message && (
        <p className="mt-2 text-sm leading-6 text-gray-600">{message}</p>
      )}

      {((primaryLabel && hasPrimaryCta) || secondaryLabel) &&
        variant !== 'loading' && (
          <div className="mt-6 flex flex-col gap-3">
            {hasPrimaryCta &&
              (onPrimaryClick ? (
                <button
                  type="button"
                  className="btn btn-primary w-full text-sm"
                  onClick={onPrimaryClick}
                >
                  {primaryLabel}
                </button>
              ) : (
                <Link
                  href={primaryHref as string}
                  className="btn btn-primary w-full text-sm"
                >
                  {primaryLabel}
                </Link>
              ))}
            {secondaryLabel && secondaryHref && (
              <Link
                href={secondaryHref}
                className="btn btn-outline w-full text-sm"
              >
                {secondaryLabel}
              </Link>
            )}
          </div>
        )}
    </div>
  );
};

export default PaymentStatus;
