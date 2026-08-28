# Production candidate refresh - 2026-08-27

This source checkpoint refreshes the protected console candidate for the
one-time Workforce OS production bootstrap. It does not change application
behavior. The candidate must still pass the repository's required CI and the
build-only workflow must emit a new immutable ACR digest before it can be named
in a bootstrap request.

The backend production-authority audit was rerun on 2026-08-27. Its result is
operational evidence, not a substitute for the bootstrap controller's signed
database, delivery, smoke, and phase receipts.

The checkpoint was refreshed again on 2026-08-28 because production admission
requires the protected-head CI and immutable candidate-build evidence to be no
more than 24 hours old. Existing source tags remain immutable and are never
overwritten; each refresh therefore advances the protected source commit and
produces a newly attributable candidate.
