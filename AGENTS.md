# Agent Reference Guide

Hello, fellow AI Assistant (Cursor, Claude, Antigravity, etc.)! 
If you've been tasked with modifying, debugging, or understanding this project, this reference file will quickly orient you to how the app is wired.

## Architecture Overview

This is a local Node.js application that uses Express for the backend web server and Puppeteer for web automation. It consists of three main layers:

1. **The Client (Frontend UI)**
   - **Files:** `public/index.html`, `public/styles.css`, `public/script.js`
   - **Role:** Presents the user interface. Captures credentials, start date, and location strings. 
   - **Logic:** 
     - Inputting locations triggers a debounced `POST /api/parse` request to the backend to instantly validate and parse the input into correct jurisdiction codes.
     - On submission, it sends a `POST /api/run` request to start the Puppeteer job.
     - Subscribes to Server-Sent Events (SSE) via `GET /api/logs` to receive real-time execution logs and update the visual terminal.

2. **The Server (Express + Puppeteer API)**
   - **Files:** `server.js`
   - **Role:** Handles incoming HTTP requests, performs smart parsing, and orchestrates the web scraper.
   - **Core Endpoints:**
     - `POST /api/parse`: Receives raw text, parses it using regular expressions and dictionary lookups against `jurisdictions.json`, and returns an array of valid CO SUTS jurisdiction codes.
     - `POST /api/run`: Initializes the Puppeteer browser instance, performs the SUTS login with provided credentials, and loops through the provided jurisdiction codes to automate adding locations.
     - `GET /api/logs`: Maintains an SSE connection with the client, broadcasting `broadcastLog()` and `broadcastStatus()` messages from the Puppeteer instance to the frontend.

3. **Data Layer**
   - **Files:** `data/jurisdictions.json`, `generate_dict.js`
   - **Role:** Provides the source of truth for Colorado jurisdictions.
   - **Context:** The dictionary maps jurisdiction names (e.g., "DENVER") to their numeric codes (e.g., "040017") and flags whether they are a `self_collected` location. 
   - **Maintenance:** `generate_dict.js` is a utility script that was originally used to parse older python/CSV files to generate this JSON. It is kept for historical context or regeneration but isn't required for runtime execution.

## Key Behaviors & Gotchas to Know

1. **Puppeteer `headless` Mode:**
   Puppeteer is intentionally run with `headless: false`. This is because after login, the user *must* manually navigate to their specific business account dashboard within the SUTS portal. The script pauses for 30 seconds (`await new Promise(r => setTimeout(r, 30000));`) specifically to allow the user time to do this before the location addition loop begins. **Do not enable headless mode.**

2. **Server-Sent Events (SSE):**
   Logs are not just `console.log`'d. They are pushed to the UI via the `broadcastLog` function using standard SSE format (`data: {...}\n\n`). If you add new logic to Puppeteer, ensure you use `broadcastLog` so the user sees it in the browser UI.

3. **SUTS Selectors:**
   The Puppeteer scripts rely on specific CSS selectors, IDs, and ARIA labels present in the CO SUTS portal (e.g., `input[id="username"]`, `._modalView_10vsv_31 button[id^="radix-"]`, `button._base_m151b_1._button_m151b_64`). If the automation fails to click or type, the SUTS portal HTML has likely changed, and these selectors will need to be updated in `server.js`.

4. **Launcher:**
   The `start.sh` wrapper handles ensuring dependencies are installed and booting the Node server. `server.js` uses the `open` library to automatically launch the default browser to `http://localhost:3000` as soon as the Express server starts listening.

Happy coding!
