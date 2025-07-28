// d:\ManagePlus\mp-extensions\linkedin-engagement\src\scripts\background\engagementWorker.js
let currentEngagement = {
  listId: null,
  customers: [],
  currentIndex: 0,
  isEngaging: false,
  targetTabId: null,
  token: null,  nextCustomerTimeoutId: null,

  businessId: null,
  activityProcessingTimeoutId: null, // For tracking timeout for content script response
  onUpdatedListener: null, // To store the reference to the listener
  currentActivityId: null, // To store ID from POST /activity
  settings: {}, // To store minDelay, maxDelay, dailyLimit etc.
};

const { DEFAULT_SETTINGS, APIURL } = require("../../utils/constant"); // For default delays etc.
const { ENGAGEMENT_KEEP_ALIVE_ALARM_NAME } = require("../../utils/constant");
const { getRandomDelay } = require("../../utils/utils");
const BASE_MANAGEPLUS_URL = APIURL; // Or your actual base URL

const ENGAGEMENT_STORAGE_KEYS = {
  STATUS: 'engagement_status', // "started", "stopped"
  LIST_ID: 'engagement_data_listId',
  // CUSTOMERS: 'engagement_data_customers', // We will not store customers directly to avoid size limits
  CURRENT_INDEX: 'engagement_data_currentIndex',
  TOKEN: 'engagement_data_token',
  BUSINESS_ID: 'engagement_data_businessId',
  SETTINGS: 'engagement_data_settings',
  CURRENT_ACTIVITY_ID: 'engagement_data_currentActivityId',
  TARGET_TAB_ID: 'engagement_target_tab_id', // Already used by navigateToProfile
  PROMPT: 'engagement_data_prompt' // Store the prompt used for the engagement
};

async function fetchCustomersForEngagement(listId, token, businessId) {
  const apiUrl = `${BASE_MANAGEPLUS_URL}/segmentation/customers/${listId}?rows_per_page=0`; // Get all customers
  try {
    const response = await fetch(apiUrl, {
      headers: { Authorization: `Bearer ${token}`, "b-id": businessId },
    });
    if (!response.ok) {
      console.error(`HTTP error fetching customers: ${response.status}`);
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        errorData.message || `Failed to fetch customers (${response.status})`
      );
    }
    const data = await response.json();
    // Filter out customers who do not have a LinkedIn profile URL
    // And those already marked as lkdn_engaged (though this might be redundant if API does it)
    const validCustomers = (data.data?.rows || []).filter(
      (c) =>
        c.customer_id &&
        c.customer_id.mp_customer_linkedin_profile &&
        !c.lkdn_engaged
    );
    console.log(
      `Fetched ${data.data?.rows?.length} customers, ${validCustomers.length} are valid for engagement.`
    );
    return data.data?.rows || [];
  } catch (error) {
    console.error("Error fetching customers for engagement:", error);
    throw error;
  }
}

async function recordProfileVisitActivity(
  segmentId,
  customerId,
  token,
  businessId
) {
  const apiUrl = `${BASE_MANAGEPLUS_URL}/activity?type=36`;
  const payload = {
    activity_type: 36,
    customer_ids: [customerId], // Use the actual customer ID here
    activity_data: {
      content: {
        profile_visited: true,
        profile_visit_date: new Date().toISOString(),
      },
      metadata: {
        segment_id: segmentId,
      },
    },
  };

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        "b-id": businessId,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response
        .json()
        .catch(() => ({ message: `HTTP error ${response.status}` }));
      console.error("API Error for activity:", errorData);
      throw new Error(
        errorData.message || `Activity API Error ${response.status}`
      );
    }
    console.log(
      "Activity API call successful for customer:",
      customerId,
      "in segment:",
      segmentId
    );
    const responseData = await response.json();
    if (responseData && responseData.data && responseData.data._id) {
      return responseData.data._id; // Return the activity ID
    }
    throw new Error(
      "Activity API call successful but no ID returned in data.id"
    );
  } catch (error) {
    console.error("Error calling activity API:", error);
    throw error;
  }
}

