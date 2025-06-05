# Zotero Attachment Finder

A Zotero plugin that automatically finds and downloads missing attachments for your library items using DOI and open access sources.

**⚠️ This version is specifically designed for Zotero 7.x and will not work with Zotero 6.x**

## Features

- **Attachment Validation**: Check if selected Zotero items have valid attached files
- **DOI-based Metadata Updates**: Fetch and update metadata using CrossRef API
- **Automatic File Download**: Search for open access PDFs using multiple sources:
  - Unpaywall API
  - arXiv API
  - CORE API (optional)
- **Batch Processing**: Handle multiple items at once with progress tracking
- **Multilingual Support**: English and Chinese locales included

## Installation

### From XPI File (Zotero 7.x)

1. Download the latest release XPI file (`zotero-attachment-finder-1.0.0.xpi`)
2. In Zotero 7, go to `Tools` → `Add-ons`
3. Click the gear icon and select "Install Add-on From File..."
4. Select the downloaded XPI file
5. Restart Zotero

**Note**: This extension requires Zotero 7.0 or later. For Zotero 6.x compatibility, use an earlier version of this extension.

### Manual Installation (Development)

1. Clone or download this repository
2. Run `./build.sh` to create the XPI package
3. Install as described above

## Configuration

1. Go to `Tools` → `Add-ons` → `Attachment Finder` → `Preferences`
2. Enter your email address (required for Unpaywall API)
3. Optionally enter a CORE API key for higher rate limits
4. Configure behavior preferences:
   - Update existing metadata
   - Automatically download when items are added

## Usage

### Context Menu

Right-click on selected items in your Zotero library to access:

- **Check Attachments**: Validate attachment status for selected items
- **Update Metadata from DOI**: Refresh metadata using CrossRef API
- **Find Missing Files**: Search and download missing PDFs
- **Attachment Finder Settings**: Open preferences dialog

### Batch Operations

Select multiple items to process them all at once. A progress dialog will show the status of each operation.

## API Integration

This plugin integrates with several external APIs:

### CrossRef API

- **Purpose**: Fetch metadata for DOIs
- **Rate Limit**: 50 requests/second (polite pool)
- **Authentication**: None required (email recommended)

### Unpaywall API

- **Purpose**: Find open access PDF links
- **Rate Limit**: 100,000 requests/day
- **Authentication**: Email address required

### arXiv API

- **Purpose**: Search and download arXiv papers
- **Rate Limit**: 3 seconds between requests
- **Authentication**: None required

### CORE API (Optional)

- **Purpose**: Search academic papers for full-text access
- **Rate Limit**: 10,000 requests/month (free tier)
- **Authentication**: API key required for higher limits

## File Structure

```
zotero-attachment-finder/
├── manifest.json            # Plugin metadata (Zotero 7 format)
├── bootstrap.js             # Plugin bootstrap for Zotero 7
├── prefs.js                 # Default preferences
├── content/
│   └── attachment-finder.js # Main logic
├── chrome/content/
│   ├── preferences.xul      # Settings dialog
│   └── progress.xul         # Progress window
├── locale/
│   ├── en-US/               # English translations
│   └── zh-CN/               # Chinese translations
├── skin/default/
│   └── attachment-finder.css # Styles
└── README.md                # This file
```

## Development

### Requirements

- Zotero 7.0 or later
- Firefox 115+ based platform

### Building

1. Make changes to the source files
2. Run `./build.sh` to create XPI package
3. Test in Zotero 7 development environment

### Testing

- Unit test the API integration functions
- Test with various item types and DOI formats
- Verify UI responsiveness and error handling
- Test with both Zotero 7 stable and beta versions

## Zotero 7 Migration

This version has been completely rewritten for Zotero 7 compatibility:

- **Extension Format**: Migrated from `install.rdf` to `manifest.json`
- **Architecture**: Changed from XUL overlays to bootstrapped extension
- **APIs**: Updated to use Zotero 7 compatible APIs
- **Window Management**: Adapted to new Zotero 7 window lifecycle
- **Preferences**: Moved to root-level `prefs.js` file

## Zotero 7 Compatibility Notes

When developing this plugin for Zotero 7, ensure the following in your `manifest.json`:

- **`manifest_version`**: Must be set to `2`. Despite Zotero 7 being based on a newer Firefox core that uses Manifest V3 for web extensions, Zotero's own bootstrapped plugins still expect `manifest_version: 2`.
- **`applications` key**: Zotero-specific properties (like `id`, `strict_min_version`, `strict_max_version`, and `update_url`) must be within an `applications.zotero` object.
- **`update_url`**: This field within `applications.zotero` is **mandatory** for Zotero 7.0.15+ (and possibly earlier Zotero 7 versions). Even for local development, a placeholder URL (e.g., `"https://example.com/update.json"`) must be provided, otherwise the plugin installation will fail with an "Extension is invalid" error.

Failure to include `update_url` will result in an error message in the Zotero debug log similar to:
`ERROR Loading extension 'your-plugin-id@example.org': Reading manifest: applications.zotero.update_url not provided`

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly with Zotero 7
5. Submit a pull request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Changelog

### Version 1.0.0 (Zotero 7 Compatible)

- Complete rewrite for Zotero 7 compatibility
- Migrated from install.rdf to manifest.json
- Changed from XUL overlays to bootstrapped extension
- Updated APIs for Zotero 7
- New window management system
- Improved error handling and logging

## Support

- Report bugs and feature requests on GitHub Issues
- Check the wiki for troubleshooting guides
- Join the community discussions

**Note**: For Zotero 6.x support, use an earlier version of this extension.

## Acknowledgments

- CrossRef for providing free metadata API
- Unpaywall for open access discovery
- arXiv for academic paper access
- CORE for research paper aggregation
- Zotero development team for the extensible platform
- Mozilla for the Firefox platform that powers Zotero
