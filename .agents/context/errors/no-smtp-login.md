<!-- Context: errors/no-smtp-login | Priority: medium | Version: 1.1 | Updated: 2026-09-03 -->

# Login without SMTP (magic link never arrives)

**Symptom:** on a fresh setup, signing in with email shows "check your inbox" but no email is sent (SMTP env vars empty) — you can't get past login.

**Cause:** the default `email` provider (magic link) requires a working SMTP server; with `SMTP_HOST/PORT/USER/PASSWORD` empty, links are never delivered.

## Fix

Enable the **credentials** provider in `.env`:

```bash
AUTH_PROVIDERS=credentials
```

Now `/auth/join` (Create Account) accepts any email + password and logs you in directly — no email needed. Verify with:

```bash
curl -s http://localhost:4002/api/auth/providers   # → {"credentials":{...}}
```

## Notes

- Keep `CONFIRM_EMAIL=false` locally; switch to `email`/SMTP (or a mail catcher like MailHog) when testing invite/magic-link flows. With SMTP configured you must also set `EMAIL_ENABLED=true` — `lib/email/sendEmail.ts` gates every sender on it (e2e sets it to `false` via `.env.e2e`).
- Team invitations still create DB rows; accepting them requires being logged in (credentials works).
