// Show a numbered badge while queue items remain
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;

    const data = await chrome.storage.local.get(['submissionQueue']);
    const queue = data.submissionQueue;

    if (!queue || queue.length === 0) {
        chrome.action.setBadgeText({ text: '', tabId });
        return;
    }

    chrome.action.setBadgeText({ text: `${queue.length}`, tabId });
    chrome.action.setBadgeBackgroundColor({ color: '#7c6cf7', tabId });
});
