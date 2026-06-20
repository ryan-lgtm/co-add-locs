# Colorado Sucks. Let's Add Locations.

A standalone, user-friendly Node.js web application for automating the addition of locations in the Colorado SUTS (Sales and Use Tax System) portal.

## Features

- **Automated SUTS Navigation**: Uses Puppeteer to seamlessly log in and add locations to your SUTS account.
- **Smart Parsing**: Paste any mix of comma or line-separated jurisdiction names and codes. The app will intelligently map them to the proper jurisdiction codes.
- **Self-Collected vs State**: Automatically differentiates and correctly adds state vs. self-collected locations based on an internal curated dictionary.
- **Premium Web UI**: Watch your automation run in real-time through a beautiful, user-friendly web interface with live streaming terminal logs.

## Prerequisites

- **Node.js** (v14 or higher recommended)
- **NPM**

## Quick Start

### macOS & Linux

The easiest way to start the application is by using the bundled launcher script. This script automatically checks for dependencies, installs them if missing, starts the backend server, and opens the UI in your default browser.

1. Open your terminal.
2. Navigate to the app directory.
3. Run the launcher:
   ```bash
   ./start.sh
   ```

### Windows

1. Open your command prompt or PowerShell.
2. Navigate to the app directory.
3. Install dependencies manually the first time:
   ```cmd
   npm install
   ```
4. Start the server:
   ```cmd
   npm start
   ```
5. The browser should automatically open to `http://localhost:48921`.

## Manual Dictionary Generation

The internal jurisdiction mappings are compiled in `data/jurisdictions.json`. If the source CSVs or rules change, you can regenerate this dictionary using the provided script (note: this requires the original source files in the parent directory):

```bash
node generate_dict.js
```

## Security & Privacy

This tool runs **100% locally** on your machine. Your Colorado SUTS credentials are sent securely to your local Node.js server to perform the automation and are **never** stored or transmitted to any third party.
