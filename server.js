const express = require('express');
const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = 48921;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let clients = [];
let isRunning = false;
let globalBrowser = null;
let globalPage = null;

function broadcastLog(message) {
    console.log(message);
    const data = `data: ${JSON.stringify({ message })}\n\n`;
    clients.forEach(c => c.write(data));
}

function broadcastStatus(status) {
    const data = `data: ${JSON.stringify({ status })}\n\n`;
    clients.forEach(c => c.write(data));
}

app.get('/api/logs', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    clients.push(res);
    res.write(`data: ${JSON.stringify({ message: 'Connected to logs...' })}\n\n`);

    req.on('close', () => {
        clients = clients.filter(c => c !== res);
    });
});

app.post('/api/login', async (req, res) => {
    if (isRunning) {
        return res.status(400).json({ error: 'A job is already running' });
    }

    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ error: 'Username and password are required' });
    }

    isRunning = true;
    res.json({ success: true, message: 'Login started' });

    broadcastLog('🚀 Starting CO SUTS Login Automation...');

    try {
        await performLogin(username, password);
        broadcastStatus('login_complete');
    } catch (error) {
        broadcastLog(`❌ Error: ${error.message}`);
    } finally {
        isRunning = false;
    }
});

app.post('/api/add-locations', async (req, res) => {
    if (isRunning) {
        return res.status(400).json({ error: 'A job is already running' });
    }

    if (!globalPage || !globalBrowser) {
        return res.status(400).json({ error: 'No active browser session. Please login first.' });
    }

    const { locations, startDate } = req.body;

    if (!locations || locations.length === 0) {
        return res.status(400).json({ error: 'Please provide locations.' });
    }

    isRunning = true;
    res.json({ success: true, message: 'Locations adding started' });

    broadcastLog('🚀 Starting CO SUTS Locations Addition...');

    try {
        await performLocationsAddition(globalPage, locations, startDate);
        broadcastStatus('locations_complete');
    } catch (error) {
        broadcastLog(`❌ Error: ${error.message}`);
    } finally {
        isRunning = false;
    }
});

let jurisdictionsMap = {};
try {
    const data = fs.readFileSync(path.join(__dirname, 'data', 'jurisdictions.json'), 'utf8');
    jurisdictionsMap = JSON.parse(data);
} catch (err) {
    console.error('Could not load jurisdictions.json', err);
}

app.post('/api/parse', (req, res) => {
    const { text } = req.body;
    let parsedCodes = [];

    const items = text.split(/[\n,]+/);
    const codeSet = new Set();

    items.forEach(item => {
        const clean = item.trim();
        if (!clean) return;

        const codeMatch = clean.match(/\b\d{2}-?\d{4}\b/);
        if (codeMatch) {
            const code = codeMatch[0].replace(/-/g, '').replace(/^0+/, '');
            codeSet.add(code);
            return;
        }

        const upper = clean.toUpperCase();
        for (const [name, info] of Object.entries(jurisdictionsMap)) {
            if (upper.includes(name)) {
                codeSet.add(info.code);
                return;
            }
        }
    });
    parsedCodes = Array.from(codeSet);

    res.json({ count: parsedCodes.length, codes: parsedCodes });
});

async function clickButtonByClassOrText(page, label) {
    const clicked = await page.evaluate((lbl) => {
        const modal = document.querySelector('._modalView_10vsv_31');
        const scope = modal || document;
        const clsButtons = scope.querySelectorAll('button._base_m151b_1._button_m151b_64');
        for (const btn of clsButtons) {
            if (btn.textContent.trim().includes(lbl)) {
                btn.click();
                return 'class';
            }
        }
        const allButtons = scope.querySelectorAll('button');
        for (const btn of allButtons) {
            if (btn.textContent.trim().includes(lbl)) {
                btn.click();
                return 'text';
            }
        }
        return null;
    }, label);

    if (!clicked) {
        throw new Error(`Could not find button with label "${label}"`);
    }
    broadcastLog(`👆 Clicked "${label}" via ${clicked} selector`);
}

async function selectJurisdictionInModal(page, jurisdiction) {
    broadcastLog(`⌨️  Typing jurisdiction code to filter dropdown: ${jurisdiction}`);
    await page.keyboard.type(jurisdiction);
    await page.waitForTimeout(500);

    broadcastLog(`🔍 Looking for menuitemradio containing "(${jurisdiction})"`);
    const found = await page.evaluate((code) => {
        const items = document.querySelectorAll('div[role="menuitemradio"]');
        const target = `(${code})`;
        for (const item of items) {
            if (item.textContent.includes(target)) {
                item.click();
                return item.textContent.trim();
            }
        }
        return null;
    }, jurisdiction);

    if (!found) {
        throw new Error(`No menuitemradio found matching "(${jurisdiction})"`);
    }
    broadcastLog(`👆 Selected jurisdiction: ${found}`);
}

