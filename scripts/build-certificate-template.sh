#!/usr/bin/env bash
#
# Regenerates assets/certificate/template.svg from the client's PDF.
#
# Run this after replacing assets/certificate/template.pdf. The output is
# committed: the build must not depend on poppler being installed on the
# server, and a template change should then show up as a reviewable diff.
#
# The source is the *blank* template (template_kosong.pdf): it carries only the
# static labels, so nothing has to be erased before the values are overlaid.
#
# Requires: pdftocairo (poppler-utils).
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="$root/assets/certificate/template.pdf"
out="$root/assets/certificate/template.svg"

if ! command -v pdftocairo >/dev/null; then
  echo "pdftocairo not found — install poppler-utils" >&2
  exit 1
fi
[ -f "$src" ] || { echo "missing $src" >&2; exit 1; }

# -svg keeps the page as one vector document; the template is a single A4 page.
pdftocairo -svg -f 1 -l 1 "$src" "$out"

# A live <text> node would be laid out with a font we do not ship, so the server
# would silently fall back to another face. pdftocairo turns every run into
# glyph outlines, which is why this has to stay at zero.
if grep -q "<text" "$out"; then
  echo "template.svg still contains <text> nodes" >&2
  exit 1
fi

echo "wrote ${out#$root/}"
