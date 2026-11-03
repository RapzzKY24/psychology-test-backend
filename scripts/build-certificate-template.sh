#!/usr/bin/env bash
#
# Regenerates assets/certificate/template.png from the client's PDF.
#
# Run this after replacing assets/certificate/template.pdf. The output is
# committed: the build must not depend on poppler being installed on the
# server, and a template change should then show up as a reviewable diff.
#
# The source is the *blank* template (template_kosong.pdf): it carries only the
# static labels, so nothing has to be erased before the values are overlaid.
#
# Why a raster and not the SVG pdftocairo can also emit: the template's drop
# shadows are images behind a filter-inside-a-mask chain, and Blink — the
# engine Puppeteer prints with — draws those as opaque black boxes. Rasterising
# the page sidesteps every renderer difference; at 400 dpi it is pixel
# identical to the PDF at print size.
#
# Requires: pdftocairo (poppler-utils).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/assets/certificate/template.pdf"
out="$root/assets/certificate/template.png"
dpi=400

if ! command -v pdftocairo >/dev/null; then
  echo "pdftocairo not found — install poppler-utils" >&2
  exit 1
fi
[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

# -singlefile writes `template.png` instead of `template-1.png`.
pdftocairo -png -r "$dpi" -f 1 -l 1 -singlefile "$src" "${out%.png}"

echo "wrote ${out#$root/} (${dpi} dpi)"
