# Credential redaction audit

The preserved Phase B runner originally contained a credential-bearing PostgreSQL URL. Before redaction, `run-protected.mjs` was 1,814 bytes with SHA-256 `b6106e22336b0daba265a7e49420bbee519c658a1eb14346bb3448511007761f`.

The embedded database URL was replaced with the required `T39_PHASE_B_TEST_DATABASE_URL` environment variable. The runner validates that the supplied URL uses PostgreSQL and points to `127.0.0.1:55448/safethrift_t39_phase_b_test` before assigning it to the unchanged T40, T41 and T42 fixture variables. The Redis loopback URL, suite order, resume behavior, subprocess commands, artifact paths and result handling are unchanged. No credential value is retained in this record.

After redaction, `run-protected.mjs` is 2,082 bytes with SHA-256 `8d0c6c1e11cfefffaa1281e9910e8d536bcdd5cb054754d5cb6be383fe49fc1c`.

## Historical licence whitespace correction

This correction is separate from the credential redaction. The historical prototype copy at `docs/design-prototypes/direction-b-2026-10-29/fonts/Archivo-OFL.txt` contained one trailing ASCII space immediately before the newline on line 21. Before correction, it was 4,388 bytes with SHA-256 `108b4e57c9c796d3d38d0428ca7ee39de47ad93187302718d9b2d8864b9b716b`.

Only that trailing space was removed. All licence wording and every other byte are preserved. The corrected file is 4,387 bytes with SHA-256 `1778201b7bd33e8c08a2eda32a4ad2f69bc38ced9731b01cc3fc47f268c8ef3c`. This prototype file is outside the Phase B artifact-manifest directory, so no manifest entry covers it.