async function navigateToProfile(url) {
  const linkedInUrlPattern = "https://www.linkedin.com/*";
  let { engagement_target_tab_id: targetTabId } =
    await chrome.storage.local.get("engagement_target_tab_id");

  if (targetTabId) {
    try {
      const tab = await chrome.tabs.get(targetTabId);
      if (
        tab &&
        tab.url &&
        tab.url.toLowerCase().startsWith("https://www.linkedin.com/")
      ) {
        await chrome.tabs.update(targetTabId, { url }); // Just update URL
        if (!tab.pinned)
          await chrome.tabs.update(targetTabId, { pinned: true });
        return tab;
      } else if (tab) {
        console.log(
          `Target tab ${targetTabId} is no longer a valid LinkedIn tab or URL is missing. Invalidating.`
        );
        targetTabId = null;
        await chrome.storage.local.remove("engagement_target_tab_id");
      }
    } catch (e) {
      console.log(
        `Failed to get target tab ${targetTabId}, it might have been closed. Error: ${e.message}`
      );
      targetTabId = null;
      await chrome.storage.local.remove("engagement_target_tab_id");
    }
  }

  const tabs = await chrome.tabs.query({
    pinned: true,
    url: linkedInUrlPattern,
  });

  if (tabs.length > 0) {
    await chrome.tabs.update(tabs[0].id, { url }); // Just update URL
    await chrome.storage.local.set({ engagement_target_tab_id: tabs[0].id });
    return tabs[0];
  }

  const anyLinkedInTabs = await chrome.tabs.query({ url: linkedInUrlPattern });
  if (anyLinkedInTabs.length > 0) {
    const tabToUse = anyLinkedInTabs[0];
    await chrome.tabs.update(tabToUse.id, { url, pinned: true }); // Just update URL and pin
    await chrome.storage.local.set({ engagement_target_tab_id: tabToUse.id });
    return tabToUse;
  }

  // Create new tab if no existing one found
  const newTab = await chrome.tabs.create({
    url,
    pinned: true,
  });
  await chrome.storage.local.set({ engagement_target_tab_id: newTab.id });
  return newTab;
}

function cleanupTabUpdateListener() {
  if (currentEngagement.onUpdatedListener) {
    chrome.tabs.onUpdated.removeListener(currentEngagement.onUpdatedListener);
    currentEngagement.onUpdatedListener = null;
  }
}

