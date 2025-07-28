const tracker = require("../../utils/engagement");
const {
  getPostId,
  getPostUrl,
  getPosterName,
  getPosterProfile,
  getRandomDelay,
  waitForElement,
  callApi,
  getCurrentActivityId, // Import the new function
} = require("../../utils/utils");
const { showNotification } = require("../../utils/notification");
const {
  DEFAULT_SETTINGS,
  CommentLengthToWordsLength,
  MaxTokens,
  APIURL,
} = require("../../utils/constant");
const {
  simulateMouseClick,
  simulateTyping,
  setCommentInputValue,
} = require("../../utils/simulation");
const getSelectors = require("../../utils/selectors");

let extensionActive = DEFAULT_SETTINGS.active;
let dailyLimit = DEFAULT_SETTINGS.dailyLimit;
let commentsPosted = 0;
let postsLiked = 0;
let postsScanned = 0;
let autoPostEnabled = DEFAULT_SETTINGS.autoPostEnabled;
let minDelay = DEFAULT_SETTINGS.minDelay;
let maxDelay = DEFAULT_SETTINGS.maxDelay;
let lastProcessedPosts = new Set();
let isProcessing = false;
let apiKey = DEFAULT_SETTINGS.apiKey;
let useGPT = DEFAULT_SETTINGS.useGPT;
let likePostEnabled = DEFAULT_SETTINGS.likePostEnabled;
let commentLength = DEFAULT_SETTINGS.commentLength;
let SELECTORS = null;
let userPrompt = DEFAULT_SETTINGS.userPrompt;
let currentActivityId = null;
let authToken = null;
let businessId = null;
let segmentId = null;
// Initialize extension
async function initialize() {
  // First, check the engagement_status from local storage
  const statusData = await chrome.storage.local.get(["engagement_status"]);
  const engagementStatus = statusData.engagement_status;

  if (engagementStatus !== "started") {
    console.log(
      "LinkedIn Auto Commenter: Initialization skipped. engagement_status is not 'started'. Current status:",
      engagementStatus
    );
    // If status is not 'started', do not proceed with the rest of the initialization.
    return;
  }

  // console.log("LinkedIn Auto Commenter initialized - engagement_status is 'started'");
  // Load settings from storage
  async function refreshSettings() {
    const data = await chrome.storage.local.get([
      "active",
      "commentsPosted",
      "postsLiked",
      "postsScanned",
      "dailyLimit",
      "autoPostEnabled",
      "minDelay",
      "maxDelay",
      "apiKey",
      "useGPT",
      "lastResetDate",
      "likePostEnabled",
      "commentLength",
      "userPrompt",
      "engagement_current_customer_activity",
      "engagement_token",
      "engagement_business_id",
      "engagement_segment_id",
      "engagement_prompt",
    ]);

    console.log("refres setting starts...");
    extensionActive = data.active !== false;
    // extensionActive = false;

    // Check if we need to reset daily counts
    const today = new Date().toDateString();
    if (data.lastResetDate !== today) {
      chrome.storage.local.set({
        commentsPosted: 0,
        postsScanned: 0,
        postsLiked: 0,
        lastResetDate: today,
      });
      commentsPosted = 0;
      postsScanned = 0;
      postsLiked = 0;
    } else {
      commentsPosted = data.commentsPosted || 0;
      postsScanned = data.postsScanned || 0;
      postsLiked = data.postsLiked || 0;
    }

    dailyLimit = data.dailyLimit || DEFAULT_SETTINGS.dailyLimit;
    autoPostEnabled = data.autoPostEnabled || false;
    minDelay = data.minDelay || DEFAULT_SETTINGS.minDelay;
    maxDelay = data.maxDelay || DEFAULT_SETTINGS.maxDelay;
    apiKey = data.apiKey || "";
    useGPT = data.useGPT !== false;
    likePostEnabled = data.likePostEnabled !== false;
    commentLength = data.commentLength || DEFAULT_SETTINGS.commentLength;
    userPrompt =
      data?.engagement_prompt || data.userPrompt || DEFAULT_SETTINGS.userPrompt;
    currentActivityId = data.engagement_current_customer_activity || null;
    segmentId = data.engagement_segment_id || null;
    authToken = data.engagement_token || null;
    businessId = data.engagement_business_id || null;
    console.log("refresh setting finished...", data);
  }

  await refreshSettings();
  if (extensionActive) {
    await startScanning();
  }

  // Add message listener for popup communication
  chrome.runtime.onMessage.addListener(async function (
    request,
    sender,
    sendResponse
  ) {
    if (request.action === "updateActiveState") {
      console.log("settings got update!!!");
      // extensionActive = request.active;
      console.log({ extensionActive });
      await refreshSettings();
      console.log({ extensionActive });
      if (extensionActive && !isProcessing) {
        await startScanning();
      }
    }
    return true;
  });
}

