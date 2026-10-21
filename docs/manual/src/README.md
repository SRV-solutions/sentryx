# Fuentes del manual

- `build_manual.py` genera `docs/Manual Sentryx - Colegio Demo.pdf` (reportlab + Pillow, fuentes Segoe UI de Windows):
  `python build_manual.py "../../Manual Sentryx - Colegio Demo.pdf"` desde esta carpeta (ajustá `SHOTS` si las capturas están en otro lugar).
- `manualshots.mjs` toma las capturas con Chrome headless contra el Colegio Demo Sentryx (API en 3010, front en 5185, página auxiliar `client/public/_shot.html` que se crea solo para capturar y no se versiona).
- Las capturas `d_*` son de escritorio (1280×860 @2x) y las `p_*` de celular (390×844 @2x).
