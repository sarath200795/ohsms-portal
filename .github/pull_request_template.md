## Summary

<!-- 1–3 bullets describing what changed and why. -->

## Test plan

<!-- How did you verify this? -->
- [ ]
- [ ]

## Security checklist

<!-- Tick what applies. If you ticked any box, request a code-owner review. -->
- [ ] Touches `database.rules.json`, `storage.rules`, or `firebase.json`
- [ ] Touches `api/admin/**` or `api/v1.js`
- [ ] Touches `src/services/auth/**`, `src/services/db/**`, or `src/utils/permissions.js`
- [ ] Adds or changes a user-facing input that reaches Firebase / external APIs
- [ ] Stores attachments (base64 in RTDB is being phased out — use Firebase Storage)
- [ ] Adds a new third-party dependency
- [ ] Changes CSP, HSTS, or other security headers
- [ ] Logs personal data, IPs, or other sensitive fields

## Linked issue

<!-- Closes #123 -->