async function processNextCustomer() {
  if (!currentEngagement.isEngaging) {
    cleanupTabUpdateListener();
    return;
  }

  // NEW: Check daily limits before attempting to process this customer
  const { dailyLimit } = currentEngagement.settings;
  const storedStats = await chrome.storage.local.get(["postsLiked", "commentsPosted", "lastResetDate"]);
  const today = new Date().toDateString();

  let postsLikedToday = 0;
  let commentsPostedToday = 0;

  if (storedStats.lastResetDate === today) {
    postsLikedToday = storedStats.postsLiked || 0;
    commentsPostedToday = storedStats.commentsPosted || 0;
  } else {
    // If lastResetDate is not today, stats are stale and considered 0 for today's limit check.
    console.log("Daily stats in engagementWorker (processNextCustomer) are from a previous day or not yet initialized for today. Assuming 0 for limit check.");
  }

  // Ensure dailyLimit is a positive number to enforce a limit.
  if (dailyLimit && dailyLimit > 0 && (postsLikedToday >= dailyLimit || commentsPostedToday >= dailyLimit)) {
    console.log(
      `Engagement (processNextCustomer): Daily limit reached. Liked Today: ${postsLikedToday}, Commented Today: ${commentsPostedToday}, Limit: ${dailyLimit}.` +
      ` Pausing processing for current customer (Index: ${currentEngagement.currentIndex}). Will retry in 1 hour.`
    );
    // Do not stop the engagement. Do not advance currentIndex yet.
    // Schedule a retry for the *same* customer.
    // The engagement remains active (isEngaging = true).
    // saveEngagementState() will be called if/when advanceToNextCustomer is eventually called for this customer,
    // or by resume logic. Here, we just schedule the retry.
    setTimeout(processNextCustomer, 60 * 60 * 1000); // Retry in 1 hour
    return; // Stop further processing for *this specific attempt* for this customer.
  }

  if (currentEngagement.currentIndex >= currentEngagement.customers.length) {
    // Additional check: if customers array became empty after filtering
    if (
      currentEngagement.customers.length === 0 &&
      currentEngagement.isEngaging
    ) {
      console.log("Engagement: No eligible customers were found to process.");
      await handleStopEngagementRequest(
        {
          listId: currentEngagement.listId,
          message: "No eligible customers found after filtering.",
        },
        () => {}
      );
      return;
    }
    console.log("Engagement completed: All customers processed.");
    await handleStopEngagementRequest(
      { listId: currentEngagement.listId },
      () => {}
    ); // Stop and clear
    return;
  }

  const customer = currentEngagement.customers[currentEngagement.currentIndex];
  // Ensure customer and profile URL exist
  if (
    !customer ||
    !customer.customer_id ||
    !customer.customer_id.mp_customer_linkedin_profile
  ) {
    console.warn(
      `Customer at index ${currentEngagement.currentIndex} is invalid or has no LinkedIn profile. Skipping.`
    );
    advanceToNextCustomer("invalid_customer_data");
    return;
  }
  const baseProfileUrl = customer.customer_id.mp_customer_linkedin_profile;

  if (!baseProfileUrl) {
    console.warn(
      `Customer ${customer.customer_id.first_name} has no LinkedIn profile. Skipping.`
    );
    advanceToNextCustomer("no_linkedin_profile_url");
    return;
  }

  const targetUrl = `${baseProfileUrl.replace(/\/$/, "")}/recent-activity/all/`;
  console.log(
    `Processing customer ${currentEngagement.currentIndex + 1}/${
      currentEngagement.customers.length
    }: ${customer.customer_id.first_name}, URL: ${targetUrl}`
  );

  try {
    const tab = await navigateToProfile(targetUrl);
    currentEngagement.targetTabId = tab.id;

    cleanupTabUpdateListener(); // Remove previous listener if any

    currentEngagement.onUpdatedListener = async function (
      tabId,
      changeInfo,
      updatedTab
    ) {
      if (
        tabId === currentEngagement.targetTabId &&
        changeInfo.status === "complete"
      ) {
        // Check if the loaded URL is indeed the profile page (or a subpage of it)
        // and not a login page or other unexpected redirect.
        if (
          updatedTab.url &&
          updatedTab.url.toLowerCase().startsWith(baseProfileUrl.toLowerCase())
        ) {
          console.log(
            `Successfully navigated to user activity page: ${updatedTab.url}`
          );
          cleanupTabUpdateListener(); // Listener did its job

          try {
            // 1. Call POST /activity for profile visit
            currentEngagement.currentActivityId =
              await recordProfileVisitActivity(
                currentEngagement.listId,
                customer.customer_id._id, // Pass the customer's ID
                currentEngagement.token,
                currentEngagement.businessId
              );
            console.log(
              `Profile visit activity recorded for ${customer.customer_id.first_name}. Activity ID: ${currentEngagement.currentActivityId}`
            );
            // Store/update customer and activity ID in local storage
            await chrome.storage.local.set({
              engagement_current_customer_activity: {
                customerId: customer.customer_id._id,
                activityId: currentEngagement.currentActivityId,
              },
            });

            // 2. Send message to content script (activityEngager.js) to process likes/comments
            await chrome.tabs.sendMessage(
              currentEngagement.targetTabId,
              {
                action: "START_USER_ACTIVITY_PROCESSING",
                payload: {
                  activityId: currentEngagement.currentActivityId,
                  token: currentEngagement.token,
                  businessId: currentEngagement.businessId,
                  customer: customer, // Pass customer details if needed by content script
                  settings: currentEngagement.settings, // Pass relevant settings
                },
              },
              (response) => {
                if (chrome.runtime.lastError) {
                  // Clear timeout if message sending itself failed
                  if (currentEngagement.activityProcessingTimeoutId) {
                    clearTimeout(currentEngagement.activityProcessingTimeoutId);
                    currentEngagement.activityProcessingTimeoutId = null;
                  }
                  console.error(
                    "Error sending START_USER_ACTIVITY_PROCESSING message:",
                    chrome.runtime.lastError.message
                  );
                  // If message fails, content script won't run, so advance.
                  advanceToNextCustomer("message_send_failed");
                } else {
                  console.log(
                    "START_USER_ACTIVITY_PROCESSING message sent, response:",
                    response
                  );
                  // If content script immediately signals failure in its sync response (if any)
                  if (response && response.success === false) {
                    console.warn(
                      "Content script immediately responded with failure:",
                      response.message
                    );
                    if (currentEngagement.activityProcessingTimeoutId) {
                      clearTimeout(
                        currentEngagement.activityProcessingTimeoutId
                      );
                      currentEngagement.activityProcessingTimeoutId = null;
                    }
                    advanceToNextCustomer("content_script_immediate_failure");
                  }
                  // Otherwise, the timeout remains active, waiting for USER_ACTIVITY_DONE
                }
              }
            );

            // Set a timeout for the content script to respond via USER_ACTIVITY_DONE
            // This timeout is cleared in advanceToNextCustomer or if message sending fails
          } catch (apiError) {
            console.error(
              `Profile visit API call failed for ${customer.customer_id.first_name}:`,
              apiError.message
            );
            advanceToNextCustomer("api_error_profile_visit");
          }
        } else if (
          updatedTab.url &&
          !updatedTab.url.toLowerCase().startsWith("chrome://")
        ) {
          // Ignore chrome internal pages
          console.warn(
            `Tab ${tabId} loaded an unexpected URL: ${updatedTab.url}. Expected to start with ${baseProfileUrl}. Skipping customer.`
          );
          cleanupTabUpdateListener();
          advanceToNextCustomer("unexpected_url_loaded");
        }
      }
    };
    chrome.tabs.onUpdated.addListener(currentEngagement.onUpdatedListener);

    // Clear any existing timeout before setting a new one
    if (currentEngagement.activityProcessingTimeoutId) {
      clearTimeout(currentEngagement.activityProcessingTimeoutId);
    }
    // Set a timeout for the content script to complete its processing for this customer
    currentEngagement.activityProcessingTimeoutId = setTimeout(() => {
      console.warn(
        `Timeout waiting for USER_ACTIVITY_DONE from tab ${currentEngagement.targetTabId} for customer ${customer.customer_id._id}. Advancing.`
      );
      // Ensure the onUpdatedListener for this specific attempt is cleaned up if it's still active
      cleanupTabUpdateListener();
      advanceToNextCustomer("content_script_timeout");
    }, 180000); // 3 minutes timeout
  } catch (error) {
    console.error("Error navigating to profile:", error.message);
    cleanupTabUpdateListener();
    advanceToNextCustomer("navigation_error");
  }
}