// Start scanning for posts
async function startScanning() {
  if (!extensionActive || isProcessing) return;

  isProcessing = true;

  // Check if we've reached the daily limit
  if (postsLiked >= dailyLimit || commentsPosted >= dailyLimit) {
    chrome.storage.local.get("limitNotificationShown", function (data) {
      if (!data.limitNotificationShown) {
        showNotification(
          `Congratulations! You have achieved your daily goal of ${dailyLimit} interactions over posts.`,
          "success"
        );
        chrome.storage.local.set({ limitNotificationShown: true });
      }
    });
    //     isProcessing = false;
    isProcessing = false;
    return;
  }

  SELECTORS = await getSelectors();

  if (!SELECTORS) {
    showNotification(
      "Failed to load extension. Please try again later!",
      "warning"
    );
    isProcessing = false;
    // Inform background script that processing for this user stopped due to daily limit
    // so engagementWorker can pause on the *current* customer.
    chrome.runtime
      .sendMessage({
        action: "USER_ACTIVITY_DONE",
        payload: { status: "daily_limit_reached_in_content_script" },
      })
      .catch((e) =>
        console.error("Error sending USER_ACTIVITY_DONE for limit:", e)
      );
    return;
  }

  try {
    // Wait for the main post container element to appear
    // Use the primary selector you expect for post lists.
    const postListSelector = SELECTORS.postList[0];
    console.log(`Waiting for element: ${postListSelector}`);
    await waitForElement(postListSelector, 20000); // Wait up to 15 seconds (adjust as needed)
    console.log(`Element ${postListSelector} found. Proceeding to scan.`);

    // Now that we know the container exists, proceed with scanning
    // Add a small delay just in case content inside needs rendering time
    await new Promise(
      (resolve) => setTimeout(resolve, getRandomDelay(1000, 2000)) // Shorter delay now
    );

    // Call the actual scanning logic
    await scanPosts(); // scanPosts no longer needs the retry logic
  } catch (error) {
    // Handle the case where the element doesn't appear within the timeout
    console.error(
      `Error waiting for post container (${SELECTORS.postList[0]}):`,
      error
    );
    showNotification("Could not find LinkedIn posts to process.", "warning");
    // Decide if you want to retry later or stop
    // For now, we'll just stop processing for this cycle
  } finally {
    // Schedule next scan regardless of success/failure of finding posts in this cycle
    const delay = getRandomDelay(minDelay, maxDelay);
    // console.log(`Scheduling next scan in ${delay / 1000} seconds.`);
    const currUrl = window.location.href;
    setTimeout(() => {
      // isProcessing = false;
      if (extensionActive) {
        // console.log("Reloading page for next scan cycle.");
        if (currUrl === window.location.href) {
          // location.reload();
          startScanning();
        }
        // Alternatively, call startScanning() again if you don't want a full reload
        //
      }
    }, delay);
  }
}

function checkPromotedPosts(post, className = null) {
  let cName = className ?? SELECTORS.promotedPost[0];
  let postSubTextEls = post.querySelector(className);
  // console.log("postSubTextEls: ", !!postSubTextEls.length);
  if (postSubTextEls) {
    const postSubTextEl = postSubTextEls;
    const postSubText = postSubTextEl.textContent.trim();

    if (postSubText.toLowerCase().includes("promoted")) return true;
  }

  if (!!className) return false;

  return checkPromotedPosts(post, SELECTORS.promotedPost[1]);
}

