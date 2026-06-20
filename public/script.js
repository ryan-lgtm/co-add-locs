document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('runner-form');
    const startBtn = document.getElementById('start-btn');
    const terminalSection = document.getElementById('terminal-section');
    const terminalContent = document.getElementById('terminal-content');
    
    // Step 2 Elements
    const step1Section = document.getElementById('step-1-section');
    const step2Section = document.getElementById('step-2-section');
    const confirmDashboardBtn = document.getElementById('confirm-dashboard-btn');
    const locationsSection = document.getElementById('locations-section');
    const locationsInput = document.getElementById('locations');
    const parsedPreview = document.getElementById('parsed-preview');
    const parsedCountSpan = document.getElementById('parsed-count');
    const runLocationsBtn = document.getElementById('run-locations-btn');
    
    let eventSource = null;
    let parsedCodes = [];
    let stateStartDate = '';

    function setupSSE() {
        if (eventSource) {
            eventSource.close();
        }
        eventSource = new EventSource('/api/logs');
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.message) {
                appendLog(data.message);
            }
            if (data.status) {
                if (data.status === 'login_complete') {
                    startBtn.textContent = 'Login Automation Complete';
                    step2Section.style.display = 'block';
                } else if (data.status === 'locations_complete') {
                    runLocationsBtn.disabled = false;
                    runLocationsBtn.textContent = 'Completed!';
                }
            }
        };
    }

    function appendLog(msg) {
        const p = document.createElement('p');
        p.textContent = msg;
        if (msg.includes('❌') || msg.toLowerCase().includes('error')) {
            p.className = 'error';
        } else if (msg.includes('✅') || msg.includes('✓')) {
            p.className = 'success';
        }
        terminalContent.appendChild(p);
        terminalContent.scrollTop = terminalContent.scrollHeight;
    }

    let debounceTimer;
    function triggerParse() {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(async () => {
            const text = locationsInput.value;
            if (!text) {
                parsedPreview.style.display = 'none';
                parsedCodes = [];
                return;
            }
            try {
                const res = await fetch('/api/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text })
                });
                const data = await res.json();
                parsedCodes = data.codes;
                parsedCountSpan.textContent = data.count;
                parsedPreview.style.display = 'block';
            } catch (err) {
                console.error('Failed to parse', err);
            }
        }, 500);
    }

    locationsInput.addEventListener('input', triggerParse);

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        stateStartDate = document.getElementById('start-date').value;

        setupSSE();
        terminalContent.innerHTML = '';
        terminalSection.style.display = 'block';
        startBtn.disabled = true;
        startBtn.textContent = 'Running Login...';

        try {
            const res = await fetch('/api/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, password })
            });
            const data = await res.json();
            if (data.error) {
                appendLog(`❌ ${data.error}`);
                startBtn.disabled = false;
                startBtn.textContent = 'Start Login Automation';
            }
        } catch (err) {
            appendLog(`❌ Failed to start: ${err.message}`);
            startBtn.disabled = false;
            startBtn.textContent = 'Start Login Automation';
        }
    });

    confirmDashboardBtn.addEventListener('click', () => {
        confirmDashboardBtn.parentElement.style.display = 'none';
        locationsSection.style.display = 'block';
    });

    runLocationsBtn.addEventListener('click', async () => {
        if (parsedCodes.length === 0) {
            alert('Please provide valid locations.');
            return;
        }

        runLocationsBtn.disabled = true;
        runLocationsBtn.textContent = 'Adding Locations...';

        try {
            const res = await fetch('/api/add-locations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    locations: parsedCodes,
                    startDate: stateStartDate
                })
            });
            const data = await res.json();
            if (data.error) {
                appendLog(`❌ ${data.error}`);
                runLocationsBtn.disabled = false;
                runLocationsBtn.textContent = 'Start Adding Locations';
            }
        } catch (err) {
            appendLog(`❌ Failed to start adding locations: ${err.message}`);
            runLocationsBtn.disabled = false;
            runLocationsBtn.textContent = 'Start Adding Locations';
        }
    });

    triggerParse();
});
