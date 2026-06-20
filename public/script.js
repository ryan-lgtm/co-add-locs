document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('runner-form');
    const startBtn = document.getElementById('start-btn');
    const terminalSection = document.getElementById('terminal-section');
    const terminalContent = document.getElementById('terminal-content');
    const locationsInput = document.getElementById('locations');
    const addAllCheckbox = document.getElementById('add-all');
    const parsedPreview = document.getElementById('parsed-preview');
    const parsedCountSpan = document.getElementById('parsed-count');
    
    let eventSource = null;
    let parsedCodes = [];

    // Setup EventSource for logs
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
                if (data.status === 'running') {
                    startBtn.disabled = true;
                    startBtn.textContent = 'Running...';
                    terminalSection.style.display = 'block';
                } else if (data.status === 'idle') {
                    startBtn.disabled = false;
                    startBtn.textContent = 'Start Automation';
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
            const addAll = addAllCheckbox.checked;
            
            if (!text && !addAll) {
                parsedPreview.style.display = 'none';
                parsedCodes = [];
                return;
            }

            try {
                const res = await fetch('/api/parse', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text, addAll })
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
    addAllCheckbox.addEventListener('change', () => {
        if (addAllCheckbox.checked) {
            locationsInput.disabled = true;
            locationsInput.style.opacity = '0.5';
        } else {
            locationsInput.disabled = false;
            locationsInput.style.opacity = '1';
        }
        triggerParse();
    });

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        const startDate = document.getElementById('start-date').value;
        const addAll = addAllCheckbox.checked;

        if (!addAll && parsedCodes.length === 0) {
            alert('Please provide valid locations or select "Add ALL".');
            return;
        }

        setupSSE();
        terminalContent.innerHTML = '';
        terminalSection.style.display = 'block';

        try {
            const res = await fetch('/api/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    username,
                    password,
                    locations: parsedCodes,
                    startDate,
                    addAll
                })
            });

            const data = await res.json();
            if (data.error) {
                appendLog(`❌ ${data.error}`);
            }
        } catch (err) {
            appendLog(`❌ Failed to start: ${err.message}`);
        }
    });

    // Initialize parsing logic
    triggerParse();
});
