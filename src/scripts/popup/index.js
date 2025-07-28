const { WEBURL } = require("../../utils/constant");
const {
  publishEvent,
  populateBoards,
  populateContactType,
  getAuthToken,
  isLinkedInSearchResultsUrl,
  setImportButtonState,
  populateListType,
} = require("../../utils/utils");
require("../../styles/tailwind.css");

document.addEventListener("DOMContentLoaded", async function () {
  // Elements
  const activeToggle = document.getElementById("activeToggle");
  const commentsPosted = document.getElementById("commentsPosted");
  const postsLiked = document.getElementById("postsLiked");
  const limitProgress = document.getElementById("limitProgress");
  const limitText = document.getElementById("limitText");
  const openOptionsBtn = document.getElementById("openOptions");
  const createListBtn = document.getElementById("create_list");
  const boardSelect = document.getElementById("boardSelect");
  const quantitySelect = document.getElementById("quantitySelect");
  const importBtn = document.getElementById("importBtn");
  const importBtn2 = document.getElementById("importBtn2");
  const domeContent = document.getElementById("dom-content");
  const statesContent = document.getElementById("stats-content");
  const contactTypeSelect = document.getElementById("contact-list");
  const segmentListTypes = document.getElementById("segment-list");
  const linkedinPeopleContent = document.getElementById(
    "linkedinPeopleContent"
  );
  const engagementlistBtn = document.getElementById("engagementTabBtn");
  const progressElement = document.getElementById("progress");
  const stopBtn = document.getElementById("stop-btn");
  const progressBar = document.querySelector(".progress-bar");
  const totalCount = document.getElementById("totalCount");
  const importedCount = document.getElementById("importedCount");
  const statusText = document.getElementById("status-text");
  const pauseResumeBtn = document.getElementById("pause-resume");

  const notLoginContent = document.getElementById("notLoginContent");
  const isSwitchOn = false;
  // ======================
  // Helper UI Functions
  // ======================

  // Check if loaded in a 'widget' context (e.g., via query parameter)
  const urlParams = new URLSearchParams(window.location.search);
  if (urlParams.get("context") === "widget") {
    const statsContent = document.getElementById("stats-content");
    console.log({ statsContent });
    if (statsContent) {
      statsContent.style.display = "none";
    }
  }

  function checkAndSetImportButtonState() {
    // Always disable import button if not authenticated
    if (!token) {
      setImportButtonState(true);
      return;
    }
    const isActive = activeToggle.checked;
    if (!isActive) {
      setImportButtonState(true); // If main toggle is off, button is disabled
      return;
    }
    const isReady =
      boardSelect.value &&
      quantitySelect.value &&
      contactTypeSelect.value &&
      segmentListTypes.value;
    setImportButtonState(!isReady);
  }

  // ======================
  // Initial Data Loading
  // ======================
  chrome.storage.local.get(
    ["active", "postsLiked", "commentsPosted", "dailyLimit"],
    function (data) {
      activeToggle.checked = data.active !== false;
      commentsPosted.textContent = data.commentsPosted || 0;
      postsLiked.textContent = data.postsLiked || 0;

      const limit = data.dailyLimit || 100;
      const posted = data.commentsPosted || 0;
      const percentage = Math.min(Math.round((posted / limit) * 100), 100);

      limitProgress.style.width =
        posted >= limit || data?.postsLiked >= limit
          ? `100%`
          : `${percentage}%`;
      limitText.textContent =
        posted >= limit || data?.postsLiked >= limit
          ? `${limit}/${limit}`
          : `${posted}/${limit}`;

      if (percentage > 90) {
        limitProgress.classList.replace("bg-blue-600", "bg-red-600");
      } else if (percentage > 70) {
        limitProgress.classList.replace("bg-blue-600", "bg-yellow-600");
      }
      checkAndSetImportButtonState();
    }
  );

  // ======================
  // Event Listeners
  // ======================
  activeToggle.addEventListener("change", function () {
    chrome.storage.local.set({ active: activeToggle.checked }, () => {
      publishEvent({
        action: "updateActiveState",
        active: activeToggle.checked,
      });

      checkAndSetImportButtonState();
    });
  });

  function updateProgress(data, result) {
    console.log("updateProgress - result:", result);
    console.log("updateProgress - data received:", data);

    const domContentElement = domeContent; // Use existing domeContent variable
    if (!progressElement || !domContentElement) {
      console.error("updateProgress - Required DOM elements not found!");
      return;
    }

    const { status, progress, total } = data || {};
    const showProgressStatuses = [
      "importing",
      "finished",
      "paused",
      "resumed",
      "error",
    ];

    const shouldShowProgress = showProgressStatuses.includes(status);
    const shouldHideDomContent = shouldShowProgress;

    // Toggle display
    domContentElement.style.display = shouldHideDomContent ? "none" : "block";
    progressElement.style.display = shouldShowProgress ? "block" : "none";
    stopBtn.style.display = shouldShowProgress ? "flex" : "none";

    if (shouldShowProgress) {
      // Handle loading text visibility
      const loadingDiv = document.getElementById("loading-div");
      if (loadingDiv) {
        if (status === "finished" || status === "error") {
          loadingDiv.style.display = "none"; // Hide "Importing, please wait..." for finished/error states
        } else {
          loadingDiv.style.display = "block"; // Show loading text for other states
        }
      }

      // Set progress bar
      const percent = total > 0 ? Math.min((progress / total) * 100, 100) : 0;
      progressBar.style.width = `${percent}%`;

      // Update counts
      totalCount.textContent = `Total: ${total || 0}`;
      importedCount.textContent = `Imported: ${progress || 0}`;

      // Button and status text
      pauseResumeBtn.textContent = "Stop Importing";

      if (status === "finished") {
        statusText.textContent = "Import completed successfully!";
        pauseResumeBtn.style.display = "none"; // Hide the button for finished state
        // Auto-reset after 3 seconds
        setTimeout(() => {
          chrome.storage.local.remove("scrapeMetadata", () => {
            updateProgress(null);
            setImportButtonState(false);
            showImportError("");
          });
        }, 3000);
      } else if (status === "error") {
        statusText.textContent = data.error || "Import failed";
        pauseResumeBtn.style.display = "none"; // Hide the button for errors
        // Auto-reset after 2 seconds
        setTimeout(() => {
          chrome.storage.local.remove("scrapeMetadata", () => {
            updateProgress(null);
            setImportButtonState(false);
            showImportError("");
          });
        }, 2000);
      } else if (status === "importing") {
        statusText.textContent = `Importing... ${progress}/${total}`;
        pauseResumeBtn.textContent = "Stop Importing";
        pauseResumeBtn.disabled = false;
        pauseResumeBtn.style.display = "flex";
      } else if (status === "paused") {
        statusText.textContent = "Import paused";
        pauseResumeBtn.textContent = "Resume Importing";
        pauseResumeBtn.disabled = false;
        pauseResumeBtn.style.display = "flex";
      } else if (status === "resumed") {
        statusText.textContent = "Import resumed";
        pauseResumeBtn.textContent = "Stop Importing";
        pauseResumeBtn.disabled = false;
        pauseResumeBtn.style.display = "flex";
      }
    }
  }

  function updateButtonState(url) {
    if (isLinkedInSearchResultsUrl(url)) {
    } else {
      domeContent.style.display = "none";
      linkedinPeopleContent.style.display = "block";
    }
  }

  async function fetchCurrentTabUrl() {
    let [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url) {
      updateButtonState(tab.url);
    } else {
      console.log("No active tab found or URL is undefined.");
      updateButtonState("");
    }
  }

  openOptionsBtn.addEventListener("click", function () {
    chrome.runtime.openOptionsPage();
  });

  engagementlistBtn.addEventListener("click", function (event) {
    event.stopPropagation(); // Prevent event from bubbling to linkedinPeopleContent

    const optionsUrl = chrome.runtime.getURL("options.html");
    const targetUrlWithFragment = optionsUrl + "#listSegments";

    // Ensure the options page is open and focused, then set the fragment.
    chrome.runtime.openOptionsPage(() => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error opening options page:",
          chrome.runtime.lastError.message
        );
        // Fallback: try to create the tab directly if openOptionsPage failed
        chrome.tabs.create({ url: targetUrlWithFragment });
        return;
      }

      // Options page is now open/focused. Find it and update its URL to ensure the fragment.
      chrome.tabs.query({ url: optionsUrl + "*" }, (tabs) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Error querying for options tab:",
            chrome.runtime.lastError.message
          );
          chrome.tabs.create({ url: targetUrlWithFragment }); // Fallback
          return;
        }

        const optionsTab = tabs.find((tab) => tab.url.startsWith(optionsUrl));

        if (optionsTab) {
          // If the tab is found, update its URL to include the fragment and make it active.
          chrome.tabs.update(optionsTab.id, {
            url: targetUrlWithFragment,
            active: true,
          });
        } else {
          console.warn(
            "Options page not found after openOptionsPage call. Creating new tab as fallback."
          );
          chrome.tabs.create({ url: targetUrlWithFragment });
        }
      });
    });
  });

  createListBtn.addEventListener("click", function (event) {
    event.stopPropagation();
    const domContent = document.getElementById("dom-content");
    if (!domContent) return;
    // Save the parent and next sibling for restoration
    const parent = domContent.parentNode;
    const nextSibling = domContent.nextSibling;
    // Remove dom-content from DOM (not just hide)
    parent.removeChild(domContent);

    // Create the form container
    const formContainer = document.createElement("div");
    formContainer.id = "popup-create-list-form-container";
    formContainer.className = "mt-6 p-4 border rounded-md bg-gray-50";
    formContainer.innerHTML = `
      <div id="popup-create-list-error" class="text-red-600 text-sm mb-2" style="display:none;"></div>
      <h3 class="text-lg font-semibold mb-3">Create New Segment List</h3>
      <div class="mb-3">
        <label for="popup-new-list-name" class="block text-sm font-medium text-gray-700 mb-1">List Name <span class="text-red-500">*</span></label>
        <input type="text" id="popup-new-list-name" placeholder="E.g., 'Tech Leads in SF'" class="form-input mt-1 p-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50" required />
      </div>
      <div class="mb-4">
        <label for="popup-new-list-prompt" class="block text-sm font-medium text-gray-700 mb-1">Engagement Prompt <span class="text-red-500"></span></label>
        <textarea id="popup-new-list-prompt" rows="5" placeholder="Enter the engagement prompt for this list..." class="form-input mt-1 p-2 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring focus:ring-blue-500 focus:ring-opacity-50"></textarea>
        <p class="text-xs text-gray-500 mt-1">This prompt will be used for engagements initiated from this list.</p>
      </div>
      <div class="flex justify-end space-x-3">
        <button id="popup-cancel-new-list-btn"               class="px-4 py-2 bg-transparent text-gray-800 rounded-lg border border-[#dfdfdf] shadow-[0_1px_3px_rgba(0,0,0,0.1)] hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-opacity-50"
>Cancel</button>
        <button style="background-color: #101112;" id="popup-save-new-list-btn" class="primary-btn px-4 py-2 text-white rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-opacity-50"
>Save List</button>
      </div>
    `;
    // Insert the form exactly where dom-content was
    if (nextSibling) {
      parent.insertBefore(formContainer, nextSibling);
    } else {
      parent.appendChild(formContainer);
    }

    // Cancel button logic
    formContainer.querySelector("#popup-cancel-new-list-btn").onclick =
      function () {
        parent.removeChild(formContainer);
        if (nextSibling) {
          parent.insertBefore(domContent, nextSibling);
        } else {
          parent.appendChild(domContent);
        }
      };

    // Save button logic (replace with your actual save logic)
    formContainer.querySelector("#popup-save-new-list-btn").onclick =
      async function () {
        const name = formContainer
          .querySelector("#popup-new-list-name")
          .value.trim();
        const prompt = formContainer
          .querySelector("#popup-new-list-prompt")
          .value.trim();
        const errorDiv = formContainer.querySelector(
          "#popup-create-list-error"
        );
        errorDiv.style.display = "none";
        errorDiv.textContent = "";
        if (!name) {
          errorDiv.textContent = "List Name is required.";
          errorDiv.style.display = "block";
          return;
        }
        const { getAuthToken } = require("../../utils/utils");
        const { APIURL, DEFAULT_SETTINGS } = require("../../utils/constant");

        const businessId = boardSelect ? boardSelect.value : null;
        const token = await getAuthToken();
        if (!token) {
          errorDiv.textContent = "Authentication failed. Please log in again.";
          errorDiv.style.display = "block";
          return;
        }
        if (!businessId) {
          errorDiv.textContent = "Please select a workspace.";
          errorDiv.style.display = "block";
          return;
        }
        const payload = {
          name: name,
          type: 1,
          archive_date: new Date().toISOString(),
          engagement_prompt: prompt ? prompt : DEFAULT_SETTINGS.userPrompt,
        };
        try {
          const response = await fetch(`${APIURL}/segmentation`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
              "b-id": businessId,
            },
            body: JSON.stringify(payload),
          });
          if (!response.ok) {
            let errorData = { message: `HTTP error ${response.status}` };
            try {
              const responseBody = await response.json();
              errorData.message =
                responseBody.message ||
                responseBody.error ||
                (responseBody.errors &&
                  responseBody.errors[
                    Object.keys(responseBody.errors)[0]
                  ][0]) ||
                errorData.message;
            } catch (e) {
              errorData.message = response.statusText || errorData.message;
            }
            errorDiv.textContent = `Error creating list: ${errorData.message}`;
            errorDiv.style.display = "block";
            return;
          }
          // Success: restore content and refresh segment list dropdown
          parent.removeChild(formContainer);
          if (nextSibling) {
            parent.insertBefore(domContent, nextSibling);
          } else {
            parent.appendChild(domContent);
          }
          if (typeof fetchAndPopulateSegmentListPopup === "function") {
            fetchAndPopulateSegmentListPopup(
              token,
              businessId,
              segmentListTypes
            );
          }
          // Optionally show a success message (could use notification)
        } catch (error) {
          errorDiv.textContent =
            "Failed to create list due to a network or unexpected error.";
          errorDiv.style.display = "block";
        }
      };
  });



  linkedinPeopleContent.addEventListener("click", function () {
    chrome.tabs.query({ pinned: true, currentWindow: true }, function (tabs) {
      const linkedInTab = tabs.find((tab) => tab.url.includes("linkedin.com"));
      const linkedInPeopleURL =
        "https://www.linkedin.com/search/results/people/?network=%5B%22F%22%2C%22S%22%5D&origin=FACETED_SEARCH&sid=St%3A";

      if (linkedInTab) {
        chrome.tabs.update(linkedInTab.id, {
          active: true,
          url: linkedInPeopleURL,
        });
      } else {
        chrome.tabs.create({
          url: linkedInPeopleURL,
          pinned: true,
        });
      }
    });
  });

  // ======================
  // Import Functionality
  // ======================
  const token = await getAuthToken();

  if (token) {
    fetchCurrentTabUrl();
    domeContent.style.display = "block"; // Show main content
    openOptionsBtn.style.display = "block";
    statesContent.style.display = "block";
    notLoginContent.style.display = "none";

    // Trigger the general core user data check from background on popup open
    chrome.runtime.sendMessage(
      { action: "TRIGGER_CORE_USER_DATA_CHECK_FROM_POPUP" },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error(
            "Popup: Error triggering core user data check from background:",
            chrome.runtime.lastError.message
          );
        } else {
          console.log(
            "Popup: Core user data check triggered in background. Response:",
            response
          );
          if (response && response.success) {
            // Optionally, use response.data here to update popup UI if needed
            // For example, display user's name: console.log("User:", response.data?.user?.name);
          }
        }
      }
    );

    // Initial population attempts
    boardSelect.innerHTML = '<option value="">Loading boards...</option>';
    contactTypeSelect.innerHTML = '<option value=""></option>'; // Keep it empty initially
    segmentListTypes.innerHTML = '<option value=""></option>'; // Keep it empty initially
    checkAndSetImportButtonState(); // Will disable button due to loading/empty selects

    chrome.runtime.sendMessage(
      { action: "FETCH_BOARDS_BG", token },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.error(
            "Popup: Board loading failed:",
            chrome.runtime.lastError?.message || response?.error
          );
          boardSelect.innerHTML =
            '<option value="">Error loading boards</option>';
          contactTypeSelect.innerHTML = "";
          segmentListTypes.innerHTML = "";
          checkAndSetImportButtonState();
          return;
        }

        populateBoards(boardSelect, response.data);
        if (boardSelect.options.length > 0 && boardSelect.options[0].value) {
          const defaultBoardId = boardSelect.options[0].value;
          boardSelect.value = defaultBoardId; // Set the value

          fetchAndPopulateContactTypesPopup(
            token,
            defaultBoardId,
            contactTypeSelect
          );
          fetchAndPopulateSegmentListPopup(
            token,
            defaultBoardId,
            segmentListTypes
          );
        } else {
          if (
            boardSelect.options.length === 1 &&
            !boardSelect.options[0].value
          ) {
            // Only the placeholder is there
            boardSelect.innerHTML = '<option value="">No boards found</option>';
          } else if (boardSelect.options.length === 0) {
            boardSelect.innerHTML = '<option value="">No boards found</option>';
          }
          // Clear dependent dropdowns if no valid board is selected or found
          contactTypeSelect.innerHTML = "";
          segmentListTypes.innerHTML = "";
        }
        checkAndSetImportButtonState();
      }
    );
  } else {
    // Hide the import buttons if token is not present
    if (importBtn) {
      importBtn.style.display = 'none';
    }
    if (importBtn2) {
      importBtn2.style.display = 'none';
    }
    // Check if on LinkedIn People Search page
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      const url = tab?.url || "";
      const isLinkedInPeopleSearch = url.startsWith(
        "https://www.linkedin.com/search/results/people/"
      );

      if (isLinkedInPeopleSearch) {
        domeContent.style.display = "block";
        openOptionsBtn.style.display = "block";
        statesContent.style.display = "block";
        notLoginContent.style.display = "none";

        // Disable all selects and import button, set placeholder
        [
          boardSelect,
          quantitySelect,
          contactTypeSelect,
          segmentListTypes,
        ].forEach((select) => {
          if (select) {
            select.disabled = true;
            // Set placeholder/option
            select.innerHTML =
              '<option value="">Authentication needed</option>';
          }
        });
        if (importBtn) {
          importBtn.disabled = true;
        }

        // Add login message below dom-content if not already present
        let loginMsg = document.getElementById("loginMsgBelowDomContent");
        if (!loginMsg) {
          loginMsg = document.createElement("div");
          loginMsg.id = "loginMsgBelowDomContent";
          loginMsg.className =
            "mt-4 bg-white rounded-lg shadow p-3 flex flex-col items-center";
          loginMsg.innerHTML = `
            <div class="mb-2 flex justify-center">
              <svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 11c1.104 0 2-.896 2-2V7a2 2 0 10-4 0v2c0 1.104.896 2 2 2zm6 2v5a2 2 0 01-2 2H8a2 2 0 01-2-2v-5a6 6 0 1112 0z" /></svg>
            </div>
            <p class="text-sm text-gray-700 mb-2 text-center">To import LinkedIn prospects, you need to log in to ManagePlus.</p>
            <button class="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 text-white font-semibold py-2 px-4 rounded-lg transition duration-300 shadow" id="loginBtnBelowDomContent">Login to ManagePlus</button>
          `;
          domeContent.parentNode.insertBefore(
            loginMsg,
            domeContent.nextSibling
          );
        }
        // Add event listener for login button
        const loginBtnBelow = document.getElementById(
          "loginBtnBelowDomContent"
        );
        if (loginBtnBelow) {
          loginBtnBelow.onclick = function () {
            chrome.tabs.create({ url: WEBURL });
          };
        }
      } else {
        domeContent.style.display = "none";
        openOptionsBtn.style.display = "block";
        statesContent.style.display = "block";
        notLoginContent.style.display = "block";
        // Remove login message if present
        const loginMsg = document.getElementById("loginMsgBelowDomContent");
        if (loginMsg) loginMsg.remove();
      }
    });
    checkAndSetImportButtonState(); // Ensure button state is correct (likely disabled)

    // Add event listeners for quick actions in logged out state
    const quickImportProspects = document.getElementById(
      "quickImportProspects"
    );
    const quickViewActivity = document.getElementById("quickViewActivity");
    const quickManageEngagement = document.getElementById(
      "quickManageEngagement"
    );
    const quickFeedEngagment = document.getElementById("quickStartEngagement");
    if (quickImportProspects) {
      quickImportProspects.addEventListener("click", function () {
        // Same as Navigate to LinkedIn Search
        chrome.tabs.query(
          { pinned: true, currentWindow: true },
          function (tabs) {
            const linkedInTab = tabs.find((tab) =>
              tab.url.includes("linkedin.com")
            );
            const linkedInPeopleURL =
              "https://www.linkedin.com/search/results/people/?network=%5B%22F%22%2C%22S%22%5D&origin=FACETED_SEARCH&sid=St%3A";

            if (linkedInTab) {
              chrome.tabs.update(linkedInTab.id, {
                active: true,
                url: linkedInPeopleURL,
              });
            } else {
              chrome.tabs.create({
                url: linkedInPeopleURL,
                pinned: true,
              });
            }
          }
        );
      });
    }
    if (quickFeedEngagment) {
      quickFeedEngagment.addEventListener("click", function () {
        // Same as Navigate to LinkedIn Search
        chrome.tabs.query(
          { pinned: true, currentWindow: true },
          function (tabs) {
            const linkedInTab = tabs.find((tab) =>
              tab.url.includes("linkedin.com")
            );
            const linkedInPeopleURL = "https://www.linkedin.com/feed";

            if (linkedInTab) {
              chrome.tabs.update(linkedInTab.id, {
                url: linkedInPeopleURL,
              });
            } else {
              chrome.tabs.create({
                url: linkedInPeopleURL,
                pinned: true,
              });
            }
          }
        );
      });
    }
    if (quickViewActivity) {
      quickViewActivity.addEventListener("click", function () {
        const optionsUrl = chrome.runtime.getURL("options.html");
        const targetUrlWithFragment = optionsUrl + "#engagementActivity";
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: targetUrlWithFragment });
            return;
          }
          chrome.tabs.query({ url: optionsUrl + "*" }, (tabs) => {
            const optionsTab = tabs.find((tab) =>
              tab.url.startsWith(optionsUrl)
            );
            if (optionsTab) {
              chrome.tabs.update(optionsTab.id, {
                url: targetUrlWithFragment,
                active: true,
              });
            } else {
              chrome.tabs.create({ url: targetUrlWithFragment });
            }
          });
        });
      });
    }
    if (quickManageEngagement) {
      quickManageEngagement.addEventListener("click", function () {
        const optionsUrl = chrome.runtime.getURL("options.html");
        const targetUrlWithFragment = optionsUrl + "#listSegments";
        chrome.runtime.openOptionsPage(() => {
          if (chrome.runtime.lastError) {
            chrome.tabs.create({ url: targetUrlWithFragment });
            return;
          }
          chrome.tabs.query({ url: optionsUrl + "*" }, (tabs) => {
            const optionsTab = tabs.find((tab) =>
              tab.url.startsWith(optionsUrl)
            );
            if (optionsTab) {
              chrome.tabs.update(optionsTab.id, {
                url: targetUrlWithFragment,
                active: true,
              });
            } else {
              chrome.tabs.create({ url: targetUrlWithFragment });
            }
          });
        });
      });
    }
  }

  boardSelect.addEventListener("change", async (event) => {
    const selectedBusinessId = event.target.value;
    contactTypeSelect.innerHTML = '<option value=""></option>'; // Clear and set placeholder
    segmentListTypes.innerHTML = '<option value=""></option>'; // Clear and set placeholder

    if (selectedBusinessId && token) {
      fetchAndPopulateContactTypesPopup(
        token,
        selectedBusinessId,
        contactTypeSelect
      );
      fetchAndPopulateSegmentListPopup(
        token,
        selectedBusinessId,
        segmentListTypes
      );
    }
    checkAndSetImportButtonState(); // Will disable button until new lists are loaded
  });

  [quantitySelect, contactTypeSelect, segmentListTypes].forEach((select) => {
    select.addEventListener("change", () => {
      checkAndSetImportButtonState();
    });
  });
  // Note: boardSelect's change listener is separate and already calls checkAndSetImportButtonState

  // Popup functions to request data from background and populate UI
  async function fetchAndPopulateContactTypesPopup(
    token,
    businessId,
    selectElement
  ) {
    selectElement.innerHTML = '<option value="">Loading types...</option>';
    checkAndSetImportButtonState();

    chrome.runtime.sendMessage(
      { action: "FETCH_CONTACT_TYPES_BG", token, businessId },
      (response) => {
        if (chrome.runtime.lastError || !response || !response.success) {
          console.error(
            "Popup: Contact type loading failed:",
            chrome.runtime.lastError?.message || response?.error
          );
          selectElement.innerHTML = `<option value="">Error loading</option>`;
        } else {
          populateContactType(selectElement, response.data);
        }
        checkAndSetImportButtonState();
      }
    );
  }

  async function fetchAndPopulateSegmentListPopup(
    token,
    businessId,
    selectElement
  ) {
    selectElement.innerHTML = '<option value="">Loading segments...</option>';
    try {
      chrome.runtime.sendMessage(
        { action: "FETCH_SEGMENT_LIST_BG", token, businessId },
        (response) => {
          if (chrome.runtime.lastError || !response || !response.success) {
            console.error(
              "Popup: Segment list loading failed:",
              chrome.runtime.lastError?.message || response?.error
            );
            selectElement.innerHTML = `<option value="">Error loading</option>`;
          } else {
            populateListType(selectElement, response.data);
          }
          checkAndSetImportButtonState();
        }
      );
    } catch (error) {
      // Should not be needed due to sendMessage callback error handling
      console.error("Popup: Segment list loading failed (outer catch):", error);
      selectElement.innerHTML = `<option value="">Error loading</option>`;
      checkAndSetImportButtonState();
    }
  }

  // Add error message div for import errors
  let importErrorDiv = document.getElementById("import-error-message");
  if (!importErrorDiv) {
    importErrorDiv = document.createElement("div");
    importErrorDiv.id = "import-error-message";
    importErrorDiv.className = "text-red-600 text-sm mb-2";
    importErrorDiv.style.display = "none";
    domeContent.insertBefore(importErrorDiv, domeContent.firstChild);
  }

  // Helper to show/hide import error
  function showImportError(msg) {
    importErrorDiv.textContent = msg;
    importErrorDiv.style.display = msg ? "block" : "none";
  }

  // Robustly check import state and update UI
  async function syncImportState() {
    chrome.storage.local.get(["scrapeMetadata"], (result) => {
      const meta = result.scrapeMetadata;
      if (meta) {
        if (meta.status === "importing") {
          setImportButtonState(true); // Disable import button
          showImportError("");
          updateProgress(meta);
        } else if (meta.status === "error") {
          setImportButtonState(false);
          showImportError(""); // Don't show error message in import error div
          updateProgress(meta);
        } else if (meta.status === "finished") {
          setImportButtonState(false);
          showImportError("");
          updateProgress(meta);
        } else if (meta.status === "paused" || meta.status === "resumed") {
          setImportButtonState(true);
          showImportError("");
          updateProgress(meta);
        } else {
          setImportButtonState(false);
          showImportError("");
        }
      } else {
        setImportButtonState(false);
        showImportError("");
      }
    });
  }

  // Call syncImportState on load and on interval
  syncImportState();
  setInterval(syncImportState, 500); // Check every 500ms for real-time updates

  importBtn.addEventListener("click", async () => {
    // Check if already importing
    chrome.storage.local.get(["scrapeMetadata"], async (result) => {
      if (
        result.scrapeMetadata &&
        result.scrapeMetadata.status === "importing"
      ) {
        showImportError("Import already in progress.");
        return;
      }

      // Reset state before import
      chrome.storage.local.remove("scrapeMetadata", async () => {
        showImportError("");

        // Show progress immediately
        updateProgress({
          status: "importing",
          progress: 0,
          total: quantitySelect?.value || 50,
        });

        const [tab] = await chrome.tabs.query({
          active: true,
          currentWindow: true,
        });
        if (!tab) return;

        // Set up message listener for currentDd
        chrome.runtime.onMessage.addListener(
          (message, sender, sendResponse) => {
            if (message.action === "currentDd") {
              sendResponse({
                value: quantitySelect?.value || 20,
                token: token,
                contact_type: contactTypeSelect?.value || 0,
                board: boardSelect?.value || 0,
                segment_list: segmentListTypes?.value || 0,
              });
              return true;
            }
          }
        );

        // Execute the import script
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ["js/import.js"],
        });
      });
    });
  });

  document
    .getElementById("pause-resume")
    .addEventListener("click", async () => {
      let [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      if (!tab) {
        console.log("No active tab found.");
        return;
      }

      // Check current status to determine action
      chrome.storage.local.get(["scrapeMetadata"], (result) => {
        const currentStatus = result.scrapeMetadata?.status;

        if (currentStatus === "importing") {
          // Stop the import
          chrome.storage.local.set(
            {
              scrapeMetadata: {
                ...result.scrapeMetadata,
                status: "stop",
              },
            },
            () => {
              console.log("Import stopped by user");
              chrome.tabs.sendMessage(tab.id, { action: "stop" });
              // Immediately reset UI to default
              chrome.storage.local.remove("scrapeMetadata", () => {
                updateProgress(null);
                setImportButtonState(false);
                showImportError("");
              });
            }
          );
        } else if (currentStatus === "paused") {
          // Resume the import
          chrome.storage.local.set(
            {
              scrapeMetadata: {
                ...result.scrapeMetadata,
                status: "resumed",
              },
            },
            () => {
              console.log("Import resumed by user");
              chrome.tabs.sendMessage(tab.id, { action: "resumed" });
            }
          );
        } else if (currentStatus === "finished" || currentStatus === "error") {
          // Clear the metadata to reset state
          chrome.storage.local.remove("scrapeMetadata", () => {
            console.log("Import state cleared");
            updateProgress(null);
          });
        }
      });
    });

  // Listen for messages from content script to enable/disable import button
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === "DISABLE_IMPORT_BUTTON") {
      importBtn.style.display = "none";
      importBtn2.style.display = "block";
    } else if (message.action === "ENABLE_IMPORT_BUTTON") {
      importBtn.style.display = "block";
      importBtn2.style.display = "none";
    }
  });
});
