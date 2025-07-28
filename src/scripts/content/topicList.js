// Topic List Content Script

const {
  defaultStartPrompt,
  defaultEndPrompt,
  MaxTokens,
} = require("../../utils/constant");
const { showNotification } = require("../../utils/notification");
const {
  simulateMouseClick,
  simulateTyping,
  setCommentInputValue,
} = require("../../utils/simulation");
const {
  getPostId,
  getPostUrl,
  getPosterName,
  getPosterProfile,
  getRandomDelay,
  waitForElement,
  callApi,
  addTopicToList,
} = require("../../utils/utils");
const getSelectors = require("../../utils/selectors");
const tracker = require("../../utils/engagement");

(function () {
  // Check if we're on the correct LinkedIn pages

  // Configuration variables
  let SELECTORS = null;
  let commentLength = 50; // Default comment length
  let userPrompt =
    "You are a professional comment generator. Generate a concise, professional, and personalized comment based on the user's post and its top comments."; // Default user prompt

  // Inject custom styles for the button
  function injectStyles() {
    if (document.getElementById("mp-topic-list-style")) return;
    const style = document.createElement("style");
    style.id = "mp-topic-list-style";
    style.textContent = `
      .mp-topic-button {
        background: rgb(16, 17, 18);
        color: rgb(255, 255, 255);
        font-weight: 500;
        font-size: 14px;
        border: none;
        border-radius: 7px;
        padding: 8px 16px;
        margin-left: 10px;
        cursor: pointer;
        transition: background 0.18s;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .mp-topic-button:hover {
        background: rgb(35, 35, 37);
      }
      .mp-topic-button svg {
        margin-right: 8px;
      }
    `;
    document.head.appendChild(style);
  }

  // Get LinkedIn session ID
  async function getLinkedInSessionId() {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ action: "getCookie" }, (response) => {
        if (response.error) {
          reject(response.error);
          console.log("Error getting LinkedIn session ID:", response.error);
        } else {
          // Clean the session token by removing extra quotes
          const rawSessionId = response.jsessionId;
          const cleanedSessionId = rawSessionId
            ? JSON.parse(rawSessionId)
            : null;
          console.log("LinkedIn session ID:", cleanedSessionId);
          resolve(cleanedSessionId);
        }
      });
    });
  }

  // Add topic to list using utility
  async function handleAddTopicToList() {
    try {
      const sessionId = await getLinkedInSessionId();
      if (!sessionId) {
        showNotification("Failed to get LinkedIn session ID", "error");
        return;
      }
      const currentUrl = window.location.href;
      await addTopicToList(sessionId, currentUrl);
      showNotification("Topic added to list successfully", "success");
      // Optionally: send a message to background to force refresh
      chrome.runtime.sendMessage({ action: "refreshTopicList" });
    } catch (error) {
      showNotification("Failed to add topic to list", "error");
    }
  }

  // Extract post content
  function extractPostContent(post) {
    // Try to find the main text content
    const contentElement =
      post.querySelector(SELECTORS.postContent[0]) ||
      post.querySelector(SELECTORS.postContent[1]);

    if (contentElement) {
      return contentElement.textContent.trim();
    }

    // Fallback
    return post.textContent.trim();
  }

  // Extract top comments
  async function extractTopComments(post) {
    const comments = [];

    const commentBtns = post.getElementsByClassName(
      SELECTORS.openCommentButton[0]
    );
    const commentBtn = commentBtns?.length ? commentBtns[0] : null;
    if (!commentBtn) return comments;

    simulateMouseClick(commentBtn);
    await new Promise((resolve) =>
      setTimeout(resolve, getRandomDelay(2000, 5000))
    );

    const loadMoreBtns = post.getElementsByClassName(
      SELECTORS.loadMoreComments[0]
    );

    const loadMoreBtn = loadMoreBtns?.length ? loadMoreBtns[0] : null;
    if (loadMoreBtn) {
      simulateMouseClick(loadMoreBtn);
      await new Promise((resolve) =>
        setTimeout(resolve, getRandomDelay(2000, 5000))
      );
    }
    // Find comment elements
    const commentElements =
      post.querySelectorAll(SELECTORS.commentElements[0]) ||
      post.querySelectorAll(SELECTORS.commentElements[1]);

    // Get up to 3 comments
    for (let i = 0; i < Math.min(3, commentElements.length); i++) {
      const commentText = commentElements[i].textContent.trim();
      comments.push(commentText);
    }

    return comments;
  }

  // Generate comment using GPT API
  async function generateGPTComment(postContent, topComments) {
    try {
      const max_words = commentLength;
      const prompt = `Generate comment for post: "${postContent}"`;
      const finalSystemPrompt = [
        defaultStartPrompt.trim(),
        userPrompt.trim(),
        defaultEndPrompt.trim(),
      ].join("\n");
      const systemPrompt = finalSystemPrompt.replace(
        "{{MAX_WORDS}}",
        max_words
      );

      const body = JSON.stringify({
        model: "llama3.1:latest",
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          { role: "user", content: prompt },
        ],
        options: {
          max_token: MaxTokens[commentLength],
          repeat_penalty: 1.2,
        },
      });

      const serverUrl = `${APIURL}/ai/chat`;

      const data = await callApi({
        action: "API_POST_GENERATE_COMMENT",
        url: serverUrl,
        method: "POST",
        body,
      });

      console.log("data: ", data);

      if (data.error) {
        console.error("GPT API error:", data.error);
        return "Great insights! Thanks for sharing this valuable information.";
      }

      return data.data.data;
    } catch (error) {
      console.error("Error calling GPT API:", error);
      return "Great insights! Thanks for sharing this valuable information.";
    }
  }

  // Post comment to LinkedIn
  async function postComment(post, comment) {
    try {
      // Find comment input field
      const commentButton =
        post.querySelector(SELECTORS.commentButton[0]) ||
        post.querySelector(SELECTORS.commentButton[1]);

      if (!commentButton) {
        // Try to open comment section first
        const openCommentButton = post.querySelector(
          SELECTORS.openCommentButton[1]
        );
        if (openCommentButton) {
          simulateMouseClick(openCommentButton);

          // Wait for comment section to load
          await new Promise((resolve) =>
            setTimeout(resolve, getRandomDelay(1000, 3000))
          );
        }
      }

      // Clean the comment by removing quotes if present
      if (comment[0] === '"') {
        comment = comment.slice(1, -1);
      } else if (comment[comment.length - 1] === '"') {
        comment = comment.slice(0, -1);
      } else if (comment[0] === "'") {
        comment = comment.slice(1, -1);
      } else if (comment[comment.length - 1] === "'") {
        comment = comment.slice(0, -1);
      }

      // Find comment input after opening comments
      const commentInput =
        post.querySelector(SELECTORS.commentInput[0]) ||
        post.querySelector(SELECTORS.commentInput[1]);

      if (!commentInput) {
        throw new Error("Comment input or submit button not found");
      }

      // Type comment with human-like delays
      await setCommentInputValue(commentInput, comment);

      let submitButton = null;
      const submitButtonSelectors = SELECTORS.submitButton;

      // Ensure submitButtonSelectors is a valid array before proceeding
      if (
        submitButtonSelectors &&
        Array.isArray(submitButtonSelectors) &&
        submitButtonSelectors.length > 0
      ) {
        const pollingTimeout = 5000; // Max time to wait for the button (5 seconds)
        const pollInterval = 500; // Check every 500ms
        let elapsedTime = 0;

        // Poll for the submit button to appear and be enabled
        while (!submitButton && elapsedTime < pollingTimeout) {
          for (const selector of submitButtonSelectors) {
            const button = post.querySelector(selector);
            // Check if button exists and is not disabled (which often means it's ready)
            if (
              button &&
              !button.disabled &&
              button.getAttribute("aria-disabled") !== "true"
            ) {
              submitButton = button;
              break; // Exit inner loop (selectors) once a suitable button is found
            }
          }
          if (submitButton) break; // Exit outer loop (polling) if button is found

          await new Promise((resolve) => setTimeout(resolve, pollInterval));
          elapsedTime += pollInterval;
        }
      }

      if (!submitButton) {
        console.error(
          `Comment submit button not found or not enabled for post ${getPostId(
            post
          )} after polling. Selectors attempted:`,
          submitButtonSelectors
        );
        throw new Error(
          "Comment submit button not found or not enabled after polling"
        );
      }

      // Short delay before submitting
      await new Promise((resolve) =>
        setTimeout(resolve, getRandomDelay(500, 1500))
      );

      // Click submit button
      simulateMouseClick(submitButton);

      // Track the engagement
      await tracker.addEngagement({
        postId: getPostId(post),
        postContent: extractPostContent(post),
        posterName: getPosterName(post),
        posterProfile: getPosterProfile(post),
        postUrl: getPostUrl(post),
        type: "comment",
        value: comment,
      });

      showNotification("Comment posted successfully", "success");
      return true;
    } catch (error) {
      console.error("Error posting comment:", error);
      showNotification("Error posting comment", "error");
      return false;
    }
  }

  // Scan posts function
  async function scanPosts() {
    if (!(await isCurrentPageManagedTopic())) {
      showNotification(
        "This page is not a managed topic. Engagement is disabled.",
        "warning"
      );
      return;
    }
    console.log("Scanning posts...");
    showNotification("Scanning posts for engagement", "info");

    // Load selectors if not already loaded
    if (!SELECTORS) {
      SELECTORS = await getSelectors();
    }

    // Find the first post
    const posts = document.querySelectorAll(SELECTORS.postList[0]);
    if (!posts || posts.length === 0) {
      console.log("No posts found");
      return;
    }

    // Process the first post
    const post = posts[0];
    try {
      // Extract post content
      const postContent = extractPostContent(post);
      console.log("Post content:", postContent);

      // Extract top comments
      const topComments = await extractTopComments(post);
      console.log("Top comments:", topComments);

      // Generate comment
      const generatedComment = await generateGPTComment(
        postContent,
        topComments
      );
      console.log("Generated comment:", generatedComment);

      // Post the comment
      await postComment(post, generatedComment);
    } catch (error) {
      console.error("Error processing post:", error);
      showNotification("Error processing post", "error");
    }
  }

  // Check if current session and url match a managed topic (no error shown)
  async function isCurrentPageManagedTopic() {
    try {
      const sessionId = await getLinkedInSessionId();
      if (!sessionId) return false;
      const topicList = await requestTopicListFromBackground(sessionId);
      const currentUrl = window.location.href;
      return topicList.some(
        (topic) => topic.url === currentUrl && topic.sessionId === sessionId
      );
    } catch {
      return false;
    }
  }

  // Helper to find the correct parent UL for the topic button
  function getTopicButtonUl() {
    // Use the most robust selector for the filters bar
    const parentDiv = document.getElementById("search-reusables__filters-bar");
    if (!parentDiv) {
      console.warn(
        "LinkedIn TopicList: #search-reusables__filters-bar not found"
      );
      return null;
    }
    // Find the first ul inside the parent div
    const ul = parentDiv.querySelector("ul");
    if (!ul) {
      console.warn(
        "LinkedIn TopicList: No <ul> found inside #search-reusables__filters-bar"
      );
    }
    return ul;
  }

  // Request topic list from background
  function requestTopicListFromBackground(sessionId) {
    return new Promise((resolve) => {
      chrome.runtime.sendMessage(
        { action: "getTopicList", sessionId },
        (response) => {
          if (response && response.success) {
            resolve(response.data);
          } else {
            console.warn("Failed to fetch topic list:", response?.error);
            resolve([]);
          }
        }
      );
    });
  }

  // Render the topic button based on topic list and current url
  async function renderTopicButtonFromList(sessionId) {
    const ul = getTopicButtonUl();
    console.log(
      "LinkedIn TopicList: Rendering topic button for session:",
      sessionId
    );
    if (!ul) return;
    ul.querySelectorAll("li.mp-topic-button-li").forEach((li) => li.remove());
    const topicList = await requestTopicListFromBackground(sessionId);
    const currentUrl = window.location.href;
    const isManaged =
      Array.isArray(topicList) &&
      topicList.some(
        (topic) => topic.url === currentUrl && topic.sessionId === sessionId
      );
    console.log("LinkedIn TopicList: Current URL is managed:", isManaged);
    console.log("LinkedIn TopicList: Topic list:", ul);
    if (!ul) {
      console.warn(
        "appendTopicButtonLi: <ul> is null, cannot append topic button."
      );
      return;
    }
    // Remove any existing topic button li
    ul.querySelectorAll("li.mp-topic-button-li").forEach((li) => li.remove());
    const li = document.createElement("li");
    li.className = "mp-topic-button-li";
    const button = document.createElement("button");
    button.className = "mp-topic-button";
    button.type = "button";
    button.innerText = isManaged ? "Manage Topic List" : "Add Topic to List";
    button.onclick = isManaged
      ? () => showNotification("Already managed topic", "info")
      : handleAddTopicToList;
    li.appendChild(button);
    ul.appendChild(li);
    console.log(
      "appendTopicButtonLi: Appended topic button li:",
      li,
      "to ul:",
      ul
    );
  }

  // On page load, get sessionId and render topic button
  async function initialize() {
    SELECTORS = await getSelectors();
    injectStyles();
    const sessionId = await getLinkedInSessionId();
    if (sessionId) {
      renderTopicButtonFromList(sessionId);
    }
    // Only observe for topic button
    const observer = new MutationObserver(async () => {
      const sessionId = await getLinkedInSessionId();
      if (sessionId) {
        renderTopicButtonFromList(sessionId);
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    chrome.storage.local.get(["commentLength", "userPrompt"], (result) => {
      if (result.commentLength) {
        commentLength = result.commentLength;
      }
      if (result.userPrompt) {
        userPrompt = result.userPrompt;
      }
    });
    await scanPosts();
  }

  // Run the initialization
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initialize);
  } else {
    initialize();
  }
})();
