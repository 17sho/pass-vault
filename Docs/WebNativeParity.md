# Web → Native iOS parity matrix

Authoritative reference: `/root/pass-vault/public/` (45 product dialogs plus split `.mjs` modules).

Status legend: **native** = implemented locally; **partial** = local substrate exists but UI/flow differs; **backend** = no honest offline equivalent; **queued** = local implementation in progress.

| Reference capability | iOS status | Contract / treatment |
|---|---|---|
| Login, registration, invitation, cloud account | backend | Replaced by a device-local encrypted vault and master-password setup/unlock. |
| Current-device quick unlock | native substitute | Keychain + LocalAuthentication, with no server session. |
| Header add/favorites/more and five primary categories | native | Custom records remain secondary under Add/More, not a sixth top category. |
| Account, website, note, TOTP, attachment, custom records | partial | Core models/edit/detail are native; advanced custom conditional field types and note image ordering remain to close. |
| Global search | native | Local search excludes passwords, TOTP secrets, and secret custom fields; results open the real native detail flow. |
| Tags | native | Encrypted registry with create/color/rename+merge/delete/reorder and usage counts. |
| Per-type groups | native | Encrypted per-kind registry with create/rename/delete/reorder, UUID-backed references, and legacy-name migration. |
| Favorites and pinning | native | States and per-kind manual pin order persist encrypted; direct and batch actions are available. |
| Batch group/tag/pin/trash operations | native | Filter-aware selection supports group, add/remove tags, favorite, pin, trash, restore and permanent delete; failed persistence retains state. |
| Recovery center | native | Trash/restore/permanent delete/empty plus configurable 7/30/90/forever retention. |
| Privacy levels | native | Off/titles/list/full plus background shield and opt-in relaunch persistence. |
| Auto lock | native | Reference choices 1/5/15/30 minutes/never are local preferences. |
| Clipboard clearing | native | Reference choices never/15/30/60/120 seconds; only owned clipboard content is cleared. |
| Day/night appearance | native | System/light/dark local preference with dynamic product color tokens. |
| Version history | native substitute | Up to 20 encrypted local snapshots with restore. |
| Online version service / CAS | backend | No cloud revision or concurrency service in this offline app. |
| Secure share URL, expiry, view count, revoke | backend | Honest substitute is a password-encrypted `.pvitem`; no fake URL/revocation UI. |
| Share management | backend | Excluded; there are no hosted shares. |
| Passkey-assisted cloud unlock | backend | Excluded; changes the server trust boundary. |
| Remote sessions/logout other devices | backend | Excluded; no remote identity/session service. |
| Change cloud username | backend | Excluded; there is no cloud account. |
| Export/import encrypted backup | native | Local encrypted file, preflight summary, destructive replacement confirmation. |
| Full vs records-only backup | queued | Current local format exports the whole vault; explicit attachment-exclusion mode remains. |
| Attachment storage and preview | partial | Local encrypted binaries, image/text safe preview and export; richer audio/video/PDF parity remains. |

## Reference boundaries discovered during audit

- The web app has no general item sort selector; only group order, pin order, tag order/usage order, search score, and trash deletion-time order.
- Web batch selection has an attachment-filter bug (`bulkRows` reads a button `.value` instead of `attachmentFilter`); native parity must preserve intended filtered scope, not reproduce the defect.
- Web persistence/history/attachments/backups rely on `/api/*`, even when encryption and validation execute in the browser.
- iOS product modals remain centered web-style cards; system file pickers/exporters and OS authentication remain system UI.
