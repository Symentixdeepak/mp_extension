// d:\SymentixProject\manageplus\mp-extensions\linkedin-engagement\src\scripts\history\index.js

const XLSX = require("xlsx");
const { formatDateTime, formatDateForExcel } = require("../../utils/date");
const {
  getAuthToken,
  populateBoards,
  truncateWords,

  // We might need a generic API fetch utility or define fetch calls within the class
  // For now, assuming getAuthToken and populateBoards are sufficient from utils
} = require("../../utils/utils"); // Added for ListSegmentManager
const { showNotification } = require("../../utils/notification");
const { APIURL, DEFAULT_SETTINGS, WEBURL } = require("../../utils/constant");
const loadEngagementSummary = require("../options/analytics").default;

// --- Check if initialization has already happened ---
// Use a property on the window object to ensure it persists across potential double executions
if (!window.historyManagerInitialized) {
  console.log("History script initializing for the first time...");

  // --- Mark as initialized ---
  window.historyManagerInitialized = true;

  // Encapsulate tab logic
  function setupTabNavigation() {
    const tabButtons = document.querySelectorAll(".tab-button");
    const defaultTabId =
      (tabButtons.length > 0 && tabButtons[0].getAttribute("data-tab")) ||
      "analytics";

    // Function to show a tab and run its specific logic
    async function showTab(tabId) {
      console.log(`Showing tab: ${tabId}`);
      // Update active tab button styling
      document.querySelectorAll(".tab-button").forEach((btn) => {
        btn.classList.remove("active");
      });
      const activeButton = document.querySelector(
        `.tab-button[data-tab="${tabId}"]`
      );
      if (activeButton) {
        activeButton.classList.add("active");
      } else {
        console.warn(`Tab button for tabId "${tabId}" not found.`);
      }

      // Show corresponding content panel
      document.querySelectorAll(".tab-content").forEach((content) => {
        content.classList.remove("active");
      });
      const activeContent = document.getElementById(tabId);
      if (activeContent) {
        activeContent.classList.add("active");
      } else {
        console.warn(`Tab content for tabId "${tabId}" not found.`);
      }

      // Tab-specific initialization logic
      if (tabId === "analytics") {
        if (typeof loadEngagementSummary === "function") {
          await loadEngagementSummary(); // load charts and numbers
        } else {
          console.error(
            "loadEngagementSummary is not available or not a function."
          );
          showNotification("Error loading analytics.", "error");
        }
      } else if (tabId === "listSegments") {
        if (window.listSegmentManagerInstance) {
          window.listSegmentManagerInstance.initializeIfNeeded();
        } else {
          showNotification("Error loading list.", "error");
        }
      } else if (tabId === "engagementActivity") {
        if (window.engagementActivityManagerInstance) {
          window.engagementActivityManagerInstance.initializeIfNeeded();
        } else {
          showNotification("Error loading engagement activity.", "error");
        }
      }
    }

    // Function to handle hash changes and initial load
    async function handleHash() {
      let currentHash = window.location.hash.substring(1); // Remove #
      const localTabButtons = document.querySelectorAll(".tab-button"); // Re-query in case they are dynamic, though unlikely here

      const isValidHash = Array.from(localTabButtons).some(
        (btn) => btn.getAttribute("data-tab") === currentHash
      );

      if (!currentHash || !isValidHash) {
        currentHash = defaultTabId;
        // Update hash only if it's not already the default, to avoid loop if default is already set
        if (defaultTabId && window.location.hash !== `#${defaultTabId}`) {
          window.location.hash = `#${defaultTabId}`;
          // hashchange event will trigger this function again with the correct hash, so we return.
          return;
        }
      }

      // If after potential defaulting, hash is valid and exists
      if (currentHash && (isValidHash || currentHash === defaultTabId)) {
        await showTab(currentHash);
      } else if (localTabButtons.length > 0) {
        // Fallback if hash logic somehow fails to set a valid one, show the determined default
        await showTab(defaultTabId);
      }
    }

    // Setup tab button click listeners to update the hash
    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const tabId = button.getAttribute("data-tab");
        if (window.location.hash !== `#${tabId}`) {
          window.location.hash = `#${tabId}`;
        }
      });
    });

    // Listen for hash changes
    window.addEventListener("hashchange", handleHash);

    // Initial call to handle hash on page load (after DOM is ready for querySelectors)
    handleHash();
  }

  // Call the tab navigation setup. This replaces the original direct tab button event listeners.
  document.addEventListener("DOMContentLoaded", () => {
    setupTabNavigation();
  });

  // History Management Class (Define the class)
  class HistoryManager {
    constructor() {
      console.log("HistoryManager constructor called"); // This should now log only once
      this.initEventListeners();
      this.loadHistory();
    }

    initEventListeners() {
      // Ensure elements exist before adding listeners (optional but safer)
      const refreshBtn = document.getElementById("refresh-history");
      const exportBtn = document.getElementById("export-history");
      const clearBtn = document.getElementById("clear-history");
      const filterTypeSelect = document.getElementById("filter-type");
      const filterPeriodSelect = document.getElementById("filter-period");

      if (refreshBtn)
        refreshBtn.addEventListener("click", () => this.loadHistory());
      if (exportBtn)
        exportBtn.addEventListener("click", () => this.exportHistoryAsExcel());
      if (clearBtn)
        clearBtn.addEventListener("click", () => this.clearHistory());
      if (filterTypeSelect)
        filterTypeSelect.addEventListener("change", () => this.loadHistory());
      if (filterPeriodSelect)
        filterPeriodSelect.addEventListener("change", () => this.loadHistory());
    }

    async loadHistory() {
      // ... (rest of loadHistory - no changes needed here) ...
      try {
        const { engagementHistory = [] } = await chrome.storage.local.get(
          "engagementHistory"
        );
        const filterType = document.getElementById("filter-type").value;
        const filterDays = parseInt(
          document.getElementById("filter-period").value
        );
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filterDays);
        cutoffDate.setHours(0, 0, 0, 0);

        // Filter history
        let filteredHistory = engagementHistory.filter((post) => {
          const postDate = new Date(post.lastEngaged).setHours(0, 0, 0, 0);
          // Filter by date
          if (new Date(postDate) < new Date(cutoffDate)) return false;

          // Filter by action type if needed
          if (filterType !== "all") {
            const actions = post.actions.some((action) => {
              return action.type === filterType;
            });
            return actions;
          }

          return true;
        });

        this.displayHistory(filteredHistory);
      } catch (error) {
        console.error("Error loading history:", error);
      }
    }

    displayHistory(history) {
      // ... (rest of displayHistory - no changes needed here) ...
      const historyList = document.getElementById("history-list");
      const emptyMessage = document.getElementById("empty-history-message");

      if (!historyList) return; // Guard clause if element not found

      if (history.length === 0 && emptyMessage) {
        historyList.innerHTML = "";
        emptyMessage.style.display = "block";
        document.getElementById("total-actions").textContent = "0 actions";
        document.getElementById("total-posts").textContent = "0 posts";
        return;
      }

      if (emptyMessage && history.length > 0) {
        emptyMessage.style.display = "none";
      }

      // Calculate stats
      const totalPosts = history.length;
      const totalActions = history.reduce(
        (sum, post) => sum + post.actions.length,
        0
      );

      const totalActionsEl = document.getElementById("total-actions");
      const totalPostsEl = document.getElementById("total-posts");
      if (totalActionsEl)
        totalActionsEl.textContent = `${totalActions} action${
          totalActions !== 1 ? "s" : ""
        }`;
      if (totalPostsEl)
        totalPostsEl.textContent = `${totalPosts} post${
          totalPosts !== 1 ? "s" : ""
        }`;

      // Generate HTML
      historyList.innerHTML = history
        .map(
          (post) => `
          <div class="history-item bg-white p-4 rounded-lg border border-gray-200">
            <div class="flex justify-between items-start mb-2">
              <div>
                ${
                  !!post.posterProfile
                    ? `<a href=${
                        post.posterProfile
                      } target="_blank" rel="noopener noreferrer" class="underline hover:no-underline text-inherit hover:text-inherit" >
                <h3 class="font-medium text-gray-900">${
                  post.posterName || "Unknown User"
                }</h3>
                </a>`
                    : `<h3 class="font-medium text-gray-900">${
                        post.posterName || "Unknown User"
                      }</h3>`
                }

                <p class="text-xs text-gray-500">${formatDateTime(
                  post.lastEngaged
                ).toLocaleString()}</p>
              </div>
              ${
                post.commentURL
                  ? `<a href="${post.commentURL}" target="_blank" class="text-sm text-black-600 hover:text-black-800">
                View Comment
              </a>`
                  : ""
              }
              <a href="${
                post.postUrl
              }" target="_blank" class="text-sm text-black-600 hover:text-black-800">
                View Post
              </a>
            </div>

            <p class="text-sm text-gray-700 mb-3">${
              post.postSnippet || "No content available"
            }</p>


            <div class="space-y-2">
  ${post.actions
    .map(
      (action) => `
      <div class="flex items-center space-x-3 text-sm">
        <span class="flex items-center space-x-1 action-badge action-${
          action.type
        }">
          ${
            action.type === "like"
              ? `<span>👍</span><span>${action.value}</span>`
              : `<span>💬</span><span>Comment</span>`
          }
        </span>

        ${
          action.type === "comment"
            ? `<p class="text-gray-600 text-sm">${action.value}</p>`
            : ""
        }

        <span class="text-xs text-gray-400 whitespace-nowrap">
          ${new Date(action.timestamp).toLocaleTimeString()}
        </span>
      </div>
    `
    )
    .join("")}
</div>

            
          </div>
        `
        )
        .join("");
    }

    async exportHistory() {
      // ... (rest of exportHistory - no changes needed here) ...
      try {
        const { engagementHistory = [] } = await chrome.storage.local.get(
          "engagementHistory"
        );
        const blob = new Blob([JSON.stringify(engagementHistory, null, 2)], {
          type: "application/json",
        });
        const url = URL.createObjectURL(blob);

        chrome.downloads.download({
          url: url,
          filename: `linkedin-engagement-${
            new Date().toISOString().split("T")[0]
          }.json`,
        });
      } catch (error) {
        console.error("Error exporting history:", error);
      }
    }

    async exportHistoryAsExcel() {
      // ... (rest of exportHistoryAsExcel - no changes needed here) ...
      try {
        const { engagementHistory = [] } = await chrome.storage.local.get(
          "engagementHistory"
        );

        console.log("Export history called!!"); // This should now log only once per click
        if (!engagementHistory.length) {
          showNotification("No engagement history to export.", "warning");
          return;
        }

        // Prepare data for Excel
        const exportData = engagementHistory.map((post) => {
          const liked = post.actions.some((action) => action.type === "like");
          const commentAction = post.actions.find(
            (action) => action.type === "comment"
          );

          return {
            User: post.posterName || "Unknown",
            Profile: post.posterProfile || "",
            "Post Snippet": post.postSnippet || "",
            "Post URL": post.postUrl || "",
            Liked: liked ? true : false,
            Comment: commentAction ? commentAction.value : "",
            Date: post.lastEngaged || "",
          };
        });

        const startDate = new Date(engagementHistory[0]?.lastEngaged);
        const endDate = new Date(
          engagementHistory[engagementHistory.length - 1]?.lastEngaged
        );

        const filename = `linkedin_engagement_${formatDateForExcel(
          startDate
        )}_TO_${formatDateForExcel(endDate)}.xlsx`;

        // Create a worksheet
        const worksheet = XLSX.utils.json_to_sheet(exportData);

        // Create a workbook and add the worksheet
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "EngagementHistory");

        // Generate and download Excel file
        const excelBuffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([excelBuffer], {
          type: "application/octet-stream",
        });
        const url = URL.createObjectURL(blob);

        chrome.downloads.download({
          url: url,
          filename: filename,
        });

        showNotification("History exported successfully!", "success");
      } catch (error) {
        console.error("Error exporting history as Excel:", error);
      }
    }

    async clearHistory() {
      // ... (rest of clearHistory - no changes needed here) ...
      if (
        confirm(
          "Are you sure you want to clear all engagement history? This cannot be undone."
        )
      ) {
        await chrome.storage.local.set({ engagementHistory: [] });
        this.loadHistory();
      }
    }
  }

  // --- List Segment Management Class ---
  class ListSegmentManager {
    constructor() {
      console.log("ListSegmentManager constructor called");
      this.token = null;
      this.boards = [];
      this.currentBusinessId = null;
      // Pagination state
      this.currentCustomerPage = 1;
      this.totalCustomerPages = 1;
      this.totalCustomerRecords = 0;

      this.boardSelectElement = document.getElementById("listTabBoardSelect");
      this.listsContainerElement = document.getElementById(
        "segment-lists-container"
      );
      this.listControlsContainer = document.getElementById(
        "list-controls-container"
      ); // Container for select and create button

      // Elements for creating a new list
      this.createNewListButton = document.getElementById("create-new-list-btn");
      this.createListFormContainer = document.getElementById(
        "create-list-form-container"
      );
      this.newListNameInput = document.getElementById("new-list-name");
      this.newListPromptTextarea = document.getElementById("new-list-prompt");
      this.saveNewListButton = document.getElementById("save-new-list-btn");
      this.cancelNewListButton = document.getElementById("cancel-new-list-btn");

      // Elements for Customer List View
      this.customerListViewElement =
        document.getElementById("customer-list-view");
      this.backToSegmentListsButton = document.getElementById(
        "back-to-segment-lists-btn"
      );
      this.customerListDynamicNameElement = document.getElementById(
        "customer-list-dynamic-name"
      );
      this.customerSearchInputElement = document.getElementById(
        "customer-search-input"
      );
      this.customerListLoadingElement = document.getElementById(
        "customer-list-loading"
      );
      this.customerTableContainerElement = document.getElementById(
        "customer-table-container"
      );
      this.customerListTableElement = this.customerTableContainerElement
        ? this.customerTableContainerElement.querySelector("table")
        : null;
      this.customerListTableBodyElement = document.getElementById(
        "customer-list-table-body"
      );
      this.customerListEmptyMessageElement = document.getElementById(
        "customer-list-empty-message"
      );
      // Pagination controls
      this.customerPaginationElement = document.getElementById(
        "customer-pagination"
      );
      this.customerPrevPageBtn = document.getElementById("customer-prev-page");
      this.customerNextPageBtn = document.getElementById("customer-next-page");
      this.customerPageInfo = document.getElementById("customer-page-info");

      this.currentOpenListId = null;
      this.currentOpenListName = null;
      this.currentEngagementState = { listId: null, isEngaging: false };

      if (
        !this.boardSelectElement ||
        !this.listsContainerElement ||
        !this.listControlsContainer ||
        !this.createNewListButton ||
        !this.createListFormContainer ||
        !this.newListNameInput ||
        !this.newListPromptTextarea ||
        !this.saveNewListButton ||
        !this.cancelNewListButton ||
        !this.customerListViewElement ||
        !this.backToSegmentListsButton ||
        !this.customerListDynamicNameElement ||
        !this.customerSearchInputElement ||
        !this.customerListLoadingElement ||
        !this.customerTableContainerElement ||
        !this.customerListTableElement ||
        !this.customerListTableBodyElement ||
        !this.customerListEmptyMessageElement ||
        !this.customerPaginationElement ||
        !this.customerPrevPageBtn ||
        !this.customerNextPageBtn ||
        !this.customerPageInfo
      ) {
        console.error(
          "ListSegmentManager: One or more required DOM elements not found."
        );
        return;
      }

      // Bind methods for event listeners
      this.boundShowCreateListForm = this.showCreateListForm.bind(this);
      this.boundHideCreateListForm = this.hideCreateListForm.bind(this);
      this.boundHandleSaveNewList = this.handleSaveNewList.bind(this);
      this.debouncedCustomerSearch = this.debounce(
        this.handleCustomerSearchInternal,
        500
      );

      this.createNewListButton.addEventListener(
        "click",
        this.boundShowCreateListForm
      );
      this.cancelNewListButton.addEventListener("click", () =>
        this.hideCreateListForm(false)
      ); // Explicitly pass false
      this.saveNewListButton.addEventListener(
        "click",
        this.boundHandleSaveNewList
      );
      this.backToSegmentListsButton.addEventListener("click", () =>
        this.hideCustomerListView()
      );
      this.customerSearchInputElement.addEventListener("input", () =>
        this.debouncedCustomerSearch()
      );
      // Pagination event listeners
      if (this.customerPrevPageBtn) {
        this.customerPrevPageBtn.addEventListener("click", () => {
          if (this.currentCustomerPage > 1) {
            this.currentCustomerPage--;
            this.fetchAndDisplayCustomers(
              this.currentOpenListId,
              this.currentOpenListName,
              this.customerSearchInputElement.value.trim(),
              this.currentCustomerPage
            );
          }
        });
      }
      if (this.customerNextPageBtn) {
        this.customerNextPageBtn.addEventListener("click", () => {
          if (this.currentCustomerPage < this.totalCustomerPages) {
            this.currentCustomerPage++;
            this.fetchAndDisplayCustomers(
              this.currentOpenListId,
              this.currentOpenListName,
              this.customerSearchInputElement.value.trim(),
              this.currentCustomerPage
            );
          }
        });
      }
      // Listen for changes in engagement status from background script
      chrome.storage.onChanged.addListener((changes, namespace) => {
        if (
          namespace === "local" &&
          (changes.engagement_status || changes.engagement_segment_id)
        ) {
          console.log("Engagement status changed in storage, updating UI.");
          this.updateEngagementStateFromStorage().then(() => {
            if (
              this.currentBusinessId &&
              !this.customerListViewElement.classList.contains("hidden")
            ) {
              // If customer list view is active, it means we are not on segment list view, so no need to reload segment lists.
            } else if (this.currentBusinessId) {
              this.loadSegmentListsForBoard(this.currentBusinessId);
            }
          });
        }
      });
    }

    async initializeIfNeeded() {
      if (!this.token) {
        this.token = await getAuthToken();
      }
      if (!this.token) {
        // Hide workspace select and create list button
        if (this.boardSelectElement)
          this.boardSelectElement.style.display = "none";
        if (this.createNewListButton)
          this.createNewListButton.style.display = "none";
        if (this.listControlsContainer)
          this.listControlsContainer.style.display = "none";
        renderLoginRequiredUI(
          this.listsContainerElement,
          "Login Required",
          "To access and manage your segment lists, you need to login to your ManagePlus account. Please login to continue.",
          "Login to ManagePlus"
        );
        return;
      } else {
        // Show controls if token is present
        if (this.boardSelectElement) this.boardSelectElement.style.display = "";
        if (this.createNewListButton)
          this.createNewListButton.style.display = "";
        if (this.listControlsContainer)
          this.listControlsContainer.style.display = "";
      }

      if (this.boards.length === 0) {
        await this.fetchAndPopulateBoards();
      }

      // Add event listener only once
      if (!this.boardSelectElement.dataset.listenerAttached) {
        this.boardSelectElement.addEventListener("change", async (event) => {
          this.currentBusinessId = event.target.value;
          if (this.currentBusinessId) {
            await this.loadSegmentListsForBoard(this.currentBusinessId);
          } else {
            this.listsContainerElement.innerHTML = `<p class="text-gray-500">Select a workspace to view lists.</p>`;
          }
        });
        this.boardSelectElement.dataset.listenerAttached = "true";
      }
    }

    async updateEngagementStateFromStorage() {
      const { engagement_status, engagement_segment_id } =
        await chrome.storage.local.get([
          "engagement_status",
          "engagement_segment_id",
        ]);
      this.currentEngagementState.isEngaging = engagement_status === "started";
      this.currentEngagementState.listId = engagement_segment_id || null;
      console.log(
        "ListSegmentManager: Updated engagement state from storage:",
        this.currentEngagementState
      );
    }

    async fetchAndPopulateBoards() {
      try {
        const response = await fetch(`${APIURL}/user/me`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!response.ok) throw new Error("Failed to fetch workspace's");
        const data = await response.json();
        this.boards = data.data.businesses || []; // Assuming structure from popup.js
        populateBoards(this.boardSelectElement, data); // populateBoards should handle the exact data structure

        if (this.boardSelectElement.options.length > 1) {
          // 0 is often "Select board"
          this.boardSelectElement.value =
            this.boardSelectElement.options[0].value; // Select first actual board
          await this.updateEngagementStateFromStorage(); // Ensure state is fresh before loading lists
          this.currentBusinessId = this.boardSelectElement.value;
          await this.loadSegmentListsForBoard(this.currentBusinessId);
        } else if (this.boards.length === 0) {
          this.boardSelectElement.innerHTML = `<option value="">No workspace found</option>`;
          this.listsContainerElement.innerHTML = `<p class="text-gray-500">No workspace's available.</p>`;
        }
      } catch (error) {
        console.error("Failed to load workspace's for List tab:", error);
        this.boardSelectElement.innerHTML = `<option value="">Error loading workspace's</option>`;
        showNotification("Error loading workspace.", "error");
      }
    }

    async loadSegmentListsForBoard(businessId) {
      if (!this.token || !businessId) return;
      this.listsContainerElement.innerHTML = `<p class="text-gray-500">Loading lists...</p>`;
      try {
        const response = await fetch(
          `${APIURL}/segmentation/list?type=1&show_intent=false&page_num=1&rows_per_page=100`,
          {
            headers: {
              Authorization: `Bearer ${this.token}`,
              "b-id": businessId,
            },
          }
        );
        if (!response.ok) throw new Error(`HTTP error ${response.status}`);
        const data = await response.json();
        this.displaySegmentLists(data.data?.rows || []);
      } catch (error) {
        console.error("Error loading segment lists:", error);
        this.listsContainerElement.innerHTML = `<p class="text-red-500">Error loading lists. Please try again.</p>`;
        showNotification("Error loading segment lists.", "error");
      }
    }

    displaySegmentLists(lists) {
      this.listsContainerElement.innerHTML = ""; // Clear previous lists or loading message
      if (lists.length === 0) {
        this.listsContainerElement.innerHTML = `<p class="text-gray-500 text-center py-4">No segment lists found for this workspace.</p>`;
        return;
      }

      lists.forEach((list) => {
        const itemDiv = document.createElement("div");
        itemDiv.className =
          "segment-list-item bg-gray-50 p-1.5 rounded-lg border border-gray-200 mb-2";
        itemDiv.innerHTML = `
        <div class="flex justify-between items-center gap-4">
          <div class="flex-grow min-w-0"> <!-- Added min-w-0 for better truncation if needed -->
 <button 
  class="segment-list-name-btn text-sm font-medium text-black capitalize text-left focus:outline-none hover:underline
         truncate overflow-hidden whitespace-nowrap text-ellipsis max-w-full"
  data-list-id="${list._id}" 
  data-list-name="${String(list.name || "").replace(/"/g, "&quot;")}" 
  title="${list.name || ""}">
  ${list.name || "Unnamed List"}
</button>

          </div>
          <div class="flex-shrink-0 text-sm text-gray-600" style="margin-top: -6px;">
            <span class="font-medium">${list.total_count || 0}</span> Prospects
          </div>
          <div class="flex-shrink-0 space-x-2">
            <!-- Edit Prompt Button -->
            <button 
class="edit-prompt-btn text-sm bg-transparent text-gray-800 border border-[#dfdfdf] shadow-md hover:bg-gray-50 py-1 px-3 rounded-lg"
              data-list-id="${list._id}"  data-list-prompt="${
          list?.engagement_prompt || ""
        }"
                        data-list-name="${String(list.name || "").replace(
                          /"/g,
                          "&quot;"
                        )}"
              ${
                this.currentEngagementState.isEngaging
                  ? 'disabled title="Engagement in progress"'
                  : ""
              }
              style="${
                this.currentEngagementState.isEngaging
                  ? "opacity: 0.5; cursor: not-allowed;"
                  : ""
              }"
            >

              Edit Prompt
            </button>

            <!-- Start Engagement Button -->
     
                  ${(() => {
                    const isCurrentEngagingList =
                      this.currentEngagementState.isEngaging &&
                      this.currentEngagementState.listId === list._id;
                    const canStartEngagement =
                      !this.currentEngagementState.isEngaging ||
                      isCurrentEngagingList;
                    let btnHtml = `<button 
                class="start-engagement-btn min-w-fit text-white font-semibold py-2 px-4 rounded-lg transition duration-300" 
                data-list-id="${list._id}" data-list-prompt="${
                      list?.engagement_prompt || ""
                    }"
                ${
                  !canStartEngagement
                    ? 'disabled title="Another engagement is in progress"'
                    : ""
                }
                style="${
                  !canStartEngagement
                    ? "opacity: 0.5; cursor: not-allowed;"
                    : ""
                }">`;
                    if (isCurrentEngagingList) {
                      btnHtml += `Stop Engagement</button>`;
                    } else {
                      btnHtml += `Start Engagement</button>`;
                    }
                    return btnHtml;
                  })()}
          </div>
        </div>
          <div id="prompt-editor-container-${
            list._id
          }" class="prompt-editor-container mt-3 hidden"></div>
        `;
        this.listsContainerElement.appendChild(itemDiv);
      });

      this.listsContainerElement
        .querySelectorAll(".edit-prompt-btn")
        .forEach((btn) => {
          btn.addEventListener("click", (e) => this.handleEditPromptClick(e));
        });
      this.listsContainerElement
        .querySelectorAll(".segment-list-name-btn")
        .forEach((btn) => {
          // Attach listener for clicking list name to show customers
          btn.addEventListener("click", (e) =>
            this.handleSegmentListNameClick(e)
          );
        });

      this.listsContainerElement
        .querySelectorAll(".start-engagement-btn")
        .forEach((btn) => {
          const listId = btn.dataset.listId;

          const listPrompt = btn.dataset.listPrompt;
          if (btn.textContent.includes("Start Engagement")) {
            btn.classList.add(
              "bg-[#101112]",
              "text-white",
              "px-4",
              "py-2",
              "rounded-lg",
              "focus:outline-none",
              "focus:ring-2",
              "focus:ring-blue-500",
              "focus:ring-opacity-50"
            );
            btn.style.backgroundColor = "#101112"; // Set background color
            btn.addEventListener("click", () =>
              this.handleStartEngagementClick(listId, listPrompt)
            );
          } else if (btn.textContent.includes("Stop Engagement")) {
            btn.classList.add("bg-red-500", "hover:bg-red-600");
            btn.addEventListener("click", () =>
              this.handleStopEngagementClick(listId)
            );
          }
          // Apply base styles if button is disabled by another engagement
         
        });
    }

    handleSegmentListNameClick(event) {
      const listId = event.target.dataset.listId;
      const listName = event.target.dataset.listName; // Browser decodes entities
      if (listId && listName) {
        this.showCustomerListView(listId, listName);
      } else {
        console.error(
          "List ID or Name not found on clicked element.",
          event.target
        );
        showNotification("Error: Could not open customer list.", "error");
      }
    }

    async handleEditPromptClick(event) {
      const listId = event.target.dataset.listId;
      const prompt = event.target.dataset.listPrompt;
      const listName = event.target.dataset.listName; // Browser decodes entities from dataset
      const targetEditorContainer = document.getElementById(
        `prompt-editor-container-${listId}`
      );

      if (!targetEditorContainer) {
        console.error(`Editor container for listId ${listId} not found.`);
        showNotification(
          "Error: Could not find editor for this list.",
          "error"
        );
        return;
      }

      // Determine if the specific editor we are targeting is currently open and populated
      const isTargetEditorCurrentlyOpen =
        !targetEditorContainer.classList.contains("hidden") &&
        targetEditorContainer.innerHTML.trim() !== "";

      // First, hide and clear ALL prompt editors
      document
        .querySelectorAll(".prompt-editor-container")
        .forEach((editor) => {
          editor.innerHTML = ""; // Clear content
          editor.classList.add("hidden"); // Hide
        });

      // If the target editor was NOT already open (or if a different one was open), then populate and open it.
      // If it WAS open, it's now closed by the loop above, so we do nothing further to open it.
      if (!isTargetEditorCurrentlyOpen) {
        // Construct the editor's inner HTML
        // Using a placeholder for the list name initially for safer text insertion.
        targetEditorContainer.innerHTML = `
          <div class="prompt-editor bg-gray-100 p-3 rounded border border-gray-300">
            <h5 class="text-md font-semibold mb-2">Edit Prompt for: <span class="font-normal" id="editor-list-name-placeholder-${listId}"></span></h5>
            <textarea class="w-full p-2 border border-gray-300 rounded mb-2" rows="5" placeholder="Enter your engagement prompt...">${prompt}</textarea>
            <div class="flex justify-end space-x-2">
              <button class="cancel-prompt-btn bg-gray-300 hover:bg-gray-400 text-gray-800 py-1 px-3 rounded">Cancel</button>
              <button class="save-prompt-btn bg-green-500 hover:bg-green-600 text-white py-1 px-3 rounded">Save Prompt</button>
            </div>
          </div>`;

        // Safely set the list name using textContent
        const listNameSpan = targetEditorContainer.querySelector(
          `#editor-list-name-placeholder-${listId}`
        );
        if (listNameSpan) {
          listNameSpan.textContent = listName;
        }

        targetEditorContainer.classList.remove("hidden");

        // Add event listener for the "Save Prompt" button
        targetEditorContainer
          .querySelector(".save-prompt-btn")
          .addEventListener("click", async () => {
            const newPrompt =
              targetEditorContainer.querySelector("textarea").value;

            // Call API to save prompt
            const success = await this.savePromptToApi(
              listId,
              listName,
              newPrompt
            );

            if (success) {
              // Also save to local storage
              // await chrome.storage.local.set({
              //   [`engagement_prompt_${listId}`]: newPrompt,
              // });
              showNotification(`Prompt saved successfully!`, "success");
              targetEditorContainer.innerHTML = ""; // Clear and hide editor
              targetEditorContainer.classList.add("hidden");
            }
            // If !success, error notification is handled by savePromptToApi, and editor remains open.
          });

        targetEditorContainer
          .querySelector(".cancel-prompt-btn")
          .addEventListener("click", () => {
            targetEditorContainer.innerHTML = "";
            targetEditorContainer.classList.add("hidden");
          });
      }
    }

    async savePromptToApi(listId, listName, prompt) {
      if (!this.token) {
        showNotification(
          "Authentication token not found. Cannot save prompt.",
          "error"
        );
        return false;
      }
      if (!this.currentBusinessId) {
        showNotification(
          "Workspace (business ID) not selected. Cannot save prompt.",
          "error"
        );
        return false;
      }

      const apiUrl = `${APIURL}/segmentation?segment_id[0]=${encodeURIComponent(
        listId
      )}`;
      const payload = {
        name: listName,
        type: 1,
        engagement_prompt: prompt,
      };

      try {
        const response = await fetch(apiUrl, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
            "b-id": this.currentBusinessId,
          },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          let errorData = { message: `HTTP error ${response.status}` };
          try {
            errorData = await response.json();
          } catch (e) {
            errorData.message = response.statusText || errorData.message;
          }
          console.error(
            `API Error saving prompt (${response.status}):`,
            errorData
          );
          showNotification(
            `Error saving prompt: ${errorData.message || "Failed to save."}`,
            "error"
          );
          return false;
        }
        this.loadSegmentListsForBoard(this.currentBusinessId);
        return true;
      } catch (error) {
        console.error("Error calling save prompt API:", error);
        showNotification(
          "Failed to save prompt due to a network or unexpected error.",
          "error"
        );
        return false;
      }
    }

    async handleStartEngagementClick(listId, prompt) {
      console.log(`Attempting to start engagement for list ID: ${listId}`);

      if (!this.token || !this.currentBusinessId) {
        showNotification(
          "Authentication or workspace details missing. Cannot start engagement.",
          "error"
        );
        return;
      }

      if (!prompt) {
        showNotification(
          "No prompt found for this list edit your prompt first.",
          "error"
        );
        return;
      }
      // Disable all buttons in the list
      const allButtons = this.listsContainerElement.querySelectorAll("button");
      allButtons.forEach((btn) => (btn.disabled = true));
      // Find the correct Start Engagement button (by listId)
      const button = Array.from(
        this.listsContainerElement.querySelectorAll(".start-engagement-btn")
      ).find((btn) => btn.dataset.listId === listId);
      let originalContent = null;
      if (button) {
        originalContent = button.innerHTML;
        button.innerHTML = `<span class="spinner-border spinner-border-sm mr-2" style="display:inline-block;width:1em;height:1em;border:2px solid #fff;border-right-color:transparent;border-radius:50%;animation:spin 0.75s linear infinite;"></span>Starting...`;
      }

      try {
        const response = await chrome.runtime.sendMessage({
          action: "startEngagement",
          listId: listId,
          token: this.token,
          businessId: this.currentBusinessId,
          prompt: prompt,
        });

        if (response && response.success) {
          showNotification(
            response.message ||
              `Engagement process started for list ${listId}.`,
            "info"
          );
          // UI will update via storage listener
        } else {
          showNotification(
            `Failed to start engagement: ${
              response ? response.message : "Unknown error from background."
            }`,
            "error"
          );
          // Re-enable all buttons
          allButtons.forEach((btn) => (btn.disabled = false));
          if (button) {
            button.innerHTML = originalContent || "Start Engagement";
          }
        }
      } catch (error) {
        console.error(
          "Error sending startEngagement message to background:",
          error
        );
        showNotification(
          "Error communicating with background service to start engagement.",
          "error"
        );
        // Re-enable all buttons
        allButtons.forEach((btn) => (btn.disabled = false));
        if (button) {
          button.innerHTML = originalContent || "Start Engagement";
        }
      }
    }

    async handleStopEngagementClick(listId) {
      console.log(`Attempting to stop engagement for list ID: ${listId}`);
      const button = this.listsContainerElement.querySelector(
        `.engagement-action-btn[data-list-id="${listId}"]`
      );
      if (button) {
        button.disabled = true;
        button.textContent = "Stopping...";
      }

      try {
        // No need to send token/businessId for stop, background manages its own state.
        const response = await chrome.runtime.sendMessage({
          action: "stopEngagement",
          listId: listId,
        });
        if (response && response.success) {
          showNotification(response.message || "Engagement stopped.", "info");
        } else {
          showNotification(
            `Failed to stop engagement: ${
              response ? response.message : "Unknown error"
            }`,
            "error"
          );
        }
      } catch (error) {
        console.error("Error sending stopEngagement message:", error);
        showNotification(
          "Error communicating with background to stop engagement.",
          "error"
        );
      }
      // UI will update via storage listener, which re-enables buttons correctly.
    }

    showCreateListForm() {
      this.listControlsContainer.classList.add("hidden");
      this.listsContainerElement.classList.add("hidden");
      this.customerListViewElement.classList.add("hidden"); // Ensure customer view is also hidden

      this.createListFormContainer.classList.remove("hidden");
      this.newListNameInput.value = "";
      this.newListPromptTextarea.value = "";
      this.newListNameInput.focus();
    }

    // Debounce utility
    debounce(func, delay) {
      let timeout;
      return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), delay);
      };
    }

    hideCreateListForm(shouldReloadLists = false) {
      if (this.createListFormContainer)
        this.createListFormContainer.classList.add("hidden");
      if (this.listControlsContainer)
        this.listControlsContainer.classList.remove("hidden");
      if (this.listsContainerElement)
        this.listsContainerElement.classList.remove("hidden");

      if (shouldReloadLists && this.currentBusinessId) {
        this.loadSegmentListsForBoard(this.currentBusinessId);
      }
    }

    async handleSaveNewList() {
      const name = this.newListNameInput
        ? this.newListNameInput.value.trim()
        : "";
      const promptText = this.newListPromptTextarea
        ? this.newListPromptTextarea.value.trim()
        : "";

      if (!name) {
        showNotification("List Name is required.", "error");
        if (this.newListNameInput) this.newListNameInput.focus();
        return;
      }
      // if (!promptText) {
      //   showNotification("Engagement Prompt is required.", "error");
      //   if (this.newListPromptTextarea) this.newListPromptTextarea.focus();
      //   return;
      // }

      if (this.saveNewListButton) {
        this.saveNewListButton.disabled = true;
        this.saveNewListButton.textContent = "Saving...";
      }

      const success = await this.createNewListApi(name, promptText);

      if (this.saveNewListButton) {
        this.saveNewListButton.disabled = false;
        this.saveNewListButton.textContent = "Save List";
      }

      if (success) {
        showNotification("Segment list created successfully!", "success");
        this.hideCreateListForm(true); // Hide form and reload lists
      }
      // Error notification is handled by createNewListApi
    }

    async createNewListApi(name, promptText) {
      if (!this.token) {
        showNotification(
          "Authentication token not found. Cannot create list.",
          "error"
        );
        return false;
      }
      if (!this.currentBusinessId) {
        showNotification(
          "Workspace (business ID) not selected. Cannot create list.",
          "error"
        );
        return false;
      }

      const apiUrl = `${APIURL}/segmentation`;
      const payload = {
        name: name,
        type: 1,
        archive_date: new Date().toISOString(),
        engagement_prompt: promptText
          ? promptText
          : DEFAULT_SETTINGS.userPrompt
              ?.split("\n")
              .map((line) => line.trimStart())
              .join("\n"),
      };

      try {
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.token}`,
            "b-id": this.currentBusinessId,
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
                responseBody.errors[Object.keys(responseBody.errors)[0]][0]) ||
              errorData.message;
          } catch (e) {
            errorData.message = response.statusText || errorData.message;
          }
          console.error(
            `API Error creating list (${response.status}):`,
            errorData,
            await response.text().catch(() => "")
          );
          showNotification(
            `Error creating list: ${errorData.message}`,
            "error"
          );
          return false;
        }
        return true;
      } catch (error) {
        console.error("Error calling create list API:", error);
        showNotification(
          "Failed to create list due to a network or unexpected error.",
          "error"
        );
        return false;
      }
    }

    // --- Customer List View Methods ---

    showCustomerListView(listId, listName) {
      this.currentOpenListId = listId;
      this.currentOpenListName = listName;
      // Reset pagination
      this.currentCustomerPage = 1;
      this.totalCustomerPages = 1;
      this.totalCustomerRecords = 0;

      // Hide other views
      this.listControlsContainer.classList.add("hidden");
      this.listsContainerElement.classList.add("hidden");
      document.getElementById("list-header").classList.add("hidden");
      if (!this.createListFormContainer.classList.contains("hidden")) {
        this.createListFormContainer.classList.add("hidden");
      }

      // Show customer list view
      this.customerListViewElement.classList.remove("hidden");
      this.customerListDynamicNameElement.textContent = listName;
      this.customerSearchInputElement.value = ""; // Clear search

      // Reset table/empty message state
      this.customerListTableBodyElement.innerHTML = "";
      this.customerListTableElement.classList.add("hidden");
      this.customerListEmptyMessageElement.classList.add("hidden");

      this.fetchAndDisplayCustomers(listId, listName, "", 1);
    }

    hideCustomerListView() {
      this.customerListViewElement.classList.add("hidden");
      this.customerListTableBodyElement.innerHTML = ""; // Clear table
      this.customerSearchInputElement.value = "";
      this.customerListEmptyMessageElement.classList.add("hidden");
      this.customerListTableElement.classList.add("hidden");

      // Show segment list related views
      this.listControlsContainer.classList.remove("hidden");
      this.listsContainerElement.classList.remove("hidden");
      document.getElementById("list-header").classList.remove("hidden");
      // createListFormContainer remains hidden unless explicitly opened

      this.currentOpenListId = null;
      this.currentOpenListName = null;
    }

    handleCustomerSearchInternal() {
      if (this.currentOpenListId && this.customerSearchInputElement) {
        // Reset to page 1 on new search
        this.currentCustomerPage = 1;
        this.fetchAndDisplayCustomers(
          this.currentOpenListId,
          this.currentOpenListName,
          this.customerSearchInputElement.value.trim(),
          1
        );
      }
    }

    async fetchAndDisplayCustomers(
      listId,
      listName,
      searchQuery = "",
      pageNum = 1
    ) {
      if (!this.token || !listId || !this.currentBusinessId) {
        showNotification(
          "Cannot load customers: Missing token, list ID, or workspace ID.",
          "error"
        );
        return;
      }
      this.customerListLoadingElement.classList.remove("hidden");
      this.customerListTableBodyElement.innerHTML = ""; // Clear previous results
      this.customerListTableElement.classList.add("hidden"); // Hide table during load
      this.customerListEmptyMessageElement.classList.add("hidden");
      // Pagination params
      const rowsPerPage = 20;
      const encodedSearchQuery = encodeURIComponent(searchQuery);
      const apiUrl = `${APIURL}/segmentation/customers/${listId}?name=${encodedSearchQuery}&rows_per_page=${rowsPerPage}&page_num=${pageNum}`;
      try {
        const response = await fetch(apiUrl, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            "b-id": this.currentBusinessId,
          },
        });
        this.customerListLoadingElement.classList.add("hidden");
        if (!response.ok) {
          console.error(`HTTP error fetching customers: ${response.status}`);
          this.customerListEmptyMessageElement.textContent =
            "Error loading customers. Please try again.";
          this.customerListEmptyMessageElement.classList.remove("hidden");
          showNotification("Error loading customers.", "error");
          // Hide pagination on error
          if (this.customerPaginationElement)
            this.customerPaginationElement.classList.add("hidden");
          return;
        }
        const data = await response.json();
        const customers = data.data?.rows || [];
        this.totalCustomerRecords = data.data?.total_number_of_records || 0;
        this.totalCustomerPages = Math.max(
          1,
          Math.ceil(this.totalCustomerRecords / rowsPerPage)
        );
        this.currentCustomerPage = pageNum;
        this.renderCustomerTable(customers);
        this.updateCustomerPagination();
      } catch (error) {
        console.error("Error fetching or processing customers:", error);
        this.customerListLoadingElement.classList.add("hidden");
        this.customerListEmptyMessageElement.textContent =
          "Failed to load customers due to an error.";
        this.customerListEmptyMessageElement.classList.remove("hidden");
        showNotification("Failed to load customers.", "error");
        // Hide pagination on error
        if (this.customerPaginationElement)
          this.customerPaginationElement.classList.add("hidden");
      }
    }

    renderCustomerTable(customers) {
      this.customerListTableBodyElement.innerHTML = ""; // Clear existing rows
      if (customers.length === 0) {
        this.customerListEmptyMessageElement.textContent =
          this.customerSearchInputElement.value.trim()
            ? "No prospect found for your search."
            : "This list has no prospects yet.";
        this.customerListEmptyMessageElement.classList.remove("hidden");
        this.customerListTableElement.classList.add("hidden");
        // Hide pagination if no data
        if (this.customerPaginationElement)
          this.customerPaginationElement.classList.add("hidden");
        return;
      }
      this.customerListEmptyMessageElement.classList.add("hidden");
      this.customerListTableElement.classList.remove("hidden");
      customers.forEach((customer) => {
        const row = this.customerListTableBodyElement.insertRow();
        row.className = "hover:bg-gray-50 transition-colors";

        // 1. Name with Avatar
        const nameCell = row.insertCell();
        nameCell.className =
          "px-6 py-4 whitespace-nowrap text-sm text-gray-900";
        const nameContainer = document.createElement("div");
        nameContainer.className = "flex items-center";

        const avatarImg = document.createElement("img");
        avatarImg.className =
          "h-6 w-6 rounded-full mr-3 object-cover flex-shrink-0"; // Added flex-shrink-0
        // Use a placeholder if avatar_url is not available or broken
        avatarImg.src =
          customer?.customer_id?.avatar ||
          `https://ui-avatars.com/api/?name=${encodeURIComponent(
            customer.name || "N A"
          )}&size=32&background=random&color=fff`;
        avatarImg.alt =
          `${customer?.customer_id?.first_name} ${customer?.customer_id?.last_name}` ||
          "Avatar";
        avatarImg.onerror = () => {
          avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
            customer.name || "N A"
          )}&size=32&background=random&color=fff`;
        }; // Fallback for broken image links

        const nameSpan = document.createElement("span");
        nameSpan.className = "font-medium truncate"; // Added truncate for long names
        nameSpan.textContent =
          `${customer?.customer_id?.first_name} ${customer?.customer_id?.last_name}` ||
          "N/A";
        nameSpan.title =
          `${customer?.customer_id?.first_name} ${customer?.customer_id?.last_name}` ||
          "N/A"; // Show full name on hover
        nameSpan.style.textTransform = "capitalize";
        nameContainer.appendChild(avatarImg);
        nameContainer.appendChild(nameSpan);
        nameCell.appendChild(nameContainer);

        // 2. Email
        // const emailCell = row.insertCell();
        // emailCell.className =
        //   "px-6 py-4 whitespace-nowrap text-sm text-gray-700";
        // const emailDiv = document.createElement("span");
        // emailDiv.className = "truncate";
        // emailDiv.textContent = customer?.customer_id?.email?.value || "N/A";
        // emailDiv.title = customer?.customer_id?.email?.value || "N/A";
        // emailCell.appendChild(emailDiv);

        const engagedCell = row.insertCell();
        engagedCell.className = "px-6 py-4 whitespace-nowrap text-sm";

        const engagedDiv = document.createElement("span");
        const isEngaged = customer?.lkdn_engaged;

        engagedDiv.className = `inline-flex items-center px-2 py-1 rounded text-white text-xs font-medium ${
          isEngaged ? "bg-green-500" : "bg-red-500"
        }`;

        const icon = document.createElement("span");
        icon.className = "mr-1";
        icon.innerHTML = isEngaged
          ? `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
    </svg>
  `
          : `
    <svg xmlns="http://www.w3.org/2000/svg" class="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="white" stroke-width="2">
      <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
    </svg>
  `;

        const text = document.createElement("span");
        text.textContent = isEngaged ? "Yes" : "No";

        engagedDiv.appendChild(icon);
        engagedDiv.appendChild(text);
        engagedDiv.title = isEngaged ? "Yes" : "No";

        engagedCell.appendChild(engagedDiv);

        // 3. Job Title (with ellipsis)
        const titleCell = row.insertCell();
        titleCell.className = "px-6 py-4 text-sm text-gray-700";

        const titleDiv = document.createElement("div");
        titleDiv.style.maxWidth = "300px"; // Optional, for layout control
        titleDiv.style.overflow = "hidden";
        titleDiv.style.textOverflow = "ellipsis";
        titleDiv.style.whiteSpace = "nowrap";

        const fullTitle =
          customer?.customer_id?.current_job_title === "Null" ||
          customer?.customer_id?.current_job_title === "null"
            ? "-"
            : customer?.customer_id?.current_job_title || "-";

        // Truncate to 20 characters
        function truncateChars(text, limit = 20) {
          return text.length > limit ? text.slice(0, limit) + "..." : text;
        }

        const truncated = truncateChars(fullTitle, 20);
        titleDiv.textContent = truncated;
        titleDiv.title = fullTitle; // Show full title on hover

        titleCell.appendChild(titleDiv);

        // 4. LinkedIn Profile
        const linkedinCell = row.insertCell();
        linkedinCell.className = "px-6 py-4 whitespace-nowrap text-sm";
        if (customer?.customer_id?.mp_customer_linkedin_profile) {
          const link = document.createElement("a");
          link.href = customer?.customer_id?.mp_customer_linkedin_profile;
          link.target = "_blank";
          link.rel = "noopener noreferrer";
          link.textContent = customer?.customer_id?.mp_customer_linkedin_profile
            ? "View Profile"
            : "-";
          link.className = "text-black-600 hover:text-black-800 hover:underline";
          linkedinCell.appendChild(link);
        } else {
          linkedinCell.textContent = "-";
          linkedinCell.classList.add("text-gray-500");
        }
      });
    }

    updateCustomerPagination() {
      if (!this.customerPaginationElement) return;
      // Show pagination if more than 1 page
      if (this.totalCustomerPages > 1) {
        this.customerPaginationElement.classList.remove("hidden");
        this.customerPageInfo.textContent = `Page ${this.currentCustomerPage} of ${this.totalCustomerPages}`;
        this.customerPrevPageBtn.disabled = this.currentCustomerPage <= 1;
        this.customerNextPageBtn.disabled =
          this.currentCustomerPage >= this.totalCustomerPages;
      } else {
        this.customerPaginationElement.classList.add("hidden");
      }
    }
  }

  // --- Engagement Activity Management Class ---
  // d:\ManagePlus\mp-extensions\linkedin-engagement\src\scripts\history\index.js
  // ... (other code) ...

  // --- Engagement Activity Management Class ---
  class EngagementActivityManager {
    constructor() {
      console.log("EngagementActivityManager constructor called");
      this.token = null;
      this.currentBusinessId = null;
      this.userId = null; // To store the user's ID from /me response
      this.boards = []; // To store available boards/workspaces
      // Pagination state
      this.currentActivityPage = 1;
      this.totalActivityPages = 1;
      this.totalActivityRecords = 0;

      // DOM Elements for Engagement Activity Tab
      this.activityListElement = document.getElementById(
        "engagement-activity-list"
      );
      this.emptyMessageElement = document.getElementById(
        "empty-engagement-activity-message"
      );
      this.totalActivitiesElement = document.getElementById(
        "total-engagement-activities"
      );
      this.engagmentStatsElement = document.getElementById(
        "engagement-activity-stats"
      );
      this.refreshButton = document.getElementById(
        "refresh-engagement-activity"
      );
      this.boardLabel = document.getElementById("filter-activity-board-label");
      this.periodContainer = document.getElementById(
        "filter-activity-period-container"
      );
      this.exportButton = document.getElementById("export-engagement-activity");
      this.filterTypeSelect = document.getElementById("filter-activity-type");
      this.filterPeriodSelect = document.getElementById(
        "filter-activity-period"
      );
      this.boardSelectElement = document.getElementById(
        "filter-activity-board"
      ); // New board filter
      // Pagination controls
      this.activityPaginationElement = document.getElementById(
        "engagement-activity-pagination"
      );
      this.activityPrevPageBtn = document.getElementById(
        "engagement-activity-prev-page"
      );
      this.activityNextPageBtn = document.getElementById(
        "engagement-activity-next-page"
      );
      this.activityPageInfo = document.getElementById(
        "engagement-activity-page-info"
      );

      if (
        !this.activityListElement ||
        !this.emptyMessageElement ||
        !this.totalActivitiesElement ||
        !this.refreshButton ||
        !this.exportButton ||
        !this.filterTypeSelect ||
        !this.filterPeriodSelect ||
        !this.boardSelectElement || // Check for the new element
        !this.activityPaginationElement ||
        !this.activityPrevPageBtn ||
        !this.activityNextPageBtn ||
        !this.activityPageInfo
      ) {
        console.error(
          "EngagementActivityManager: One or more required DOM elements for the activity tab not found."
        );
        return;
      }

      this.initEventListeners();
      // Pagination event listeners
      this.activityPrevPageBtn.addEventListener("click", () => {
        if (this.currentActivityPage > 1) {
          this.currentActivityPage--;
          this.loadActivities(this.currentActivityPage);
        }
      });
      this.activityNextPageBtn.addEventListener("click", () => {
        if (this.currentActivityPage < this.totalActivityPages) {
          this.currentActivityPage++;
          this.loadActivities(this.currentActivityPage);
        }
      });
    }

    initEventListeners() {
      this.refreshButton.addEventListener("click", () => this.loadActivities());
      this.exportButton.addEventListener("click", () =>
        this.exportActivityAsExcel()
      );
      this.filterTypeSelect.addEventListener("change", () =>
        this.loadActivities()
      );
      this.filterPeriodSelect.addEventListener("change", () =>
        this.loadActivities()
      );
      // Listener for board select will be added in fetchCurrentUserAndBoards to ensure it's populated first
    }

    async fetchCurrentUserAndBoards() {
      if (!this.token) {
        this.token = await getAuthToken();
      }
      if (!this.token) {
        // Hide workspace select input
        if (this.boardSelectElement)
          this.boardSelectElement.style.display = "none";
        // Hide stats and empty message
        if (this.totalActivitiesElement)
          this.totalActivitiesElement.style.display = "none";
        if (this.emptyMessageElement)
          this.emptyMessageElement.style.display = "none";
        if (this.engagmentStatsElement)
          this.engagmentStatsElement.style.display = "none";
        if (this.activityListElement)
          this.activityListElement.style.height = "auto";
        if (this.boardLabel) this.boardLabel.style.display = "none";
        if (this.periodContainer) this.periodContainer.style.display = "none";
        renderLoginRequiredUI(
          this.activityListElement,
          "Login Required",
          "To view your engagement activity, please login to your ManagePlus account.",
          "Login to ManagePlus"
        );
        return false;
      } else {
        // Show controls if token is present
        if (this.activityListElement)
          this.activityListElement.style.height = "500px";
        if (this.boardSelectElement) this.boardSelectElement.style.display = "";
        if (this.totalActivitiesElement)
          this.totalActivitiesElement.style.display = "";
        if (this.engagmentStatsElement)
          this.engagmentStatsElement.style.display = "";
        if (this.boardLabel) this.boardLabel.style.display = "";
        if (this.periodContainer) this.periodContainer.style.display = "";
      }

      try {
        // Fetch user data, including user ID and businesses (boards)
        const response = await fetch(`${APIURL}/user/me`, {
          headers: { Authorization: `Bearer ${this.token}` },
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `Failed to fetch user and workspace data: ${response.status}`
          );
        }
        const data = await response.json();

        // Extract user ID from the /me response
        if (data.data && data.data._id) {
          this.userId = data.data._id;
        } else if (data.data && data.data.user && data.data.user._id) {
          this.userId = data.data.user._id;
        } else {
          console.warn("User ID not found in /me response:", data);
          // Not showing a user-facing error for this, but userId will be null
        }
        console.log("EngagementActivityManager: User ID set to:", this.userId);

        // Populate the board select element specific to this tab
        this.boards = data.data?.businesses || [];
        populateBoards(
          this.boardSelectElement,
          data,
          "Select Workspace for Activities"
        ); // populateBoards is from utils

        // Determine currentBusinessId after populating and auto-select if possible
        this.currentBusinessId = null; // Default to null

        if (
          this.boardSelectElement.options.length > 1 &&
          this.boardSelectElement.options[0].value === ""
        ) {
          // Standard case: placeholder exists at options[0], and there's an actual board at options[1].
          // Auto-select the first actual board.
          this.boardSelectElement.value =
            this.boardSelectElement.options[1].value;
          this.currentBusinessId = this.boardSelectElement.value;
        } else if (this.boards.length > 0) {
          // Boards exist, but the primary condition (placeholder + multiple options) wasn't met.
          // This could mean populateBoards put the first (or only) board directly as options[0],
          // or it pre-selected a value.
          if (
            this.boardSelectElement.value &&
            this.boardSelectElement.value !== ""
          ) {
            // If populateBoards already set a meaningful value on the select element, use it.
            this.currentBusinessId = this.boardSelectElement.value;
          } else if (
            this.boardSelectElement.options.length > 0 &&
            this.boardSelectElement.options[0].value !== ""
          ) {
            // Fallback: select the first option if it's a valid board ID (not an empty placeholder value).
            this.boardSelectElement.value =
              this.boardSelectElement.options[0].value;
            this.currentBusinessId = this.boardSelectElement.value;
          }
          // If currentBusinessId is still null here, it means no suitable board could be auto-selected.
        } else {
          // this.boards.length === 0 (no boards fetched from API)
          this.currentBusinessId = null;
        }
        console.log(
          "EngagementActivityManager: Current Business ID set to:",
          this.currentBusinessId
        );

        // Add event listener for board selection changes only once
        if (
          this.boardSelectElement &&
          !this.boardSelectElement.dataset.listenerAttached
        ) {
          this.boardSelectElement.addEventListener("change", (event) => {
            this.currentBusinessId = event.target.value;
            console.log(
              "EngagementActivityManager: Board changed to:",
              this.currentBusinessId
            );

            // Call loadActivities and handle errors
            this.loadActivities()
              .then(() => {
                console.log("Activities loaded successfully.");
              })
              .catch((err) => {
                console.error("Failed to load activities:", err);
                showNotification("Failed to load activities", "error");
              });
          });

          this.boardSelectElement.dataset.listenerAttached = "true";
        }

        return true;
      } catch (error) {
        console.error("Error in fetchCurrentUserAndBoards:", error);
        if (this.boardSelectElement)
          this.boardSelectElement.innerHTML = `<option value="">Error loading workspaces</option>`;
        showNotification(
          `Error loading user/workspace data: ${error.message}`,
          "error"
        );
        this.userId = null;
        this.currentBusinessId = null;
        return false;
      }
    }

    async initializeIfNeeded() {
      // This is called when the Engagement Activity tab is clicked
      const setupSuccess = await this.fetchCurrentUserAndBoards();
      if (!setupSuccess) {
        // Don't overwrite login UI
        return;
      }

      if (!this.userId) {
        // This is not a blocker for loading activities if API doesn't strictly require created_by
        // but good to note if created_by filter is desired.
        console.warn(
          "EngagementActivityManager: User ID not available. `created_by` filter will not be applied."
        );
      }

      if (this.currentBusinessId) {
        this.currentActivityPage = 1;
        this.totalActivityPages = 1;
        this.totalActivityRecords = 0;
        await this.loadActivities(1);
      } else {
        const message =
          this.boards.length === 0
            ? "No workspaces found."
            : "Please select a workspace to view activities.";
        this.activityListElement.innerHTML = `<p class="text-gray-500 text-center py-4">${message}</p>`;
        if (this.emptyMessageElement)
          this.emptyMessageElement.style.display = "none";
        this.updateTotalActivities(0);
      }
    }

    updateTotalActivities(count) {
      if (this.totalActivitiesElement) {
        this.totalActivitiesElement.textContent = `${count} activit${
          count !== 1 ? "ies" : "y"
        }`;
      }
    }

    async loadActivities(pageNum = 1) {
      // Load activities using the fetched user ID and selected business ID
      if (!this.token) {
        // Attempt to re-fetch token if missing, though fetchCurrentUserAndBoards should handle it.
        this.token = await getAuthToken();
        if (!this.token) {
          showNotification("Authentication token not available.", "error");
          this.displayActivities([]);
          this.updateTotalActivities(0);
          return;
        }
      }

      if (!this.currentBusinessId) {
        showNotification(
          "Please select a workspace to load activities.",
          "info"
        );
        this.displayActivities([]);
        this.updateTotalActivities(0);
        return;
      }

      const rowsPerPage = 20;
      // const filterDays = parseInt(this.filterPeriodSelect.value);
      // const filterType = this.filterTypeSelect.value;

      const filterPeriodSelect = document.getElementById(
        "filter-activity-period"
      );
      const filterDays = parseInt(filterPeriodSelect?.value || "7", 10);

      // Calculate start and end dates
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(endDate.getDate() - filterDays + 1); // Inclusive

      // Format as ISO string with time
      const formatDate = (d) => d.toISOString();

      let apiUrl = `${APIURL}/activity/list?row_per_page=${rowsPerPage}&page_num=${pageNum}&hide_activity=false&activity_type[]=36`;
      apiUrl += `&start_date=${formatDate(startDate)}&end_date=${formatDate(
        endDate
      )}`;
      console.log({ apiUrl, user: this.userId });
      // Add created_by filter using the user ID obtained from /me
      if (this.userId) {
        apiUrl += `&created_by=${this.userId}`;
      } else {
        console.warn(
          "EngagementActivityManager: User ID not set, 'created_by' filter omitted."
        );
      }

      this.activityListElement.innerHTML = `<p class="text-gray-500 text-center py-4">Loading activities...</p>`;
      if (this.emptyMessageElement)
        this.emptyMessageElement.style.display = "none";

      try {
        const headers = {
          // Add b-id header using the selected business ID
          Authorization: `Bearer ${this.token}`,
          "b-id": this.currentBusinessId,
        };

        const response = await fetch(apiUrl, { headers });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.message || `HTTP error ${response.status}`);
        }

        const data = await response.json();
        let activities = data.data?.rows || [];
        this.totalActivityRecords = data.data?.total_number_of_records || 0;
        this.totalActivityPages = Math.max(
          1,
          Math.ceil(this.totalActivityRecords / rowsPerPage)
        );
        this.currentActivityPage = pageNum;
        this.updateActivityPagination();

        // Client-side date filtering
        // const cutoffDate = new Date();
        // cutoffDate.setDate(cutoffDate.getDate() - filterDays);
        // cutoffDate.setHours(0, 0, 0, 0);

        // activities = activities.filter((activity) => {
        //   const activityDate = new Date(
        //     activity.createdAt || activity.created_at
        //   );
        //   activityDate.setHours(0, 0, 0, 0);
        //   return activityDate >= cutoffDate;
        // });

        // Client-side type filtering

        // activities = activities;

        this.displayActivities(activities);
      } catch (error) {
        console.error("Error loading engagement activities:", error);
        this.activityListElement.innerHTML = `<p class="text-red-500 text-center py-4">Error loading activities: ${error.message}</p>`;
        showNotification(`Error loading activities: ${error.message}`, "error");
        this.displayActivities([]); // Clears to empty state
        if (this.activityPaginationElement)
          this.activityPaginationElement.classList.add("hidden");
      }
    }

    getActivityTypeDescription(type) {
      const typeMap = {
        36: "Visited Profile",
        // Add other known activity types here based on ManagePlus API
      };
      return typeMap[type] || `Activity (Type ${type})`;
    }

    displayActivities(activities) {
      this.updateTotalActivities(activities.length);

      if (activities.length === 0) {
        this.activityListElement.innerHTML = "";
        if (this.emptyMessageElement)
          this.emptyMessageElement.style.display = "block";
        if (this.activityPaginationElement)
          this.activityPaginationElement.classList.add("hidden");
        return;
      }

      if (this.emptyMessageElement)
        this.emptyMessageElement.style.display = "none";

      this.activityListElement.innerHTML = activities
        .map(
          (post) => `
        <div class="history-item bg-white p-4 rounded-lg border border-gray-200">
          <div class="flex justify-between items-start mb-2">
            <div class="flex  gap-3">
 <div class="flex items-center space-x-2">
  ${
    !!post?.customer_ids?.length
      ? `
        <a href="${
          post.customer_ids[0]?.mp_customer_linkedin_profile
        }" target="_blank" rel="noopener noreferrer" class="flex items-center space-x-2 text-inherit hover:text-inherit">
      
          <div>
          <h3 class="font-medium text-gray-900">
            ${
              `${post.customer_ids[0]?.first_name} ${post.customer_ids[0]?.last_name}` ||
              "Unknown User"
            }
          </h3>

             <p class="text-xs text-gray-500">${formatDateTime(
               post.updated_at
             ).toLocaleString()}</p>
          </div>
        </a>
        
      `
      : `
        <div class="flex items-center space-x-2">
          <img
            src="https://ui-avatars.com/api/?name=${encodeURIComponent(
              post?.activity_data?.metadata?.poster_name || "U"
            )}"
            alt="User Avatar"
            class="w-8 h-8 rounded-full object-cover"
          />
          <h3 class="font-medium text-gray-900">
            ${post?.activity_data?.metadata?.poster_name || "Unknown User"}
          </h3>
        </div>
      `
  }
</div>
${
  post?.activity_data?.metadata?.poster_profile
    ? `
    <div>
      <a href="${
        post.activity_data.metadata.poster_profile
      }" target="_blank" rel="noopener noreferrer" class="underline hover:no-underline text-inherit hover:text-inherit">
        <h3 class="font-medium text-gray-900">
          Poster ${post.activity_data.metadata.poster_name || "Unknown User"}
        </h3>
      </a>
    </div>
  `
    : ""
}

            </div>
            ${
              post?.activity_data?.metadata?.post_url
                ? `
              <a href="${post.activity_data.metadata.post_url}" target="_blank" class="text-sm text-black-600 hover:text-black-800">
                View Post
              </a>
            `
                : ""
            }
            
          </div>




          <div class="space-y-2">
 <div class="flex items-center gap-6">
                ${
                  post?.activity_data?.content?.profile_visited
                    ? `
            <div class="flex items-center space-x-3 text-sm">
              <span class="flex items-center space-x-1 action-badge action-${"like"}">
