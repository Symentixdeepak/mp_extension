// LinkedIn No Results Observer (runs always on search pages)
(function observeLinkedInNoResults() {
  function checkNoResults() {
    const noResults = document.querySelector('.search-reusable-search-no-results');
    if (noResults) {
      chrome.runtime.sendMessage({ action: 'DISABLE_IMPORT_BUTTON' });
    } else {
      chrome.runtime.sendMessage({ action: 'ENABLE_IMPORT_BUTTON' });
    }
  }
  // Initial check
  checkNoResults();
  // Observe DOM changes
  const observer = new MutationObserver(checkNoResults);
  observer.observe(document.body, { childList: true, subtree: true });
})(); 