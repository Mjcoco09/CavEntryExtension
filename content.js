// ========================
// AUTOFILL CORE ENGINE
// ========================

class AutofillManager {
    constructor() {
        this.statusIndicator = this.createStatusIndicator();
        this.initializeErrorHandling();
    }

    createStatusIndicator() {
        const existing = document.getElementById('autofill-status');
        if (existing) return existing;
        const indicator = document.createElement('div');
        indicator.id = 'autofill-status';
        indicator.style.cssText = `
            position: fixed;
            bottom: 20px;
            right: 20px;
            padding: 12px 16px;
            background: #2d3436;
            color: white;
            border-radius: 8px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            z-index: 999999;
            display: none;
            align-items: center;
            gap: 12px;
            font-family: 'Segoe UI', system-ui;
        `;
        document.body.appendChild(indicator);
        return indicator;
    }

    showStatus(message, isError = false) {
        this.statusIndicator.style.background = isError ? '#ff4444' : '#2d3436';
        this.statusIndicator.innerHTML = `
            ${message}
            <div style="
                width: 8px;
                height: 8px;
                background: ${isError ? '#ff8888' : '#00c851'};
                border-radius: 50%;
                margin-left: 8px;
            "></div>
        `;
        this.statusIndicator.style.display = 'flex';
        setTimeout(() => { this.statusIndicator.style.display = 'none'; }, isError ? 5000 : 3000);
    }

    initializeErrorHandling() {
        window.addEventListener('error', (event) => {
            this.handleError(event.error || new Error(event.message));
        });
        window.addEventListener('unhandledrejection', (event) => {
            this.handleError(event.reason);
        });
    }

    handleError(error) {
        const message = error instanceof Error ? error.message : String(error);
        this.showStatus(`Error: ${message}`, true);
        console.error('[Autofill Error]', error);
    }

    async setPerformedAtDate(dateTime) {
        try {
            const dateInput = document.getElementById("performed_at");
            if (!dateInput) throw new Error('Date input not found');
            dateInput.value = dateTime;
            dateInput.dispatchEvent(new Event('change', { bubbles: true }));
            this.showStatus('Date/time set successfully');
        } catch (error) {
            this.handleError(error);
        }
    }

