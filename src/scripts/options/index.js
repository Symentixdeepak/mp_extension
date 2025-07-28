// In popup.js, options.js etc.
require("../../styles/tailwind.css");
const { DEFAULT_SETTINGS, ONE_MINUTE } = require("../../utils/constant");
const { publishEvent, refreshLinkedInFeedAfterDelay } = require("../../utils/utils");

// DOM Elements
const form = document.getElementById("options-form");
// const useGPTCheckbox = document.getElementById('useGPT');
// const apiKeyInput = document.getElementById('apiKey');
// const apiKeyContainer = document.getElementById('apiKeyContainer');
const autoPostCheckbox = document.getElementById("autoPostEnabled");
const dailyLimitInput = document.getElementById("dailyLimit");
const minDelayInput = document.getElementById("minDelay");
const maxDelayInput = document.getElementById("maxDelay");
const resetButton = document.getElementById("reset-button");
const saveButton = document.getElementById("save-button");
const statusMessage = document.getElementById("status-message");
const likePostCheckbox = document.getElementById("likePostEnabled");
const commentLengthInput = document.getElementById("commentLength");
const userPromptInput = document.getElementById("promptInput");
const feedCommenterActiveCheckbox = document.getElementById(
  "feedCommenterActive"
);
const enableAICommentOnPostCheckbox = document.getElementById("enableAICommentOnPost");

// Load saved settings
function loadSettings() {
  chrome.storage.local.get(
    [
      "useGPT",
      "apiKey",
      "autoPostEnabled",
      "dailyLimit",
      "minDelay",
      "maxDelay",
      "likePostEnabled",
      "commentLength",
      "userPrompt",
      "feed_commenter_active",
      "showtest",
    ],
    function (items) {
      // Apply settings with fallbacks to defaults
      // useGPTCheckbox.checked = items.useGPT !== undefined ? items.useGPT : DEFAULT_SETTINGS.useGPT;
      // apiKeyInput.value = items.apiKey || DEFAULT_SETTINGS.apiKey;

      autoPostCheckbox.checked =
        items.autoPostEnabled !== undefined
          ? items.autoPostEnabled
          : DEFAULT_SETTINGS.autoPostEnabled;
      dailyLimitInput.value = items.dailyLimit || DEFAULT_SETTINGS.dailyLimit;
      minDelayInput.value = Math.round(
        parseInt(items.minDelay || DEFAULT_SETTINGS.minDelay) / ONE_MINUTE
      );
      maxDelayInput.value = Math.round(
        parseInt(items.maxDelay || DEFAULT_SETTINGS.maxDelay) / ONE_MINUTE
      );
      // console.log("likePostEnabled: ", likePostCheckbox.value)
      likePostCheckbox.checked =
        items.likePostEnabled !== undefined
          ? items.likePostEnabled
          : DEFAULT_SETTINGS.likePostEnabled;
      // console.log("likePostEnabled: ", likePostCheckbox.value)
      commentLengthInput.value =
        items.commentLength || DEFAULT_SETTINGS.commentLength;
      feedCommenterActiveCheckbox.checked =
        items.feed_commenter_active !== undefined
          ? items.feed_commenter_active
          : DEFAULT_SETTINGS.isFeedCommenterActive;
      userPromptInput.value =
        items.userPrompt
          ?.split("\n")
          .map((line) => line.trimStart())
          .join("\n") ||
        DEFAULT_SETTINGS.userPrompt
          ?.split("\n")
          .map((line) => line.trimStart())
          .join("\n");
      if (enableAICommentOnPostCheckbox) {
        enableAICommentOnPostCheckbox.checked =
          items.showtest !== undefined ? items.showtest : true;
      }
      // Toggle API key field visibility based on GPT setting
      // apiKeyContainer.style.display = useGPTCheckbox.checked ? 'block' : 'none';
    }
  );
}

