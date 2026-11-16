#!/usr/bin/env bash
set -euo pipefail

xpi_path="${1:?Usage: assert-xpi-no-toolkit-protocols.sh <xpi-path>}"
bundle_file="$(mktemp)"
trap 'rm -f "$bundle_file"' EXIT

unzip -p "$xpi_path" content/scripts/zotadata.js > "$bundle_file"
if [[ ! -s "$bundle_file" ]]; then
  echo "The XPI bundle is missing or empty: content/scripts/zotadata.js" >&2
  exit 1
fi

failed=0
for uri in "zotero://ztoolkit-debug" "zotero://plugin"; do
  if grep -Fq -- "$uri" "$bundle_file"; then
    echo "Unexpected Toolkit protocol handler found in XPI bundle: $uri" >&2
    failed=1
  else
    grep_status=$?
    if [[ "$grep_status" -ne 1 ]]; then
      echo "Could not check Toolkit protocol handler in XPI bundle: $uri" >&2
      exit "$grep_status"
    fi
  fi
done

if [[ "$failed" -ne 0 ]]; then
  exit 1
fi

echo "XPI bundle contains neither unused Toolkit protocol handler."
