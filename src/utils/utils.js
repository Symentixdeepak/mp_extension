/**
 * LinkedIn Auto Commenter Utility Functions
 * Contains helper functions used across the extension
 */

const { WEBURL } = require("./constant");

// Generate a random string ID
function generateRandomId(length = 8) {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";

  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }

  return result;
}

// Debounce function to limit how often a function can be called
function debounce(func, wait) {
  let timeout;

  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };

    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// Check if an element is visible in viewport
function isElementInViewport(el) {
  if (!el) return false;

  const rect = el.getBoundingClientRect();

  return (
    rect.top >= 0 &&
    rect.left >= 0 &&
    rect.bottom <=
      (window.innerHeight || document.documentElement.clientHeight) &&
    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
  );
}

// Extract URLs from text
function extractUrls(text) {
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.match(urlRegex) || [];
}

// Format date for display
function formatDate(date) {
  const options = {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  };

  return new Date(date).toLocaleDateString(undefined, options);
}

// Detect celebration keywords in text
function detectCelebrationKeywords(text) {
  const keywords = [
    "new job",
    "new position",
    "new role",
    "started",
    "joined",
    "anniversary",
    "work anniversary",
    "promoted",
    "promotion",
    "celebrating",
    "celebrate",
    "new opportunity",
    "excited to announce",
    "i'm happy to share",
    "pleased to share",
    "thrilled to",
    "delighted to",
    "glad to",
    "proud to",
    "honored to",
  ];

  const lowercaseText = text.toLowerCase();
  const foundKeywords = keywords.filter((keyword) =>
    lowercaseText.includes(keyword)
  );

  return foundKeywords.length > 0 ? foundKeywords : false;
}

// Safely access nested properties without errors
function safelyGetNestedProperty(obj, path) {
  return path.split(".").reduce((prev, curr) => {
    return prev ? prev[curr] : undefined;
  }, obj);
}

// Store data with expiration
function storeWithExpiry(key, value, ttl) {
  const now = new Date();
  const item = {
    value: value,
    expiry: now.getTime() + ttl,
  };
  localStorage.setItem(key, JSON.stringify(item));
}

// Retrieve data with expiration check
function getWithExpiry(key) {
  const itemStr = localStorage.getItem(key);

  if (!itemStr) return null;

  const item = JSON.parse(itemStr);
  const now = new Date();

  if (now.getTime() > item.expiry) {
    localStorage.removeItem(key);
    return null;
  }

  return item.value;
}

// Escape HTML to prevent XSS
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// Wait for element to appear in DOM
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    if (document.querySelector(selector)) {
      return resolve(document.querySelector(selector));
    }

    const observer = new MutationObserver(() => {
      if (document.querySelector(selector)) {
        observer.disconnect();
        resolve(document.querySelector(selector));
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Set timeout
    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

// Simple string hash function
function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString();
}

function getPostId(post) {
  // Try to find a data attribute with post ID
  const idAttr =
    post.getAttribute("data-urn") ||
    post.getAttribute("data-id") ||
    post.getAttribute("id");

  if (idAttr) return idAttr;

  // Fallback: use a hash of the content
  const content = post.textContent;
  return hashString(content);
}
function getFirstUgcId(postElement) {
  const container = postElement.querySelector(
    ".comments-comment-list__container"
  );
  if (!container) return { ugcPost: null, activity: null };

  const article = container.querySelector(".comments-comment-entity");
  if (!article) return { ugcPost: null, activity: null };

  const dataId = article.getAttribute("data-id");
  if (!dataId) return { ugcPost: null, activity: null };

  const ugcMatch = dataId.match(/ugcPost:(\d+),?/);
  const activityMatch = dataId.match(/activity:(\d+),?/);

  return {
    ugcPost: ugcMatch ? ugcMatch[1] : null,
    activity: activityMatch ? activityMatch[1] : null,
  };
}

const getPostUrl = (post) => {
  const postId = getPostId(post);
  if (!postId) return "";
  return `https://www.linkedin.com/feed/update/${postId}`;
};

const getPosterName = (post) => {
  const nameTag =
    post.querySelector(
      "span.update-components-actor__single-line-truncate span[aria-hidden]"
    ) || post.querySelector("span.update-components-actor__title");
  if (!nameTag) return "";
  return nameTag.textContent.trim();
};

const getPosterProfile = (post) => {
  const anchorTag = post.querySelector("a.update-components-actor__meta-link");
  if (!anchorTag) return "";
  const href = anchorTag.getAttribute("href");

  const profileUrl = new URL(href);
  return `${profileUrl.origin}${profileUrl.pathname}`;
};

// Helper: Truncate text with ellipsis
function truncateText(text, maxLength) {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}

// Helper: Get random delay
function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function callApi(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      const err = chrome.runtime.lastError;
      if (err) {
        reject(err);
      } else {
        resolve(response);
      }
    });
  });
}

