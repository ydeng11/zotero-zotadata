#!/bin/bash

# Zotero Zotadata Build Script
# Creates an XPI package for installation in Zotero 7

PLUGIN_NAME="zotero-zotadata"

# Check if version parameter is provided
if [ -z "$1" ]; then
    echo "Usage: $0 <version>"
    echo "Example: $0 1.0.0"
    exit 1
fi

VERSION="$1"
XPI_NAME="${PLUGIN_NAME}-${VERSION}.xpi"

echo "Building ${PLUGIN_NAME} v${VERSION} for Zotero 7..."

# Remove existing XPI
if [ -f "${XPI_NAME}" ]; then
    rm "${XPI_NAME}"
    echo "Removed existing ${XPI_NAME}"
fi

# Create XPI package (excluding build/test files, but including all source files)
zip -r "${XPI_NAME}" . \
    -x "build.sh" \
    -x "README.md" \
    -x "install.rdf" \
    -x "chrome.manifest" \
    -x "tests/*" \
    -x "node_modules/*" \
    -x "package*.json" \
    -x "*.git*" \
    -x "*.DS_Store*" \
    -x "*.idea*" \
    -x "*.vscode*"

if [ $? -eq 0 ]; then
    echo "Successfully created ${XPI_NAME}"
    echo "File size: $(du -h ${XPI_NAME} | cut -f1)"
    echo ""
    echo "Installation instructions for Zotero 7:"
    echo "1. Open Zotero 7"
    echo "2. Go to Tools → Add-ons"
    echo "3. Click gear icon → Install Add-on From File..."
    echo "4. Select ${XPI_NAME}"
    echo "5. Restart Zotero"
    echo ""
    echo "Note: This extension is compatible with Zotero 7.x only"
else
    echo "Error: Failed to create XPI package"
    exit 1
fi
