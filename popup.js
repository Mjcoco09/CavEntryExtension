document.addEventListener('DOMContentLoaded', () => {
    const runButton = document.getElementById('runButton');
    const autoSubmit = document.getElementById('autoSubmit');
    const consumerInput = document.getElementById('consumerName');
    const staffInput = document.getElementById('staffName');
    const suggestionsDiv = document.getElementById('staffSuggestions');
    const errorContainer = document.getElementById('errorContainer');
    const errorMessage = document.getElementById('errorMessage');
    const errorClose = document.getElementById('errorClose');
    const clearButton = document.getElementById('clearButton');
    const presetSelect = document.getElementById('presetSelect');
    const presetName = document.getElementById('presetName');
    const savePresetBtn = document.getElementById('savePreset');
    const loadPresetBtn = document.getElementById('loadPreset');
    const deletePresetBtn = document.getElementById('deletePreset');
    const consumerSuggestionsDiv = document.getElementById('consumerSuggestions');

    let currentStaffSuggestions = [];
    let currentConsumerMatches = [];
    let selectedSuggestionIndex = -1;
    let currentTabId = null;
    let presets = [];
    let dateTimes = [''];  // array of datetime-local strings

    // Load saved settings and values
    chrome.storage.sync.get(
        ['autoSubmit', 'consumerName', 'staffName', 'dateTimes', 'dateTime', 'presets'], 
        (result) => {
            autoSubmit.checked = result.autoSubmit || false;
            consumerInput.value = result.consumerName || '';
            staffInput.value = result.staffName || '';
            // Migrate from old single dateTime to new array
            if (result.dateTimes && result.dateTimes.length > 0) {
                dateTimes = result.dateTimes;
            } else if (result.dateTime) {
                dateTimes = [result.dateTime];
            } else {
                dateTimes = [''];
            }
            renderDateTimeList();
            presets = result.presets || [];
            updatePresetDropdown();
        }
    );

    // Event listeners
    autoSubmit.addEventListener('change', () => {
        chrome.storage.sync.set({ autoSubmit: autoSubmit.checked });
    });

    consumerInput.addEventListener('keypress', async (e) => {
        if (e.key === 'Enter') await handleConsumerSearch();
    });

    consumerInput.addEventListener('input', () => {
        chrome.storage.sync.set({ consumerName: consumerInput.value });
    });

    staffInput.addEventListener('input', () => {
        chrome.storage.sync.set({ staffName: staffInput.value });
        handleStaffInput();
    });

    document.getElementById('addDateTime').addEventListener('click', () => {
        if (dateTimes.length < 5) {
            dateTimes.push('');
            chrome.storage.sync.set({ dateTimes });
            renderDateTimeList();
        } else {
            showError('Maximum 5 date/time slots allowed');
        }
    });

    staffInput.addEventListener('keydown', handleStaffKeydown);
    staffInput.addEventListener('focus', handleStaffInput);
    staffInput.addEventListener('blur', (e) => {
        // Delay hiding to allow click events on suggestions
        setTimeout(() => hideSuggestions(), 150);
    });
    
    // Close suggestions when clicking outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.autocomplete')) {
            hideSuggestions();
            hideConsumerSuggestions();
        }
    });
    
    // Close on Escape key
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            hideSuggestions();
            hideConsumerSuggestions();
            staffInput.blur();
            consumerInput.blur();
        }
    });
    
    runButton.addEventListener('click', handleRun);
    errorClose.addEventListener('click', () => errorContainer.style.display = 'none');
    
    clearButton.addEventListener('click', () => {
        chrome.storage.sync.remove(['consumerName', 'staffName', 'dateTimes', 'dateTime']);
        chrome.storage.local.remove(['submissionQueue', 'submissionTotal', 'formPageUrl']);
        consumerInput.value = '';
        staffInput.value = '';
        dateTimes = [''];
        renderDateTimeList();
        suggestionsDiv.innerHTML = '';
        errorContainer.style.display = 'none';
    });

    // Preset event listeners
    savePresetBtn.addEventListener('click', savePreset);
    loadPresetBtn.addEventListener('click', loadSelectedPreset);
    deletePresetBtn.addEventListener('click', deleteSelectedPreset);
    presetSelect.addEventListener('dblclick', loadSelectedPreset);

    function savePreset() {
        const name = presetName.value.trim();
        if (!name) {
            showError('Please enter a preset name');
            return;
        }

        const consumer = consumerInput.value.trim();
        const staff = staffInput.value.trim();

        if (!consumer && !staff) {
            showError('Please fill at least consumer or staff name');
            return;
        }

        // Check if preset with same name exists
        const existingIndex = presets.findIndex(p => p.name.toLowerCase() === name.toLowerCase());
        
        const newPreset = {
            name: name,
            consumerName: consumer,
            staffName: staff
        };

        if (existingIndex >= 0) {
            presets[existingIndex] = newPreset; // Update existing
        } else {
            presets.push(newPreset); // Add new
        }

        chrome.storage.sync.set({ presets }, () => {
            updatePresetDropdown();
            presetName.value = '';
            presetSelect.value = name;
        });
    }

    async function loadSelectedPreset() {
        const selectedName = presetSelect.value;
        if (!selectedName) {
            showError('Please select a preset');
            return;
        }

        const preset = presets.find(p => p.name === selectedName);
        if (preset) {
            // Set consumer name first
            consumerInput.value = preset.consumerName || '';
            chrome.storage.sync.set({ consumerName: preset.consumerName });

            // Trigger consumer search (simulates Enter press) to load staff dropdown
            if (preset.consumerName) {
                await handleConsumerSearch();
            }

            // Now set the staff name after staff list has loaded
            staffInput.value = preset.staffName || '';
            chrome.storage.sync.set({ staffName: preset.staffName });
            
            // Hide the suggestions dropdown since we already have the staff name
            hideSuggestions();
        }
    }

    function deleteSelectedPreset() {
        const selectedName = presetSelect.value;
        if (!selectedName) {
            showError('Please select a preset to delete');
            return;
        }

        presets = presets.filter(p => p.name !== selectedName);
        chrome.storage.sync.set({ presets }, () => {
            updatePresetDropdown();
        });
    }

    function updatePresetDropdown() {
        presetSelect.innerHTML = '<option value="">-- Select a preset --</option>';
        presets.forEach(preset => {
            const option = document.createElement('option');
            option.value = preset.name;
            option.textContent = preset.name;
            presetSelect.appendChild(option);
        });
    }

    async function handleConsumerSearch() {
        const consumer = consumerInput.value.trim();
        if (!consumer) return;

        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            currentTabId = tab.id;

            // First, find all matching consumers
            const matchResults = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                func: (consumerName) => {
                    const dropdown = document.getElementById('consumer_id');
                    if (!dropdown) return { found: false, matches: [] };

                    const matches = [];
                    for (const option of dropdown.options) {
                        if (option.text.toLowerCase().includes(consumerName.toLowerCase())) {
                            matches.push({ value: option.value, text: option.text });
                        }
                    }
                    return { found: matches.length > 0, matches };
                },
                args: [consumer]
            });

            const result = matchResults[0].result;
            
            if (!result.found || result.matches.length === 0) {
                showError('Consumer not found');
                return;
            }

            // If only one match, select it directly
            if (result.matches.length === 1) {
                await selectConsumer(result.matches[0].value);
                return;
            }

            // Multiple matches - show selection UI
            currentConsumerMatches = result.matches;
            showConsumerChoices(result.matches);

        } catch (error) {
            showError('Failed to search consumers');
            console.error(error);
        }
    }

    async function selectConsumer(optionValue) {
        try {
            hideConsumerSuggestions();
            
            const selectionSuccess = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                func: (value) => {
                    const dropdown = document.getElementById('consumer_id');
                    if (!dropdown) return false;
                    
                    dropdown.value = value;
                    const event = new Event('change', { bubbles: true });
                    dropdown.dispatchEvent(event);
                    return true;
                },
                args: [optionValue]
            });

            if (!selectionSuccess[0].result) {
                showError('Failed to select consumer');
                return;
            }

            await new Promise(resolve => setTimeout(resolve, 1500));

            const staffResults = await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                func: () => {
                    const staffDropdown = document.getElementById('staff_member_id');
                    return staffDropdown ? 
                        Array.from(staffDropdown.options)
                            .map(opt => opt.text.trim())
                            .filter(Boolean) : [];
                }
            });

            currentStaffSuggestions = staffResults[0].result;
            showSuggestions(currentStaffSuggestions);
            staffInput.focus();

        } catch (error) {
            showError('Failed to select consumer');
            console.error(error);
        }
    }

    function showConsumerChoices(matches) {
        consumerSuggestionsDiv.innerHTML = matches
            .map((match, index) => `
                <div class="autocomplete-item" data-index="${index}" data-value="${match.value}">
                    ${match.text}
                </div>
            `).join('');
        
        consumerSuggestionsDiv.style.display = 'block';

        consumerSuggestionsDiv.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault();
                const value = e.target.dataset.value;
                const text = e.target.textContent.trim();
                consumerInput.value = text;
                chrome.storage.sync.set({ consumerName: text });
                selectConsumer(value);
            });
        });
    }

    function hideConsumerSuggestions() {
        consumerSuggestionsDiv.innerHTML = '';
        consumerSuggestionsDiv.style.display = 'none';
    }

    function handleStaffInput() {
        const searchTerm = staffInput.value.toLowerCase().trim();
        const filtered = currentStaffSuggestions.filter(name => 
            name.toLowerCase().includes(searchTerm)
        );
        showSuggestions(filtered);
    }

    function handleStaffKeydown(e) {
        if (e.key === 'Escape') {
            hideSuggestions();
            staffInput.blur();
            return;
        }
        if (['ArrowDown', 'ArrowUp', 'Enter', 'Tab'].includes(e.key)) {
            const visibleItems = suggestionsDiv.querySelectorAll('.autocomplete-item');
            if (visibleItems.length === 0 && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) return;
            e.preventDefault();
            handleKeyboardNav(e.key, visibleItems.length);
        }
    }

    function handleKeyboardNav(key, itemCount) {
        const filteredSuggestions = getFilteredSuggestions();
        switch(key) {
            case 'ArrowDown':
                selectedSuggestionIndex = Math.min(selectedSuggestionIndex + 1, filteredSuggestions.length - 1);
                break;
            case 'ArrowUp':
                selectedSuggestionIndex = Math.max(selectedSuggestionIndex - 1, -1);
                break;
            case 'Enter':
            case 'Tab':
                if (selectedSuggestionIndex >= 0 && filteredSuggestions[selectedSuggestionIndex]) {
                    staffInput.value = filteredSuggestions[selectedSuggestionIndex];
                    hideSuggestions();
                    chrome.storage.sync.set({ staffName: staffInput.value });
                }
                break;
        }
        updateSelectedSuggestion();
    }
    
    function getFilteredSuggestions() {
        const searchTerm = staffInput.value.toLowerCase().trim();
        if (!searchTerm) return currentStaffSuggestions;
        return currentStaffSuggestions.filter(name => 
            name.toLowerCase().includes(searchTerm)
        );
    }
    
    function hideSuggestions() {
        suggestionsDiv.innerHTML = '';
        suggestionsDiv.style.display = 'none';
        selectedSuggestionIndex = -1;
    }

    function renderDateTimeList() {
        const list = document.getElementById('dateTimeList');
        list.innerHTML = '';
        dateTimes.forEach((dt, index) => {
            const row = document.createElement('div');
            row.className = 'datetime-row';
            row.innerHTML = `
                <input type="datetime-local" class="datetime-input" value="${dt}" data-index="${index}">
                ${dateTimes.length > 1 ? `<button type="button" class="remove-datetime" data-index="${index}">&times;</button>` : ''}
            `;
            list.appendChild(row);
        });

        list.querySelectorAll('.datetime-input').forEach(input => {
            input.addEventListener('input', (e) => {
                dateTimes[parseInt(e.target.dataset.index)] = e.target.value;
                chrome.storage.sync.set({ dateTimes });
                updateRunButton();
            });
        });

        list.querySelectorAll('.remove-datetime').forEach(btn => {
            btn.addEventListener('click', (e) => {
                dateTimes.splice(parseInt(e.target.dataset.index), 1);
                chrome.storage.sync.set({ dateTimes });
                renderDateTimeList();
            });
        });

        updateRunButton();
    }

    function updateRunButton() {
        const count = dateTimes.filter(dt => dt).length;
        runButton.textContent = count > 1 ? `Run Autofill (${count} submissions)` : 'Run Autofill';
    }

    async function handleRun() {
        const consumer = consumerInput.value.trim();
        const staff = staffInput.value.trim();
        const validDates = dateTimes.filter(dt => dt.trim());

        if (!consumer || !staff || validDates.length === 0) {
            showError('Please fill all fields and at least one date/time');
            return;
        }

        try {
            if (!currentTabId) {
                const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
                currentTabId = tab.id;
            }

            const queue = validDates.map(dt => ({
                consumerName: consumer,
                staffName: staff,
                dateTime: dt.replace('T', ' '),
                autoSubmit: autoSubmit.checked
            }));

            await new Promise(resolve =>
                chrome.storage.local.set({
                    submissionQueue: queue,
                    submissionTotal: queue.length
                }, resolve)
            );

            await chrome.scripting.executeScript({
                target: { tabId: currentTabId },
                files: ['content.js']
            });

            chrome.tabs.sendMessage(currentTabId, { action: 'processQueue' });

            runButton.disabled = true;
            runButton.textContent = 'Filling…';
            // Button resets automatically when popup reopens after navigation

        } catch (error) {
            showError('Failed to initialize autofill');
            console.error(error);
        }
    }

    function showSuggestions(suggestions) {
        if (!suggestions || suggestions.length === 0) {
            hideSuggestions();
            return;
        }
        
        suggestionsDiv.innerHTML = suggestions
            .slice(0, 10) // Limit to 10 items to prevent overflow
            .map((name, index) => `
                <div class="autocomplete-item" data-index="${index}" data-name="${name.replace(/"/g, '&quot;')}">
                    ${name}
                </div>
            `).join('');
        
        suggestionsDiv.style.display = 'block';

        suggestionsDiv.querySelectorAll('.autocomplete-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
                e.preventDefault(); // Prevent blur from firing first
                const name = e.target.dataset.name || e.target.textContent.trim();
                staffInput.value = name;
                chrome.storage.sync.set({ staffName: name });
                hideSuggestions();
            });
        });

        selectedSuggestionIndex = -1;
        updateSelectedSuggestion();
    }

    function updateSelectedSuggestion() {
        suggestionsDiv.querySelectorAll('.autocomplete-item').forEach((item, index) => {
            item.style.backgroundColor = index === selectedSuggestionIndex ? '#6c5ce7' : '';
            item.style.color = index === selectedSuggestionIndex ? 'white' : '#ffffff';
        });
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorContainer.style.display = 'flex';
        setTimeout(() => errorContainer.style.display = 'none', 5000);
    }

    chrome.runtime.onMessage.addListener((request) => {
        if (request.type === 'ERROR') showError(request.message);
    });
});