function refreshPosts() {
  const pageUrl = window.location.href;
  const isProfilePost = pageUrl.includes("/recent-activity/all/");
  if (!isProfilePost) {
    window.location.reload();
  }
}

// Scan for celebration posts
async function scanPosts() {
  // Select all posts on the feed
  const postContainers = document.querySelectorAll(SELECTORS.postList[0]);
  // console.log("Found postContainers:", postContainers.length, SELECTORS.postList[0])
  if (postContainers?.length === 0) {
    showNotification("No posts found in this page.", "warning");
    return;
  }

  postsScanned += postContainers.length;
  updateStats();

  let engagedPosts = 0;
  let shouldRefresh = true;
  isProcessing = true;

  for (const post of postContainers) {
    const initialUrlForPost = window.location.href;
    let loadingNotification;
    try {
      const postId = getPostId(post);
      if (!postId) continue;

      const hasEngaged = await tracker.getPostById(postId);
      if (!!hasEngaged) continue;

      // Mark as processed
      post.setAttribute("data-auto-commenter-processed", "true");

      const commentButton =
        post.querySelector(SELECTORS.commentButton[0]) ||
        post.querySelector(SELECTORS.commentButton[1]);

      if (commentButton.hasAttribute("disabled")) continue;

      const isPromoted = checkPromotedPosts(post);
      if (isPromoted) continue;

      // Skip if already processed
      if (lastProcessedPosts.has(postId)) {
        continue;
      }

      lastProcessedPosts.add(postId);

      // Extract post content and comments
      const postContent = extractPostContent(post);
      const topComments = await extractTopComments(post);

      if (window.location.href !== initialUrlForPost) {
        console.log(
          `URL changed before starting generation for post ${postId}. Aborting this post.`
        );
        shouldRefresh = false;
        break; // Skip to the next post in the loop
      }

      // Generate comment

      loadingNotification = showNotification(
        "Generating comment... ",
        "loading"
      );
      console.log({ postContent, topComments });
      const generatedComment = await generateComment(postContent, topComments);

      if (window.location.href !== initialUrlForPost) {
        console.log(
          `URL changed during comment generation for post ${postId}. Aborting.`
        );
        if (loadingNotification) loadingNotification.closeNotification(); // Close loading notification
        break; // Skip to the next post in the loop
      }

      loadingNotification.closeNotification(); // Or loadingNotification.remove() for immediate removal

      // console.log("likePostEnabled: ", likePostEnabled)
      if (!generatedComment || generatedComment?.includes("NULL")) {
        showNotification("Failed to generate comment.", "error");

        if (likePostEnabled) {
          await handleLikePost(post, true);
        }
        continue;
      }

      if (likePostEnabled) {
        await handleLikePost(post, false);
      }

      showNotification("Comment generated!", "success");

      await postComment(post, generatedComment);
      engagedPosts++;
    } catch (error) {
      console.error("Error generating or posting comment:", error);
      showNotification("Error generating comment", "error");
    }

    break;
  }

  if (engagedPosts === 0 && shouldRefresh) {
    refreshPosts();
  }

  isProcessing = false;
  // Update storage
  chrome.storage.local.set({ postsScanned: postsScanned });
}