// New function to advance to the next customer with proper delay
export async function advanceToNextCustomer(reason = "unknown") {
  console.log(`Advancing customer processing. Reason: ${reason}. Current index before logic: ${currentEngagement.currentIndex}`);

  // Clear existing activity timeout
  if (currentEngagement.activityProcessingTimeoutId) {
    clearTimeout(currentEngagement.activityProcessingTimeoutId);
    currentEngagement.activityProcessingTimeoutId = null;
  }

  // ✅ Clear the scheduled next customer timeout (if exists)
  if (currentEngagement.nextCustomerTimeoutId) {
    clearTimeout(currentEngagement.nextCustomerTimeoutId);
    currentEngagement.nextCustomerTimeoutId = null;
  }

  if (!currentEngagement.isEngaging) {
    console.log("advanceToNextCustomer called but not engaging. Returning.");
    return;
  }

  const pauseReasonsDueToLimit = [
    "daily_limit_reached_in_content_script"
  ];

  let scheduleDelay;
  let advanceIndex = true;

  if (pauseReasonsDueToLimit.includes(reason)) {
    console.log(
      `Engagement (advanceToNextCustomer): Pause triggered for customer index ${currentEngagement.currentIndex} due to reason: '${reason}'. Will retry in 1 hour.`
    );
    advanceIndex = false;
    scheduleDelay = 60 * 60 * 1000; // 1 hour
  } else {
    scheduleDelay = getRandomDelay(
      currentEngagement.settings.minDelay || DEFAULT_SETTINGS.minDelay,
      currentEngagement.settings.maxDelay || DEFAULT_SETTINGS.maxDelay
    );
  }

  if (advanceIndex) {
    currentEngagement.currentIndex++;
    console.log(`Advancing to next customer index: ${currentEngagement.currentIndex}. Reason: ${reason}`);
  }

  await saveEngagementState();

  console.log(`Waiting ${scheduleDelay / 1000}s before next processNextCustomer call (for index ${currentEngagement.currentIndex}).`);

  // ✅ Save and schedule next process
  currentEngagement.nextCustomerTimeoutId = setTimeout(processNextCustomer, scheduleDelay);
}


