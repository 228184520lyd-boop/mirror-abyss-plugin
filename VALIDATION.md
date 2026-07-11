# Validation

Performed in the build environment:

- `node --check index.js`
- JSON parse of `manifest.json`
- Required root file check
- ZIP root layout check
- Duplicate event-listener static check
- Independent API provider branch static review
- Audit/withdraw pipeline static review

Not yet performed:

- Live SillyTavern installation test
- Cloud-hosted SillyTavern permission test
- Provider-specific CORS and authentication test
- Automatic withdrawal test against a real chat
- iOS/Android browser touch regression
- Long-chat stress test

This is why the package remains a Release Candidate.


## rc.3.1 hotfix checks

- [x] JavaScript syntax check
- [x] manifest version check
- [x] control center has visible error fallback
- [x] top/floating/settings entries target the control center
- [x] delayed settings host retries