    async selectDropdown(dropdownId, searchTexts) {
        try {
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown) throw new Error(`Dropdown not found: ${dropdownId}`);
            const searchTerms = Array.isArray(searchTexts) ? searchTexts : [searchTexts];
            let found = false;
            for (const option of dropdown.options) {
                const optionText = option.textContent.toLowerCase().trim();
                for (const term of searchTerms) {
                    if (optionText.includes(term.toLowerCase().trim())) {
                        option.selected = true;
                        dropdown.dispatchEvent(new Event('change', { bubbles: true }));
                        this.showStatus(`Selected: ${option.textContent.trim()}`);
                        found = true;
                        return true;
                    }
                }
            }
            if (!found) throw new Error(`Option not found in ${dropdownId}`);
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    async selectRandomOption(dropdownId, excludeOptions = []) {
        try {
            const dropdown = document.getElementById(dropdownId);
            if (!dropdown) throw new Error(`Dropdown not found: ${dropdownId}`);
            const excludeTerms = excludeOptions.map(opt => opt.toLowerCase().trim());
            const validOptions = Array.from(dropdown.options).filter(
                option => !excludeTerms.includes(option.textContent.toLowerCase().trim())
            );
            if (validOptions.length === 0) throw new Error(`No valid options in ${dropdownId}`);
            const randomOption = validOptions[Math.floor(Math.random() * validOptions.length)];
            randomOption.selected = true;
            dropdown.dispatchEvent(new Event('change', { bubbles: true }));
            this.showStatus(`Randomly selected: ${randomOption.textContent.trim()}`);
            return true;
        } catch (error) {
            this.handleError(error);
            return false;
        }
    }

    async triggerServiceSequence() {
        try {
            await this.selectRandomOption("service_category_id", ["no service category"]);
            await new Promise(r => setTimeout(r, 500));
            await this.selectRandomOption("service_id", ["no service"]);
            await new Promise(r => setTimeout(r, 500));
            await this.selectRandomOption("response_id", ["no response", "none", "select"]);
        } catch (error) {
            this.handleError(error);
        }
    }

    async executeAutoSubmit() {
        try {
            const submitButton = document.querySelector('button[type="submit"], [id*="submit"], [name*="submit"]');
            if (submitButton) {
                submitButton.click();
                this.showStatus('Submitted!');
            } else {
                throw new Error('Submit button not found');
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    async runFullSequence(consumerName, staffName, dateTime) {
        try {
            await this.selectDropdown("consumer_id", consumerName);
            await new Promise(r => setTimeout(r, 300));
            await this.selectDropdown("consumer_id", consumerName);
            await new Promise(r => setTimeout(r, 300));
            await this.selectDropdown("staff_member_id", staffName);
            await new Promise(r => setTimeout(r, 300));
            await this.selectDropdown("staff_member_id", staffName);
            await new Promise(r => setTimeout(r, 900));
            await this.triggerServiceSequence();
            await new Promise(r => setTimeout(r, 1500));
            await this.setPerformedAtDate(dateTime);
        } catch (error) {
            this.handleError(error);
        }
    }
}

// ========================
// CONFIRM OVERLAY
// ========================

function showConfirmOverlay(item, currentNum, total) {
    return new Promise((resolve) => {
        document.getElementById('autofill-confirm-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'autofill-confirm-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.65);
            z-index: 9999999;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: 'Segoe UI', system-ui, sans-serif;
        `;
        overlay.innerHTML = `
            <div style="
                background: #1e293b;
                border: 1px solid #334155;
                border-radius: 12px;
                padding: 24px 28px;
                width: 380px;
                box-shadow: 0 20px 60px rgba(0,0,0,0.6);
                color: #f8fafc;
            ">
                <div style="font-size:18px; font-weight:600; color:#7c6cf7; margin-bottom:4px;">
                    Submission ${currentNum} of ${total} &mdash; Ready to Submit
                </div>
                <div style="font-size:13px; color:#94a3b8; margin-bottom:20px;">
                    Review the filled values below, then confirm.
                </div>
                <div style="background:#0f172a; border-radius:8px; padding:16px; margin-bottom:20px; display:flex; flex-direction:column; gap:12px; font-size:14px;">
                    <div style="display:flex; gap:8px;"><span style="color:#94a3b8; min-width:80px;">Consumer</span><strong>${item.consumerName}</strong></div>
                    <div style="display:flex; gap:8px;"><span style="color:#94a3b8; min-width:80px;">Staff</span><strong>${item.staffName}</strong></div>
                    <div style="display:flex; gap:8px;"><span style="color:#94a3b8; min-width:80px;">Date/Time</span><strong>${item.dateTime}</strong></div>
                </div>
                <div style="display:flex; gap:10px;">
                    <button id="autofill-proceed" style="
                        flex:1; padding:12px; background:linear-gradient(45deg,#22c55e,#16a34a);
                        color:white; border:none; border-radius:8px; font-size:14px;
                        font-weight:600; cursor:pointer;">Submit &#10003;</button>
                    <button id="autofill-cancel" style="
                        flex:1; padding:12px; background:linear-gradient(45deg,#ef4444,#dc2626);
                        color:white; border:none; border-radius:8px; font-size:14px;
                        font-weight:600; cursor:pointer;">Cancel &#10007;</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);

        document.getElementById('autofill-proceed').addEventListener('click', () => {
            overlay.remove();
            resolve(true);
        });
        document.getElementById('autofill-cancel').addEventListener('click', () => {
            overlay.remove();
            resolve(false);
        });
    });
}

// ========================
// EXTENSION MESSAGING
// ========================

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "processQueue") {
        processNextInQueue();
        sendResponse({ status: "started" });
    }
    return true;
});

// ========================
// QUEUE PROCESSING
// ========================

async function processNextInQueue() {
    const data = await new Promise(resolve =>
        chrome.storage.local.get(['submissionQueue', 'submissionTotal'], resolve)
    );
    const { submissionQueue, submissionTotal } = data;
    if (!submissionQueue || submissionQueue.length === 0) return;

    const [current, ...remaining] = submissionQueue;
    const total = submissionTotal || 1;
    const currentNum = total - remaining.length;
    const isLast = remaining.length === 0;

    const autofillManager = new AutofillManager();
    autofillManager.showStatus(`Filling ${currentNum} of ${total}...`);

    await autofillManager.runFullSequence(
        current.consumerName,
        current.staffName,
        current.dateTime
    );

    // Show on-page confirm overlay — works whether popup is open or closed
    const confirmed = await showConfirmOverlay(current, currentNum, total);

    if (!confirmed) {
        await new Promise(resolve =>
            chrome.storage.local.remove(['submissionQueue', 'submissionTotal', 'formPageUrl'], resolve)
        );
        return;
    }

    // Save remaining queue + current URL before submit triggers navigation
    await new Promise(resolve =>
        chrome.storage.local.set({
            submissionQueue: remaining,
            formPageUrl: isLast ? null : window.location.href
        }, resolve)
    );

    await autofillManager.executeAutoSubmit();
}

// ========================
// INITIALIZATION
// ========================

(async () => {
    try {
        const data = await new Promise(resolve =>
            chrome.storage.local.get(['submissionQueue', 'formPageUrl'], resolve)
        );
        const { submissionQueue, formPageUrl } = data;

        if (!submissionQueue || submissionQueue.length === 0) return;

        if (!document.getElementById('consumer_id')) {
            // On dashboard or redirect — navigate back to the form
            if (formPageUrl) window.location.href = formPageUrl;
            return;
        }

        // On the form page — wait for DOM to settle then process next
        await new Promise(r => setTimeout(r, 800));
        await processNextInQueue();
    } catch (e) {
        console.error('[Autofill Queue]', e);
    }
})();