function formatDateToYYYYMMDD(mmddyyyy) {
    if (mmddyyyy.length !== 8) return '2025-01-01';
    const mm = mmddyyyy.substring(0, 2);
    const dd = mmddyyyy.substring(2, 4);
    const yyyy = mmddyyyy.substring(4, 8);
    return `${yyyy}-${mm}-${dd}`;
}

async function fillDateInput(page, isoDate) {
    await page.evaluate((val) => {
        const el = document.getElementById('first_day_of_sales')
            || document.querySelector('input[name="first_day_of_sales"]');
        if (!el) throw new Error('Date input not found');
        const setter = Object.getOwnPropertyDescriptor(
            window.HTMLInputElement.prototype, 'value'
        ).set;
        setter.call(el, val);
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
    }, isoDate);
    broadcastLog(`📅 Set first_day_of_sales to ${isoDate}`);
}

async function waitForNetworkSettled(page, { timeout = 15000, idleMs = 500 } = {}) {
    let inflight = 0;
    const onRequest = () => inflight++;
    const onFinish = () => inflight = Math.max(0, inflight - 1);

    page.on('request', onRequest);
    page.on('requestfinished', onFinish);
    page.on('requestfailed', onFinish);

    try {
        const start = Date.now();
        let lastActivity = Date.now();
        while (Date.now() - start < timeout) {
            if (inflight > 0) lastActivity = Date.now();
            else if (Date.now() - lastActivity >= idleMs) return;
            await page.waitForTimeout(100);
        }
    } finally {
        page.off('request', onRequest);
        page.off('requestfinished', onFinish);
        page.off('requestfailed', onFinish);
    }
}

async function performLogin(username, password) {
    if (globalBrowser) {
        await globalBrowser.close();
    }

    globalBrowser = await puppeteer.launch({
        headless: false,
        channel: 'chrome',
        defaultViewport: null,
        args: ['--start-maximized']
    });

    globalPage = await globalBrowser.newPage();
    
    broadcastLog('📱 Navigating to CO SUTS login page...');
    await globalPage.goto('https://suts.blt.govos.com/login', {
        waitUntil: 'networkidle2'
    });
    
    broadcastLog('✅ Successfully loaded CO SUTS login page');
    
    broadcastLog('🔍 Looking for username input field...');
    await globalPage.waitForSelector('input[id="username"]', { timeout: 10000 });
    
    broadcastLog(`👆 Clicking into username input field... typing ${username}`);
    await globalPage.click('input[id="username"]');
    await globalPage.type('input[id="username"]', username);
    
    broadcastLog('↹️  Tabbing twice to reach password field...');
    await globalPage.keyboard.press('Tab');
    await globalPage.keyboard.press('Tab');
    
    broadcastLog('⌨️  Typing password...');
    await globalPage.type('input[type="password"]', password);
    
    broadcastLog('🔍 Looking for Sign In button...');
    await globalPage.waitForSelector('button[type="submit"]', { timeout: 5000 });
    
    broadcastLog('👆 Clicking Sign In button...');
    await globalPage.click('button[type="submit"]');
    
    broadcastLog('⏳ Waiting for login to complete and page to load...');
    await globalPage.waitForNavigation({ waitUntil: 'networkidle2', timeout: 15000 });
    
    broadcastLog('✅ Login successful!');
    broadcastLog('📍 IMPORTANT: Please navigate to the desired account dashboard manually in the opened Chrome window.');
    broadcastLog('Please click the "Yes" button in this application when you are ready to continue.');
}