// Extract post content
function extractPostContent(post) {
  // Try to find the main text content
  const contentElement =
    post.querySelector(SELECTORS.postContent[0]) ||
    post.querySelector(SELECTORS.postContent[1]);
  // const contentElement = post.querySelector('.feed-shared-update-v2__description-text') ||
  //                         post.querySelector('.feed-shared-text');

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

// Generate comment using GPT or custom logic
async function generateComment(postContent, topComments) {
  return await generateGPTComment(postContent, topComments);
}

// Generate comment using GPT API
async function generateGPTComment(postContent, topComments) {
  try {
    const max_words = commentLength;
    const prompt = `Generate comment for post: "${postContent}"`;
    const systemPrompt = userPrompt.replace("{{MAX_WORDS}}", max_words);

    const body = JSON.stringify({
      model: "llama3.1:latest",
      messages: [
        {
          role: "system",
          content: systemPrompt,
          // content: `You are a professional comment generator. Generate a concise, professional, and personalized comment based on the user's post and its top comments. Follow these rules: Match the topic and tone without deviation; be supportive, non-aggressive, and use direct address ('you'/'your'); keep the comment within ${max_words} words; reference specific details from the post/comments; do not ask questions; synthesize ideas uniquely without copying top comments; if unable to generate properly, return NULL. Output only the comment text or NULL—no explanations, markdown, or extra text.  Example Output: Good to hear you’ve learned the MERN stack. Its simplicity and demand make it a great choice—best of luck with the interviews!`,
          // `You are a professional comment generator. You need to generate a concise, professional, and personalized comment based on the user's post and its top comments. Follow these rules: 1. Relevance: Match the topic and tone of the post and comments. Do not deviate. 2. Tone: Be supportive, non-aggressive, and avoid argumentative/questioning language. Always use direct address ('you/your'). 3. Conciseness: ${sentanceLength} sentences max. Avoid generic phrases (e.g., 'Great post!') 4. Specificity: Reference details from the post/comments (e.g., skills, achievements, goals). 5. No Questions: Do not ask for clarifications, opinions, or further details. 6. Originality: Do not repeat top comments verbatim. Synthesize ideas uniquely. 7. Output: Return only the comment text. No explanations, markdown, or extra text. Example Output: Good to hear you’ve learned the MERN stack. Its simplicity and demand make it a great choice—best of luck with the interviews!`,
        },
        { role: "user", content: prompt },
      ],
      options: {
        // temperature: 0.1,
        max_token: MaxTokens[commentLength],
        repeat_penalty: 1.2,
        // top_k: 40,
        // top_p: 0.3,
      },
    });

    const serverUrl = `${APIURL}/ai/chat`;

    const data = await callApi({
      action: "API_POST_GENERATE_COMMENT",
      isEngagement: true,
      url: serverUrl,
      method: "POST",
      body,
      authToken: authToken,
      businessId: businessId,
    });

    console.log("data: ", data);

    if (data.error) {
      console.error("GPT API error:", data.error);
      return generateCustomComment(postContent, topComments);
    }

    return data.data.data;
  } catch (error) {
    console.error("Error calling GPT API:", error);
    return generateCustomComment(postContent, topComments);
  }
}

async function handleLikePost(post, isAutoPost = true) {
  try {
    const likeButton =
      post.querySelector(SELECTORS.likeButton[0]) ||
      post.querySelector(SELECTORS.likeButton[1]);

    if (!likeButton) {
      return;
    }

    simulateMouseClick(likeButton);
    await new Promise((resolve) =>
      setTimeout(resolve, getRandomDelay(1000, 3000))
    );

    await chrome.runtime.sendMessage({
      action: "MAKE_ACTIVITY_PATCH_API_CALL",
      payload: {
        activityId: (await getCurrentActivityId())?.activityId, // Use the new function here
        token: authToken,
        businessId: businessId,
        engagement_type: "like", // Assuming only comments for now
        segmentId: segmentId,
        customerId: (await getCurrentActivityId())?.customerId,
        posterName: getPosterName(post),
        posterProfile: getPosterProfile(post),
        postUrl: getPostUrl(post),

        isAutoPost: isAutoPost,
      },
    });
    postsLiked++;

    updateStats();

    // await tracker.addEngagement({
    //   postId: getPostId(post), // Implement this
    //   postContent: extractPostContent(post),
    //   posterName: getPosterName(post),
    //   posterProfile: getPosterProfile(post),
    //   postUrl: getPostUrl(post),
    //   type: "like",
    //   value: "Like",
    // });

    // Wait for comment section to load
  } catch (e) {
    console.error("Error liking the post: ", e);
  }
}

function addCommentButtonListner(post, commentInput, submitButton) {
  if (
    commentInput &&
    submitButton &&
    !submitButton.hasAttribute("data-mp-listener-attached")
  ) {
    console.log(
      "Attaching listener to submit button for post:",
      getPostId(post)
    );

    console.log(submitButton);

    submitButton.addEventListener(
      "click",
      async (event) => {
        // Check if the input field still exists (robustness)
        const currentCommentInput =
          post.querySelector(SELECTORS.commentInput[0]) ||
          post.querySelector(SELECTORS.commentInput[1]);

        if (currentCommentInput) {
          const commentText = currentCommentInput.textContent.trim();

          if (commentText) {
            console.log(
              `User clicked submit for post ${getPostId(post)}. Comment:`,
              commentText
            );

            // --- YOUR LOGIC HERE ---
            // - Send the commentText to background script
            // - Store it using tracker.addEngagement (maybe a different type?)
            // - Perform analysis, etc.
            // -----------------------

            // Update stats
            await chrome.runtime.sendMessage({
              action: "MAKE_ACTIVITY_PATCH_API_CALL",
              payload: {
                activityId: (await getCurrentActivityId())?.activityId, // Use the new function here
                token: authToken,
                businessId: businessId,
                engagement_type: "comment", // Assuming only comments for now
                segmentId: segmentId,
                customerId: (await getCurrentActivityId())?.customerId,
                posterName: getPosterName(post),
                posterProfile: getPosterProfile(post),
                postUrl: getPostUrl(post),
                isAutoPost: true,
                comment: commentText,
              },
            });
            commentsPosted++;
            updateStats();

            // await tracker.addEngagement({
            //   postId: getPostId(post), // Implement this
            //   postContent: extractPostContent(post),
            //   posterName: getPosterName(post),
            //   posterProfile: getPosterProfile(post),
            //   postUrl: getPostUrl(post),
            //   type: "comment",
            //   value: commentText,
            // });

            // await getCommentUrl(post);
          } else {
            console.log("Submit clicked, but comment box is empty.");
          }
        } else {
          console.warn(
            "Could not find comment input field when submit was clicked."
          );
        }
      },
      true
    ); // Use capture phase if needed, but bubbling (false/default) is usually fine

    // Mark the button so we don't attach multiple listeners
    submitButton.setAttribute("data-mp-listener-attached", "true");
  }
}

async function getCommentUrl(post) {
  try {
    const commentElements =
      post.querySelectorAll(SELECTORS.commentElements[0]) ||
      post.querySelectorAll(SELECTORS.commentElements[1]);
    if (!commentElements?.length) {
      console.log("No comment elements found for post!");
      return;
    }

    const commentElement = commentElements[0];
    const userComment = commentElement.querySelector(SELECTORS.commentURN[0]);

    if (!userComment) {
      console.log("No user comment found for post");
      return;
    }

    const commentURN = userComment.getAttribute("data-id");
    if (!commentURN) {
      console.log("No comment URN found for post");
      return;
    }

    // const postId = getPostId(post);
    const commentURL = `${getPostUrl(post)}?commentUrn=${commentURN}`;

    // await tracker.addEngagement({
    //   postId: getPostId(post),
    //   commentURL,
    // });
  } catch (e) {
    console.error("Error getting comment url: ", e);
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
    await new Promise(
      (resolve) => setTimeout(resolve, getRandomDelay(500, 1500)) // Adjusted delay, as setCommentInputValue now has a small internal delay
    );

    addCommentButtonListner(post, commentInput, submitButton);

    // Check button state before attempting to click, especially for auto-post
    if (
      autoPostEnabled &&
      (submitButton.disabled ||
        submitButton.getAttribute("aria-disabled") === "true")
    ) {
      console.warn(
        `Submit button for post ${getPostId(
          post
        )} is disabled before auto-post attempt. The input simulation might not have fully enabled it. Consider using simulateTyping for more robust interaction.`
      );
    }

    if (autoPostEnabled) {
      // Click submit button
      simulateMouseClick(submitButton);
    }
    return true;
  } catch (error) {
    console.error("Error posting comment:", error);
    return false;
  }
}

// Update stats in storage
function updateStats() {
  chrome.storage.local.set({
    commentsPosted: commentsPosted,
    // postsScanned: postsScanned,
    postsLiked: postsLiked,
  });
}

// Initialize when document is loaded
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initialize);
} else {
  initialize();
}
