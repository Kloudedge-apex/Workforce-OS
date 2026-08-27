# Production candidate refresh - 2026-08-27

This source checkpoint refreshes the protected console candidate for the
one-time Workforce OS production bootstrap. It does not change application
behavior. The candidate must still pass the repository's required CI and the
build-only workflow must emit a new immutable ACR digest before it can be named
in a bootstrap request.

The backend production-authority audit was rerun on 2026-08-27. Its result is
operational evidence, not a substitute for the bootstrap controller's signed
database, delivery, smoke, and phase receipts.