async function performLocationsAddition(page, parsedCodes, startDate) {
    broadcastLog(`🎯 Found ${parsedCodes.length} unique jurisdictions to process`);

    const selfCollectedJurisdictions = Object.values(jurisdictionsMap)
        .filter(info => info.is_self_collected)
        .map(info => info.code);
        
    const isoDate = formatDateToYYYYMMDD(startDate.replace(/[^0-9]/g, ''));
    
    for (const jurisdiction of parsedCodes) {
        broadcastLog(`\n🔍 Processing jurisdiction: ${jurisdiction}`);
        
        try {
            await page.waitForSelector('#data-table-location input[id="search"]', { timeout: 10000 });
            await page.click('#data-table-location input[id="search"]');
            
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            
            broadcastLog(`⌨️  Typing jurisdiction code: ${jurisdiction}`);
            await page.type('#data-table-location input[id="search"]', jurisdiction);
            await page.keyboard.press('Enter');
            
            await page.waitForTimeout(500);
            
            const noRecordsDiv = await page.$('div[style*="padding: 24px"]');
            if (noRecordsDiv) {
                const text = await page.evaluate(el => el.textContent, noRecordsDiv);
                if (text.includes('There are no records to display')) {
                    broadcastLog(`📝 No records found for ${jurisdiction}, adding new location...`);
                    
                    await page.click('#data-table-location input[id="search"]');
                    await page.keyboard.down('Control');
                    await page.keyboard.press('KeyA');
                    await page.keyboard.up('Control');
                    await page.keyboard.press('Backspace');
                    
                    await page.click('button[aria-label="Add Location"]');
                    await page.waitForTimeout(500);
                    
                    await page.waitForSelector('._modalView_10vsv_31 button[id^="radix-"]', { timeout: 5000 });
                    
                    broadcastLog(`🔽 Clicking dropdown to select jurisdiction: ${jurisdiction}`);
                    await page.click('._modalView_10vsv_31 button[id^="radix-"]');
                    
                    let dropdownLoaded = false;
                    let attempt = 1;
                    const maxAttempts = 3;
                    
                    while (!dropdownLoaded && attempt <= maxAttempts) {
                        try {
                            await page.waitForSelector('div[role="menuitemradio"]', { timeout: 5000 });
                            dropdownLoaded = true;
                            await selectJurisdictionInModal(page, jurisdiction);
                        } catch (error) {
                            broadcastLog(`❌ Attempt ${attempt} failed to load dropdown for ${jurisdiction}`);
                            attempt++;
                            if (attempt <= maxAttempts) {
                                try {
                                    await page.click('._modalView_10vsv_31 button[id^="radix-"]');
                                } catch (clickError) {}
                            }
                        }
                    }
                    
                    if (!dropdownLoaded) {
                        broadcastLog(`❌ Dropdown failed to load after ${maxAttempts} attempts for ${jurisdiction}, skipping...`);
                        await page.keyboard.press('Escape');
                        continue;
                    }
                    
                    await page.waitForTimeout(500);

                    const isSelfCollected = selfCollectedJurisdictions.includes(jurisdiction);

                    try {
                        if (isSelfCollected) {
                            broadcastLog(`🏢 Adding Self-Collected Location for ${jurisdiction}`);
                            await clickButtonByClassOrText(page, 'Add New Self-Collected Location');
                        }

                        broadcastLog(`🏛️ Adding State Location for ${jurisdiction}`);
                        await clickButtonByClassOrText(page, 'Add New State Location');

                        await page.waitForTimeout(2000);

                        await page.waitForSelector('#first_day_of_sales, input[name="first_day_of_sales"]', { timeout: 5000 });
                        await fillDateInput(page, isoDate);

                        await clickButtonByClassOrText(page, 'Save');

                        await page.waitForTimeout(500);
                        await waitForNetworkSettled(page);

                        broadcastLog(`✅ Successfully added location for ${jurisdiction}`);
                    } catch (addError) {
                        broadcastLog(`❌ Error adding location for ${jurisdiction}: ${addError.message}`);
                        await page.keyboard.press('Escape');
                    }
                } else {
                    broadcastLog(`ℹ️  Records exist but unexpected UI state for ${jurisdiction}`);
                }
            } else {
                broadcastLog(`ℹ️  Records already exist for ${jurisdiction}, skipping...`);
            }
            
            await page.click('#data-table-location input[id="search"]');
            await page.keyboard.down('Control');
            await page.keyboard.press('KeyA');
            await page.keyboard.up('Control');
            await page.keyboard.press('Backspace');
            
        } catch (error) {
            broadcastLog(`❌ Error processing jurisdiction ${jurisdiction}: ${error.message}`);
        }
    }

    broadcastLog('\n📋 === COMPREHENSIVE PROCESSING SUMMARY ===');
    broadcastLog('All provided locations processed!');
    broadcastLog('Browser will remain open for manual review. You can close the application now.');
}

app.listen(port, async () => {
    console.log(`Server running at http://localhost:${port}`);
    const open = (await import('open')).default;
    open(`http://localhost:${port}`);
});