<span>🌐</span><span>Profile Visited</span>
              </span>
          
              <span class="text-xs text-gray-400 whitespace-nowrap">
                ${new Date(
                  post?.activity_data?.content?.profile_visit_date
                ).toLocaleTimeString()}
              </span>
            </div>
          `
                    : ""
                }

          ${
            post?.activity_data?.content?.post_liked
              ? `
            <div class="flex items-center space-x-3 text-sm">
              <span class="flex items-center space-x-1 action-badge action-${"like"}">
                <span>👍</span><span>Like</span>
              </span>
          
              <span class="text-xs text-gray-400 whitespace-nowrap">
                ${new Date(
                  post?.activity_data?.content?.post_like_date
                ).toLocaleTimeString()}
              </span>
            </div>
          `
              : ""
          }
          

          </div>
          ${
            post?.activity_data?.content?.post_commented
              ? `
            <div class="flex items-center space-x-3 text-sm">
                  <span class="flex items-center space-x-1 action-badge action-${"like"}">
        ${`<span>💬</span><span>Comment</span>`}
      </span>

              <p class="text-gray-600 text-sm">${
                post.activity_data.content.post_comment
              }</p>
              <span class="text-xs text-gray-400 whitespace-nowrap">
                ${new Date(
                  post.activity_data.content.post_comment_date
                ).toLocaleTimeString()}
              </span>
            </div>
          `
              : ""
          }
          
</div>

          
        </div>
      `
        )
        .join("");
    }

    async exportActivityAsExcel() {
      if (!this.token) {
        showNotification(
          "Authentication token not available for export.",
          "error"
        );
        return;
      }
      if (!this.currentBusinessId) {
        showNotification(
          "Please select a workspace to export activities.",
          "info"
        );
        return;
      }

      // Fetch all relevant activities for export (ignoring UI pagination for export)
      let exportApiUrl = `${APIURL}/activity/list?row_per_page=1000&page_num=1&hide_activity=false`;
      if (this.userId) {
        // Add created_by filter for export as well
        exportApiUrl += `&created_by=${this.userId}`;
      }

      try {
        const headers = {
          Authorization: `Bearer ${this.token}`,
          "b-id": this.currentBusinessId,
          // Add b-id header for export as well
        };
        const response = await fetch(exportApiUrl, { headers });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.message ||
              `Failed to fetch data for export: ${response.status}`
          );
        }
        const data = await response.json();
        let activitiesToExport = data.data?.rows || [];

        // Apply client-side filters (date, type) if needed for export, similar to loadActivities
        const filterDays = 0;
        const filterType = this.filterTypeSelect.value;
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - filterDays);
        cutoffDate.setHours(0, 0, 0, 0);

        activitiesToExport = activitiesToExport.filter((activity) => {
          const activityDate = new Date(
            activity.createdAt || activity.created_at
          );
          activityDate.setHours(0, 0, 0, 0);
          return activityDate >= cutoffDate;
        });
        if (filterType !== "all") {
          activitiesToExport = activitiesToExport.filter(
            (activity) => String(activity.activity_type) === filterType
          );
        }

        if (activitiesToExport.length === 0) {
          showNotification(
            "No activity data to export based on current filters.",
            "warning"
          );
          return;
        }

        const exportData = activitiesToExport.map((activity) => {
          const customer = activity.customer_id;
          const customerName = customer
            ? `${customer.first_name || ""} ${customer.last_name || ""}`.trim()
            : "Unknown";
          let actionDetail =
            activity.activity_data?.content?.text ||
            activity.activity_data?.content?.comment_text ||
            "";
          if (activity.activity_type === 36 && !actionDetail)
            actionDetail = "Visited Profile";

          return {
            Date: activity.createdAt
              ? formatDateForExcel(new Date(activity.createdAt))
              : "",
            User: customerName,
            "LinkedIn Profile": customer
              ? customer.mp_customer_linkedin_profile
              : "",
            "Activity Type": this.getActivityTypeDescription(
              activity.activity_type
            ),
            Details: actionDetail,
            "Post URL": activity.activity_data?.metadata?.post_url || "",
            "Comment URL": activity.activity_data?.metadata?.comment_url || "",
          };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "EngagementActivity");
        const excelBuffer = XLSX.write(workbook, {
          bookType: "xlsx",
          type: "array",
        });
        const blob = new Blob([excelBuffer], {
          type: "application/octet-stream",
        });

        chrome.downloads.download({
          url: URL.createObjectURL(blob),
          filename: `manageplus_engagement_activity_${formatDateForExcel(
            new Date()
          )}.xlsx`,
        });
        showNotification(
          "Engagement activity exported successfully!",
          "success"
        );
      } catch (error) {
        console.error("Error exporting engagement activity:", error);
        showNotification(`Error exporting activity: ${error.message}`, "error");
      }
    }

    updateActivityPagination() {
      if (!this.activityPaginationElement) return;
      // Show pagination if more than 1 page
      if (this.totalActivityPages > 1) {
        this.activityPaginationElement.classList.remove("hidden");
        this.activityPageInfo.textContent = `Page ${this.currentActivityPage} of ${this.totalActivityPages}`;
        this.activityPrevPageBtn.disabled = this.currentActivityPage <= 1;
        this.activityNextPageBtn.disabled =
          this.currentActivityPage >= this.totalActivityPages;
      } else {
        this.activityPaginationElement.classList.add("hidden");
      }
    }
  }

  // ... (rest of the file, including instantiation of managers)

  if (!window.historyManagerInstance) {
    window.historyManagerInstance = new HistoryManager();
  }
  if (!window.listSegmentManagerInstance) {
    window.listSegmentManagerInstance = new ListSegmentManager();
  }
  if (!window.engagementActivityManagerInstance) {
    window.engagementActivityManagerInstance = new EngagementActivityManager();
  }

  // --- Remove the DOMContentLoaded listener if you had it ---
  // document.addEventListener("DOMContentLoaded", () => { ... }); // REMOVE THIS
} else {
  console.log(
    "History script already initialized. Skipping duplicate execution."
  );
}