async function saveEngagementState() {
  console.log("[SAVE_STATE_DEBUG] Attempting to save state. isEngaging:", currentEngagement.isEngaging, "listId:", currentEngagement.listId, "currentIndex:", currentEngagement.currentIndex);
  if (!currentEngagement.isEngaging && currentEngagement.listId == null) {
    console.log("[SAVE_STATE_DEBUG] Not engaging AND no listId. Calling clearEngagementState().");
    await clearEngagementState();
    return;
  }
  if (!currentEngagement.isEngaging) {
    console.log("[SAVE_STATE_DEBUG] Not engaging (isEngaging is false), so not saving state. listId might still be set:", currentEngagement.listId);
    // Potentially, if isEngaging is false but listId is set, we might want to clear,
    // but resume logic should handle stale "stopped" states.
    // For now, just log and return. If a "stopped" state needs explicit clearing,
    // it should happen in handleStopEngagementRequest.
    return;
  }

  // NEW CHECK: If engaging, ensure critical data is present.
  if (currentEngagement.isEngaging && (!currentEngagement.listId || !currentEngagement.token || !currentEngagement.businessId)) {
    console.error("[SAVE_STATE_DEBUG] CRITICAL ERROR: Attempting to save 'started' engagement state, but essential data (listId, token, or businessId) is missing!");
    console.error("[SAVE_STATE_DEBUG] Current Engagement State:", JSON.parse(JSON.stringify(currentEngagement)));
    // This is an invalid state to save as "started". We should clear it to prevent issues on resume.
    await clearEngagementState(); // Clear to prevent inconsistent state
    return; // Do not save an invalid "started" state.
  }


  const stateToSave = {
    [ENGAGEMENT_STORAGE_KEYS.STATUS]: "started",
    [ENGAGEMENT_STORAGE_KEYS.LIST_ID]: currentEngagement.listId,
    [ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX]: currentEngagement.currentIndex,
    [ENGAGEMENT_STORAGE_KEYS.TOKEN]: currentEngagement.token,
    [ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID]: currentEngagement.businessId,
    [ENGAGEMENT_STORAGE_KEYS.SETTINGS]: currentEngagement.settings,
    [ENGAGEMENT_STORAGE_KEYS.CURRENT_ACTIVITY_ID]: currentEngagement.currentActivityId,
    [ENGAGEMENT_STORAGE_KEYS.PROMPT]: currentEngagement.settings?.userPrompt || "", // Save the prompt
    // Also save the targetTabId if it exists, so resume can try to use it.
    [ENGAGEMENT_STORAGE_KEYS.TARGET_TAB_ID]: currentEngagement.targetTabId,
    // Legacy keys for potential UI reads or other parts of the extension
    'engagement_segment_id': currentEngagement.listId,
    'engagement_token': currentEngagement.token,
    'engagement_business_id': currentEngagement.businessId,
  };
  await chrome.storage.local.set(stateToSave);
  console.log("Engagement state (excluding customers) saved:", stateToSave);
  // Log critical pieces of data being saved
  console.log("[SAVE_STATE_DEBUG] Data saved - Status:", stateToSave[ENGAGEMENT_STORAGE_KEYS.STATUS],
    "ListID:", stateToSave[ENGAGEMENT_STORAGE_KEYS.LIST_ID],
    "Token:", stateToSave[ENGAGEMENT_STORAGE_KEYS.TOKEN] ? "Exists" : "MISSING_OR_EMPTY",
    "BusinessID:", stateToSave[ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID] ? "Exists" : "MISSING_OR_EMPTY",
    "CurrentIndex:", stateToSave[ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX]);

  if (!stateToSave[ENGAGEMENT_STORAGE_KEYS.LIST_ID] || !stateToSave[ENGAGEMENT_STORAGE_KEYS.TOKEN] || !stateToSave[ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID]) {
    console.error("[SAVE_STATE_DEBUG] CRITICAL WARNING: Saving engagement state but one or more essential fields (listId, token, businessId) are missing or empty in stateToSave!", stateToSave);
  }
}

