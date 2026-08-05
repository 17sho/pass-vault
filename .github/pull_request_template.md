## Summary

- What changed?
- Why is it needed?

## Scope

- [ ] Frontend
- [ ] Linux/SQLite backend
- [ ] Cloudflare Worker/D1/R2 backend
- [ ] Shared contract or crypto boundary
- [ ] Tests
- [ ] Documentation

## Security and data boundary

- [ ] No plaintext vault data, vault keys, credentials, production identifiers, or secrets are introduced.
- [ ] Session generation / lock / account-switch behavior was considered.
- [ ] Attachment and backup behavior was considered if relevant.

## Verification

- [ ] `npm run lint`
- [ ] `npm run lint:docs`
- [ ] `npm run typecheck`
- [ ] `npm run build`
- [ ] `npm test`
- [ ] `git diff --check`

## Notes

Add screenshots, benchmarks, migration notes, or known limitations. Redact all sensitive values.