// Shared helper to render login required UI
function renderLoginRequiredUI(
  container,
  messageTitle,
  messageDesc,
  buttonText = "Login to ManagePlus"
) {
  if (!container) return;
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-0">
      <div class="bg-white p-4 max-w-md w-full text-center">
        <img src="https://app.manageplus.io/admin/images/mp_logo_transparent.png" alt="ManagePlus Logo" class="mx-auto mb-0" style="width: 60px; height: 60px;" />
        <h3 class="text-2xl font-bold mb-2 text-gray-900">${messageTitle}</h3>
        <p class="text-sm text-gray-600 mb-4">${messageDesc}</p>
        <button id="mp-login-btn" class="mt-2 px-6 py-2" style="background:#101112;color:#fff;border:none;box-shadow:none;border-radius:0.5rem;font-weight:600;outline:none;transition:background 0.2s;">${buttonText}</button>
      </div>
    </div>
  `;
  const btn = container.querySelector("#mp-login-btn");
  if (btn) {
    btn.addEventListener("click", () => {
      window.open(WEBURL, "_blank");
    });
  }
}

if (window.engagementActivityManagerInstance) {
  // Re-attach the event listener in case the element was not present before
  const filterPeriodSelect = document.getElementById("filter-activity-period");
  if (filterPeriodSelect && !filterPeriodSelect.dataset.listenerAttached) {
    filterPeriodSelect.addEventListener("change", () =>
      window.engagementActivityManagerInstance.loadActivities()
    );
    filterPeriodSelect.dataset.listenerAttached = "true";
  }
}