export async function handleStartEngagementRequest(request, sendResponse) {
  if (currentEngagement.isEngaging) {
    sendResponse({
      success: false,
      message: "Engagement already in progress.",
    });
    return;
  }

  const { listId, token, businessId, settings, prompt } = request; // Expect settings from popup/caller
  if (!listId || !token || !businessId) {
    sendResponse({
      
      success: false,
      message: "Missing listId, token, or businessId.",
    });
    return;
  }

  console.log("Starting engagement for list:", listId);
  currentEngagement.listId = listId;
  currentEngagement.token = token;
  currentEngagement.businessId = businessId;
  currentEngagement.isEngaging = true;
  currentEngagement.currentIndex = 0;
  currentEngagement.currentActivityId = null;

  // Load settings from storage or use passed settings, merge with defaults
  const storedSettings = await chrome.storage.local.get([
    "minDelay",
    "maxDelay",
    "dailyLimit",
    "autoPostEnabled",
    "likePostEnabled",
    "commentLength",
    "userPrompt",
    "apiKey",
    "useGPT",
  ]);
  currentEngagement.settings = {
    minDelay: storedSettings.minDelay || DEFAULT_SETTINGS.minDelay,
    maxDelay: storedSettings.maxDelay || DEFAULT_SETTINGS.maxDelay,
    dailyLimit: storedSettings.dailyLimit || DEFAULT_SETTINGS.dailyLimit,
    autoPostEnabled:
      storedSettings.autoPostEnabled !== undefined
        ? storedSettings.autoPostEnabled
        : DEFAULT_SETTINGS.autoPostEnabled,
    likePostEnabled:
      storedSettings.likePostEnabled !== undefined
        ? storedSettings.likePostEnabled
        : DEFAULT_SETTINGS.likePostEnabled,
    commentLength:
      storedSettings.commentLength || DEFAULT_SETTINGS.commentLength,
    userPrompt: storedSettings.userPrompt || DEFAULT_SETTINGS.userPrompt,
    apiKey: storedSettings.apiKey || DEFAULT_SETTINGS.apiKey,
    useGPT:
      storedSettings.useGPT !== undefined
        ? storedSettings.useGPT
        : DEFAULT_SETTINGS.useGPT,
    ...(settings || {}), // Override with any settings passed in the request
  };
  console.log("Engagement worker using settings:", currentEngagement.settings);

  try {
    const customers = await fetchCustomersForEngagement(
      listId,
      currentEngagement.token, // Use token from currentEngagement
      businessId
    );

    // Create a periodic alarm to keep the service worker alive and ping content script
    chrome.alarms.get(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, (existingAlarm) => {
      if (!existingAlarm) {
        chrome.alarms.create(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, {
          delayInMinutes: 0.2,
          periodInMinutes: 0.4,
        }); // Approx every 24 seconds after initial 12s delay
        console.log("Engagement keep-alive alarm created.");
      }
    });

    // Filter for those with LinkedIn profiles and not already engaged (redundant if API does it)
    currentEngagement.customers = customers.filter(
      (c) => c?.customer_id?.mp_customer_linkedin_profile && !c?.lkdn_engaged
    );

    if (currentEngagement.customers.length === 0) {
      console.log(
        "No eligible customers found for engagement after initial fetch and filter."
      );
      await handleStopEngagementRequest(
        { listId, message: "No eligible customers found." },
        () => {}
      ); // Clean up
      sendResponse({ success: true, message: "No eligible customers found." });
      return;
    }

    console.log(
      `Found ${currentEngagement.customers.length} eligible customers for engagement worker.`
    );
    await saveEngagementState(); // Save state before starting
    console.log("[START_ENGAGEMENT_DEBUG] State saved after fetching customers and before processNextCustomer.");
    await processNextCustomer(); // Start the loop
    sendResponse({ success: true, message: "Engagement started." });
  } catch (error) {
    console.error("Failed to start engagement:", error.message);
    console.log("[START_ENGAGEMENT_DEBUG] Error during start, calling handleStopEngagementRequest.");
    await handleStopEngagementRequest(
      { listId, message: `Failed to start engagement: ${error.message}` },
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      () => {}
    ); // Clean up on error
    sendResponse({
      success: false,
      message: `Failed to start engagement: ${error.message}`,
    });
  }
}

async function clearEngagementState() {
  console.log("[CLEAR_STATE_DEBUG] clearEngagementState called. Current isEngaging:", currentEngagement.isEngaging, "listId:", currentEngagement.listId);
  const keysToRemove = [
    ENGAGEMENT_STORAGE_KEYS.STATUS,
    ENGAGEMENT_STORAGE_KEYS.LIST_ID,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX,
    ENGAGEMENT_STORAGE_KEYS.TOKEN,
    ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID,
    ENGAGEMENT_STORAGE_KEYS.SETTINGS,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_ACTIVITY_ID,
    ENGAGEMENT_STORAGE_KEYS.TARGET_TAB_ID,
    ENGAGEMENT_STORAGE_KEYS.PROMPT,
    // Legacy keys for good measure
    'engagement_segment_id',
    'engagement_token',
    'engagement_business_id',
    'engagement_prompt',
    'engagement_current_customer_activity'
  ];
  await chrome.storage.local.remove(keysToRemove);
  console.log("[CLEAR_STATE_DEBUG] Engagement state cleared from storage. Keys removed:", keysToRemove);
}

export async function handleStopEngagementRequest(request, sendResponse) {
  const stopMessage = request.message || "Engagement stopped.";
  console.log(
    "Stopping engagement for list:",
    currentEngagement.listId,
    "currentIndex:",
    currentEngagement.currentIndex, // Log current index for debugging
    ". Reason:",
    stopMessage
  );
  currentEngagement.isEngaging = false;
  cleanupTabUpdateListener(); // Important to remove listener

  currentEngagement.listId = null;
  if (currentEngagement.activityProcessingTimeoutId) {
    clearTimeout(currentEngagement.activityProcessingTimeoutId);
    currentEngagement.activityProcessingTimeoutId = null;
  }

  // currentEngagement.currentIndex++; // Let's reconsider this. If stopping, the index shouldn't matter for resume as state is cleared.
                                     // If it was for some other logic, it needs to be evaluated. For now, commenting out.
  currentEngagement.token = null;
  currentEngagement.businessId = null;
  currentEngagement.currentActivityId = null;
  currentEngagement.settings = {};

  await clearEngagementState();

  // Clear the keep-alive alarm
  chrome.alarms.clear(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, (wasCleared) => {
    if (wasCleared) console.log("Engagement keep-alive alarm cleared.");
  });

  console.log("Engagement stopped and state cleared from storage.");
  if (sendResponse) sendResponse({ success: true, message: stopMessage });
}