// Save settings
function saveSettings() {
  // Validate inputs
  const dailyLimit = parseInt(dailyLimitInput.value);
  const minDelay = parseInt(minDelayInput.value);
  const maxDelay = parseInt(maxDelayInput.value);

  // Validation checks
  if (isNaN(dailyLimit) || dailyLimit < 1 || dailyLimit > 200) {
    showStatus("Daily limit must be between 1 and 200", "error");
    return false;
  }

  if (isNaN(minDelay) || minDelay < 1) {
    showStatus("Minimum delay must be at least 1 minute", "error");
    return false;
  }

  if (isNaN(maxDelay) || maxDelay < minDelay) {
    showStatus("Maximum delay must be greater than minimum delay", "error");
    return false;
  }

  // Check if API key is provided when using GPT
  // if (useGPTCheckbox.checked && !apiKeyInput.value.trim()) {
  //   showStatus("API key is required when using GPT", "error");
  //   return false;
  // }

  // Save to storage
  chrome.storage.local.set(
    {
      useGPT: true,
      apiKey: null,
      autoPostEnabled: autoPostCheckbox.checked,
      likePostEnabled: likePostCheckbox.checked,
      dailyLimit: dailyLimit,
      minDelay: minDelay * ONE_MINUTE,
      maxDelay: maxDelay * ONE_MINUTE,
      commentLength: commentLengthInput.value,
      userPrompt: userPromptInput.value,
      feed_commenter_active: feedCommenterActiveCheckbox.checked,
      showtest: enableAICommentOnPostCheckbox ? enableAICommentOnPostCheckbox.checked : true,
    },
    function () {
      showStatus("Settings saved successfully!", "success");
      publishEvent();
      refreshLinkedInFeedAfterDelay()
    }
  );

  return true;
}

// Reset settings to defaults
function resetSettings() {
  // useGPTCheckbox.checked = DEFAULT_SETTINGS.useGPT;
  // apiKeyInput.value = DEFAULT_SETTINGS.apiKey;
  autoPostCheckbox.checked = DEFAULT_SETTINGS.autoPostEnabled;
  likePostCheckbox.checked = DEFAULT_SETTINGS.likePostEnabled;
  dailyLimitInput.value = DEFAULT_SETTINGS.dailyLimit;
  minDelayInput.value = Math.round(
    parseInt(DEFAULT_SETTINGS.minDelay) / ONE_MINUTE
  );
  maxDelayInput.value = Math.round(
    parseInt(DEFAULT_SETTINGS.maxDelay) / ONE_MINUTE
  );
  commentLengthInput.value = DEFAULT_SETTINGS.commentLength;
  userPromptInput.value = DEFAULT_SETTINGS.userPrompt
    ?.split("\n")
    .map((line) => line.trimStart())
    .join("\n");
  feedCommenterActiveCheckbox.checked = DEFAULT_SETTINGS.isFeedCommenterActive;
  if (enableAICommentOnPostCheckbox) enableAICommentOnPostCheckbox.checked = true;

  // apiKeyContainer.style.display = useGPTCheckbox.checked ? "block" : "none";

  showStatus("Settings reset to defaults. Click Save to apply.", "info");
}

// Show status message
function showStatus(message, type = "success") {
  statusMessage.textContent = message;
  statusMessage.classList.remove(
    "hidden",
    "bg-green-100",
    "text-green-800",
    "bg-red-100",
    "text-red-800",
    "bg-blue-100",
    "text-blue-800"
  );

  switch (type) {
    case "error":
      statusMessage.classList.add("bg-red-100", "text-red-800");
      break;
    case "info":
      statusMessage.classList.add("bg-blue-100", "text-blue-800");
      break;
    default:
      statusMessage.classList.add("bg-green-100", "text-green-800");
  }

  statusMessage.classList.remove("hidden");

  // Auto-hide after 3 seconds
  setTimeout(() => {
    statusMessage.classList.add("hidden");
  }, 3000);
}

// Event listeners
document.addEventListener("DOMContentLoaded", loadSettings);

// useGPTCheckbox.addEventListener("change", function () {
//   apiKeyContainer.style.display = this.checked ? "block" : "none";
// });

form.addEventListener("submit", function (e) {
  e.preventDefault();
  saveSettings();
});

resetButton.addEventListener("click", resetSettings);
