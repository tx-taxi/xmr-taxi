# Compact native block values — 2026-09-26

Native mined/pending strips opt into compact amount/fee formatting. Small nonzero coin amounts display <0.001; zero remains 0.00. Coin amounts otherwise retain up to three decimal places; large values use k/M/B/T notation. Fee rates retain up to three significant digits. The original full values are on the actual overlay link tooltip. Detail-page formatting and provider data are unchanged. DOGE uses its existing 60-second network interval, visible observed count without a sample prefix, with pending coverage explained only on hover.

Validation: native Angular template check and production English build passed; same native component exports built successfully. Controlled matching-data browser checks cover desktop1440/mobile390, actual DASH/DOGE overflow examples, exact tooltip contents and unchanged native/hub geometry. Cross-chain report/screenshots: /home/lukee/dev/router-block-format/review/block-format/. No production completion inferred from local checks; final deployment evidence is kept with that report.

The hub exporter is owned here and records the current git revision plus exact imported source hashes. Build with `node hub/build.cjs /path/to/router/public/assets/native-strips/CHAIN`, then content-version the complete export in the router.