export function handleGetEngagementStatusRequest(request, sendResponse) {
  const statusPayload = {
    isEngaging: currentEngagement.isEngaging,
    listId: currentEngagement.listId,
    currentCustomerActivity: currentEngagement.currentActivityId
      ? { activityId: currentEngagement.currentActivityId }
      : null, // Basic info, could be expanded if needed
  };
  console.log(
    "[EngagementWorker] handleGetEngagementStatusRequest: Current state being sent to background/index.js:",
    JSON.parse(JSON.stringify(statusPayload)), // Log a deep copy
    "Raw currentEngagement.isEngaging:", currentEngagement.isEngaging,
    "Raw currentEngagement.listId:", currentEngagement.listId
  );
  sendResponse(statusPayload);
}

export async function resumeEngagementOnStartup() {
  console.log("[RESUME_DEBUG] Attempting to resume engagement on startup...");
  const keysToGet = [
    ENGAGEMENT_STORAGE_KEYS.STATUS,
    ENGAGEMENT_STORAGE_KEYS.LIST_ID,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX,
    ENGAGEMENT_STORAGE_KEYS.TOKEN,
    ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID,
    ENGAGEMENT_STORAGE_KEYS.SETTINGS,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_ACTIVITY_ID,
    ENGAGEMENT_STORAGE_KEYS.TARGET_TAB_ID, // Ensure this is part of ENGAGEMENT_STORAGE_KEYS
    ENGAGEMENT_STORAGE_KEYS.PROMPT
  ];
  const storedState = await chrome.storage.local.get([
    ENGAGEMENT_STORAGE_KEYS.STATUS,
    ENGAGEMENT_STORAGE_KEYS.LIST_ID,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX,
    ENGAGEMENT_STORAGE_KEYS.TOKEN,
    ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID,
    ENGAGEMENT_STORAGE_KEYS.SETTINGS,
    ENGAGEMENT_STORAGE_KEYS.CURRENT_ACTIVITY_ID,
    ENGAGEMENT_STORAGE_KEYS.TARGET_TAB_ID,
    ENGAGEMENT_STORAGE_KEYS.PROMPT
  ]);
  console.log("[RESUME_DEBUG] Raw state retrieved from storage:", JSON.parse(JSON.stringify(storedState)));

  const status = storedState[ENGAGEMENT_STORAGE_KEYS.STATUS];
  const listId = storedState[ENGAGEMENT_STORAGE_KEYS.LIST_ID];
  const token = storedState[ENGAGEMENT_STORAGE_KEYS.TOKEN];
  const businessId = storedState[ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID];

  console.log("[RESUME_DEBUG] Parsed from storedState - Status:", status,
    "ListID:", listId,
    "Token:", token ? "Exists" : "MISSING_OR_EMPTY",
    "BusinessID:", businessId ? "Exists" : "MISSING_OR_EMPTY",
    "CurrentIndex:", storedState[ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX]);

  if (status === "started" && listId && token && businessId) {
    console.log("[RESUME_DEBUG] Conditions met. Previous engagement detected. Restoring state and resuming...");
    currentEngagement.isEngaging = true;

    currentEngagement.listId = storedState[ENGAGEMENT_STORAGE_KEYS.LIST_ID];
    currentEngagement.currentIndex = storedState[ENGAGEMENT_STORAGE_KEYS.CURRENT_INDEX] || 0;
    currentEngagement.token = storedState[ENGAGEMENT_STORAGE_KEYS.TOKEN];
    currentEngagement.businessId = storedState[ENGAGEMENT_STORAGE_KEYS.BUSINESS_ID];
    currentEngagement.settings = storedState[ENGAGEMENT_STORAGE_KEYS.SETTINGS] || {};
    // Ensure prompt is restored if it was saved separately or part of settings
    if (storedState[ENGAGEMENT_STORAGE_KEYS.PROMPT] && !currentEngagement.settings.userPrompt) {
        currentEngagement.settings.userPrompt = storedState[ENGAGEMENT_STORAGE_KEYS.PROMPT];
    }
    currentEngagement.currentActivityId = storedState[ENGAGEMENT_STORAGE_KEYS.CURRENT_ACTIVITY_ID] || null;
    currentEngagement.targetTabId = storedState[ENGAGEMENT_STORAGE_KEYS.TARGET_TAB_ID] || null;
    currentEngagement.customers = []; // Will be re-fetched

    try {
      const customers = await fetchCustomersForEngagement(
        currentEngagement.listId,
        currentEngagement.token,
        currentEngagement.businessId
      );
      currentEngagement.customers = customers.filter(
        (c) => c?.customer_id?.mp_customer_linkedin_profile && !c?.lkdn_engaged
      );

      if (currentEngagement.customers.length === 0) {
        console.log("No eligible customers found after re-fetching for resume. Stopping engagement.");
        console.log("[RESUME_DEBUG] No customers on resume, calling handleStopEngagementRequest.");
        await handleStopEngagementRequest({ listId: currentEngagement.listId, message: "No eligible customers on resume." }, () => {});
        return;
      }
      if (currentEngagement.currentIndex >= currentEngagement.customers.length) {
         console.log("Resumed engagement, but current index is out of bounds. All customers processed. Stopping.");
         await handleStopEngagementRequest({ listId: currentEngagement.listId, message: "All customers processed (on resume)." }, () => {});
         console.log("[RESUME_DEBUG] Index out of bounds on resume, calling handleStopEngagementRequest.");
         return;
      }

      chrome.alarms.get(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, (existingAlarm) => {
        if (!existingAlarm) {
          chrome.alarms.create(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, {
            delayInMinutes: 0.2, periodInMinutes: 0.4,
          });
          console.log("Engagement keep-alive alarm re-created on resume.");
        }
      });

      console.log(`Resuming engagement for list: ${currentEngagement.listId}, ${currentEngagement.customers.length} customers, at index: ${currentEngagement.currentIndex}`);
      setTimeout(() => { processNextCustomer(); }, 5000); // 5-second delay

    } catch (error) {
      console.error("Error re-fetching customers during resume:", error);
      console.log("[RESUME_DEBUG] Error re-fetching customers, calling handleStopEngagementRequest.");
      await handleStopEngagementRequest({ listId: currentEngagement.listId, message: "Failed to re-fetch customers on resume." }, () => {});
    }
  } else {
    console.log("[RESUME_DEBUG] Conditions NOT met. No active engagement found to resume, or stored data incomplete/invalid.");
    console.log("[RESUME_DEBUG] Details for failed resume: Status:", status, "ListID:", listId, "Token provided:", !!token, "BusinessID provided:", !!businessId);
    currentEngagement.isEngaging = false;
    currentEngagement.listId = null;
    currentEngagement.settings = {};
    // Also clear any lingering alarm if the browser starts and finds a stale "started" state
    chrome.alarms.clear(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME, (wasCleared) => {
      if (wasCleared)
        console.log("[RESUME_DEBUG] Cleared stale keep-alive alarm on browser startup (in else block).");
    });
    console.log("[RESUME_DEBUG] Calling clearEngagementState() due to failed resume conditions.");
    await clearEngagementState();
  }
}