// Function to get the current activity ID from storage
async function getCurrentActivityId() {
  const data = await chrome.storage.local.get([
    "engagement_current_customer_activity",
  ]);
  return data.engagement_current_customer_activity || null;
}

function publishEvent(payload = { action: "updateActiveState" }) {
  chrome.tabs.query({ url: "*://*.linkedin.com/*" }, function (tabs) {
    for (let tab of tabs) {
      if (tab.url.includes("linkedin.com")) {
        chrome.tabs.sendMessage(tab.id, payload);
      }
    }
  });
}

function refreshLinkedInFeedAfterDelay() {
  // Find LinkedIn tab(s)
  chrome.tabs.query({ url: "*://*.linkedin.com/*" }, function (tabs) {
    for (let tab of tabs) {
      if (tab.url.includes("linkedin.com")) {
        // Wait for 5 seconds, then update the tab to linkedin.com/feed
        setTimeout(() => {
          chrome.tabs.update(tab.id, { url: "https://linkedin.com/feed" });
        }, 5000);
        break; // Refresh only the first matching tab
      }
    }
  });
}

async function getAuthToken() {
  return new Promise((resolve) => {
    chrome.cookies.get(
      {
        url: WEBURL,
        name: "hash_mg_value",
      },
      (cookie) => resolve(cookie?.value)
    );
  });
}