export async function handleTabRemoved(tabId) {
  if (tabId === currentEngagement.targetTabId) {
    console.log(`Engagement target tab ${tabId} was closed.`);
    currentEngagement.targetTabId = null;
    await chrome.storage.local.remove("engagement_target_tab_id");
    // If an engagement is active, the next processNextCustomer will try to open a new tab.
    // Or, you could choose to stop the engagement if its dedicated tab is closed.
    // For now, let it try to reopen/find a new tab.
  }
}

export async function handleKeepAlivePing() {
  if (!currentEngagement.isEngaging) {
    console.log(
      "Keep-alive ping received, but no active engagement. Clearing alarm just in case."
    );
    chrome.alarms.clear(ENGAGEMENT_KEEP_ALIVE_ALARM_NAME);
    return;
  }

  console.log(
    "Service worker: Keep-alive ping processed. Engagement active for list:",
    currentEngagement.listId
  );

  if (currentEngagement.targetTabId) {
    try {
      const response = await chrome.tabs.sendMessage(
        currentEngagement.targetTabId,
        { action: "CONTENT_SCRIPT_PING" }
      );
      if (response && response.status === "pong") {
        // console.log(`Content script in tab ${currentEngagement.targetTabId} responded to ping.`);
      } else {
        console.warn(
          `Content script in tab ${currentEngagement.targetTabId} did not respond as expected to ping. Response:`,
          response
        );
      }
    } catch (error) {
      // This error often means the tab is closed, navigated away, or content script not injected/listening
      // console.warn(`Error pinging content script in tab ${currentEngagement.targetTabId}: ${error.message}.`);
      // No need to advanceToNextCustomer here, the main flow handles timeouts.
    }
  } else {
    // console.log("Keep-alive ping: No target tab ID set for content script ping.");
  }
}