// Helper: Capitalize each word in a string
function capitalizeWords(str) {
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

function populateBoards(select, boards) {
  // Helper to determine if a business is active according to the plan logic
  function isBusinessActive(business) {
    if (
      !business ||
      !business.plan_info ||
      !Array.isArray(business.plan_info) ||
      business?.business_status === 0
    )
      return false;

    // Find trial and non-trial plans
    const isTrialPlan =
      business.plan_info.find((plan) => plan.status === "trial") || null;
    const isCurrentPlan =
      business.plan_info.find((plan) => plan.status !== "trial") || null;
    const hasTrial = business.plan_info.some((plan) => plan.status === "trial");
    const plan = hasTrial ? isTrialPlan : isCurrentPlan;
    if (!plan) return false;

    const now = new Date();
    const endDate = plan.subscription_end_date
      ? new Date(plan.subscription_end_date)
      : null;
    const startDate = plan.subscription_start_date
      ? new Date(plan.subscription_start_date)
      : null;
    const isFutureDate = endDate ? endDate > now : false;
    const notCreatedEnd = startDate ? startDate < now : false;

    const isTrial = plan.status === "trial";
    const isCancel = plan.status === "cancelled";
    const isCreate = plan.status === "created";
    const isPaused = plan.status === "paused";
    const noInfo = !plan;

    // Exclude if any of these conditions are true
    if (
      (isTrial && !isFutureDate) ||
      (isCancel && !isFutureDate) ||
      (isCreate && notCreatedEnd) ||
      noInfo ||
      isPaused
    ) {
      return false;
    }
    return true;
  }

  const validBusinesses =
    boards.data?.businesses?.filter(isBusinessActive) || [];

  select.innerHTML = validBusinesses.length
    ? validBusinesses
        .map(
          (b) =>
            `<option value="${b.business_id}">${capitalizeWords(
              b.business_title
            )}</option>`
        )
        .join("")
    : `<option value="">No active boards</option>`;

  // Set first item as default
  if (validBusinesses.length) {
    select.value = validBusinesses[0].business_id;
  }
}

function populateContactType(select, data) {
  const contactTypes = data.data?.rows || [];
  select.innerHTML = contactTypes.length
    ? contactTypes
        .slice()
        .reverse()
        .map(
          (t) =>
            `<option value="${t.value}">${capitalizeWords(t.label)}</option>`
        )
        .join("")
    : `<option value="">No contact types</option>`;
  // Set first item as default
  if (contactTypes.length) {
    select.value = contactTypes[contactTypes.length - 1].value;
  }
}

function populateListType(select, data) {
  const contactTypes = data.data?.rows || [];
  select.innerHTML = contactTypes.length
    ? contactTypes
        .map(
          (t) => `<option value="${t._id}">${capitalizeWords(t.name)}</option>`
        )
        .join("")
    : `<option value="">No list found</option>`;

  // Set first item as default
  if (contactTypes.length) {
    select.value = contactTypes[0]._id;
  }
}

function setImportButtonState(disabled, isLoading = false) {
  // Ensure importBtn is always available
  let btn =
    typeof importBtn !== "undefined"
      ? importBtn
      : document.getElementById("importBtn");
  if (!btn) return;
  btn.disabled = disabled;

  if (disabled) {
    btn.classList.replace("from-blue-500", "from-gray-400");
    btn.classList.replace("to-indigo-600", "to-gray-500");
    btn.classList.add("cursor-not-allowed", "opacity-75");
    btn.classList.remove("hover:from-blue-600", "hover:to-indigo-700");
  } else {
    btn.classList.replace("from-gray-400", "from-blue-500");
    btn.classList.replace("to-gray-500", "to-indigo-600");
    btn.classList.remove("cursor-not-allowed", "opacity-75");
    btn.classList.add("hover:from-blue-600", "hover:to-indigo-700");
  }
}

function isLinkedInSearchResultsUrl(url) {
  const searchResultsPattern =
    /^https:\/\/www\.linkedin\.com\/search\/results\/people\//;
  // const profilePattern =
  //   /^https:\/\/www\.linkedin\.com\/[^/]+\/[a-zA-Z]+(-[a-zA-Z]+)?-\d{1,}/;

  return searchResultsPattern.test(url);
}

function truncateWords(text, limit = 20) {
  const words = text.split(/\s+/);
  return words.length > limit ? words.slice(0, limit).join(" ") + "..." : text;
}
module.exports = {
  getPostId,
  getPostUrl,
  getPosterProfile,
  getFirstUgcId,
  populateBoards,
  getPosterName,
  populateContactType,
  truncateWords,
  getRandomDelay,
  setImportButtonState,
  refreshLinkedInFeedAfterDelay,
  truncateText,
  waitForElement,
  callApi,
  getCurrentActivityId, // Export the new function
  publishEvent,
  isLinkedInSearchResultsUrl,
  getAuthToken,
  populateListType,
  createRoundRobinRotation,
  addTopicToList,
  fetchTopicList,
};

// --- Topic List API and Round Robin Utilities ---
const { APIURL } = require("./constant");

// Add topic to list API
async function addTopicToList(sessionId, url) {
  try {
    const response = await fetch(`${APIURL}/topic/add`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, url })
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Error adding topic to list:", error);
    throw error;
  }
}

// Fetch topic list API
async function fetchTopicList(sessionId) {
  try {
    const response = await fetch(`${APIURL}/topic/list?sessionId=${encodeURIComponent(sessionId)}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return await response.json();
  } catch (error) {
    console.error("Error fetching topic list:", error);
    throw error;
  }
}

// Round robin rotation utility
function createRoundRobinRotation(urls) {
  let currentIndex = 0;
  return {
    getNext: function() {
      if (urls.length === 0) return null;
      const url = urls[currentIndex];
      currentIndex = (currentIndex + 1) % urls.length;
      return url;
    },
    getAll: function() { return [...urls]; },
    getCurrentIndex: function() { return currentIndex; },
    reset: function() { currentIndex = 0; },
    addUrl: function(url) { if (!urls.includes(url)) urls.push(url); },
    removeUrl: function(url) {
      const index = urls.indexOf(url);
      if (index !== -1) {
        urls.splice(index, 1);
        if (currentIndex >= urls.length) currentIndex = 0;
      }
    }
  };
}
