// Test Comment Button & Drawer Content Script (self-contained)

const { APIURL, MaxTokens, defaultStartPrompt, defaultEndPrompt } = require("../../utils/constant");
const { showNotification } = require("../../utils/notification");

(function () {
  // Inject custom styles for the drawer and its contents
  function injectDrawerStyles() {
    if (document.getElementById('mp-test-drawer-style')) return;
    const style = document.createElement('style');
    style.id = 'mp-test-drawer-style';
    style.textContent = `
      .mp-test-drawer-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.30); z-index: 99998; transition: opacity 0.3s;
      }
      .mp-test-drawer {
        position: fixed; top: 0; right: 0; width: 400px; height: 100vh; background: #fff;
        box-shadow: rgba(0,0,0,0.1) -2px 0px 5px; z-index: 99999;
        display: flex; flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      .mp-drawer-open { transform: translateX(0); }
      .mp-drawer-closed { transform: translateX(100%); }
      .mp-test-drawer-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px 10px 18px; border-bottom: 1px solid #e5e7eb;
        position: relative;
      }
      .mp-test-drawer-logo-title { display: flex; align-items: center; gap: 6px; }
      .mp-test-drawer-logo { width: 36px; height: 36px; border-radius: 6px; }
      .mp-test-drawer-title { font-size: 2rem; font-weight: 700; color:mp-test-drawer-desc #22223b; letter-spacing: -0.5px; }
      .mp-test-drawer-close {
        background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px;
        position: absolute; top: 12px; right: 12px; z-index: 2;
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .mp-test-drawer-close:hover {
        background: #f3f4f6;
      }
      .mp-test-drawer-close svg {
        width: 22px; height: 22px; color: #222;
      }
      .mp-test-drawer-main {
        flex: 1; overflow-y: auto; padding: 18px 18px 12px 18px; display: flex; flex-direction: column; gap: 18px;
      }
      .mp-test-drawer-section-title { font-size: 1.55rem; font-weight: 700; color: #22223b; margin-bottom: 4px; }
      .mp-test-drawer-desc { font-size: 1.15rem; color: #555; margin-bottom: 0; }
      .mp-test-drawer-label { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 6px; }
      .mp-test-drawer-textarea {
        width: 100%; border: 1px solid #d1d5db; border-radius: 8px; padding: 16px 14px; font-size: 1rem;
        min-height: 140px; resize: vertical; margin-bottom: 0;
        font-family: inherit; background: #fafbfc;
        transition: border-color 0.2s;
      }
      .mp-test-drawer-textarea:focus { outline: none; border-color: #2563eb; background: #fff; }
      .mp-test-drawer-btn-row { display: flex; gap: 12px; margin-top: 6px; }
      .mp-test-drawer-btn {
        flex: 1; font-size: 1rem; font-weight: 600; border-radius: 7px;
        padding: 10px 0; cursor: pointer; transition: background 0.2s, color 0.2s, border 0.2s, box-shadow 0.2s;
      }
      .mp-test-drawer-btn-primary {
        background: #101112; color: #fff; border: none;
      }
      .mp-test-drawer-btn-primary:hover { background: #232325; }
      .mp-test-drawer-btn-secondary {
        background: transparent; color: #22223b; border: 1px solid #dfdfdf; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      }
      .mp-test-drawer-btn-secondary:hover {
        background: #f6f6f7; border-color: #bdbdbd;
      }
      .mp-test-drawer-output-section { margin-top: 18px; }
      .mp-test-drawer-output-label { font-size: 1.15rem; font-weight: 500; color: #333; margin-bottom: 6px; }
      .mp-test-drawer-output {
        width: 100%; min-height: 48px; background: #f8fafc; border: 1px solid #e5e7eb; border-radius: 8px;
        padding: 10px 12px; font-size: 1rem; color: #22223b; word-break: break-word;
      }
      .mp-test-drawer-use-btn {
        margin-top: 12px; background: #22c55e; color: #fff; font-weight: 600; border: none; border-radius: 7px;
        padding: 10px 0; width: 100%; font-size: 1rem; cursor: pointer; box-shadow: 0 1px 2px rgba(34,197,94,0.08);
        transition: background 0.2s;
      }
      .mp-test-drawer-use-btn:hover { background: #16a34a; }
      .mp-test-drawer-success-msg {
        margin-top: 8px; color: #22c55e; font-size: 0.98rem; font-weight: 500; display: none;
        text-align: center;
      }
      .mp-test-drawer-success-msg.active { display: block; }
      .mp-test-spinner {
        display: inline-block;
        vertical-align: middle;
        width: 18px; height: 18px;
        border: 2.5px solid #fff;
        border-right-color: transparent;
        border-radius: 50%;
        animation: mp-spin 0.7s linear infinite;
      }
      @keyframes mp-spin {
        100% { transform: rotate(360deg); }
      }
    `;
    document.head.appendChild(style);
  }

  // Utility: Create and show drawer
  function showTestCommentDrawer(post, postContent, onGenerate) {
    injectDrawerStyles();
    // Remove any existing drawer
    const existing = document.getElementById("mp-test-comment-drawer");
    if (existing) existing.remove();
    const overlay = document.getElementById("mp-test-comment-overlay");
    if (overlay) overlay.remove();

    // Find main LinkedIn feed container
    let parent = document.querySelector('div.feed-outlet, main, #main, body');
    if (!parent) parent = document.body;

    // Overlay
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "mp-test-comment-overlay";
    overlayDiv.className = "mp-test-drawer-overlay";
    overlayDiv.onclick = closeDrawer;
    parent.appendChild(overlayDiv);

    // Drawer
    const drawer = document.createElement("div");
    drawer.id = "mp-test-comment-drawer";
    drawer.className = "mp-test-drawer mp-drawer-closed";

    // Header
    const header = document.createElement("div");
    header.className = "mp-test-drawer-header";
    // Logo and title
    const logoTitle = document.createElement("div");
    logoTitle.className = "mp-test-drawer-logo-title";
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("assets/logo_48.png");
    logo.alt = "ManagePlus Logo";
    logo.className = "mp-test-drawer-logo";
    const title = document.createElement("span");
    title.textContent = "ManagePlus";
    title.className = "mp-test-drawer-title";
    logoTitle.appendChild(logo);
    logoTitle.appendChild(title);
    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6L14 14M14 6L6 14" stroke="#222" stroke-width="2" stroke-linecap="round"/></svg>`;
    closeBtn.className = "mp-test-drawer-close";
    closeBtn.onclick = closeDrawer;
    header.appendChild(logoTitle);
    header.appendChild(closeBtn);
    drawer.appendChild(header);

    // Main content
    const main = document.createElement("div");
    main.className = "mp-test-drawer-main";

    // Section: Title and description
    const sectionTitle = document.createElement("div");
    sectionTitle.className = "";
    const mainTitle = document.createElement("h2");
    mainTitle.textContent = "Generate Comment through AI";
    mainTitle.className = "mp-test-drawer-section-title";
    const desc = document.createElement("p");
    desc.textContent = "Use AI to generate a professional, relevant comment for this LinkedIn post. Optionally, save your favorite prompt for future use.";
    desc.className = "mp-test-drawer-desc";
    sectionTitle.appendChild(mainTitle);
    sectionTitle.appendChild(desc);
    main.appendChild(sectionTitle);

    // Section: Prompt input
    const promptSection = document.createElement("div");
    promptSection.className = "";
    const promptLabel = document.createElement("label");
    promptLabel.textContent = "Prompt";
    promptLabel.className = "mp-test-drawer-label";
    const promptInput = document.createElement("textarea");
    promptInput.className = "mp-test-drawer-textarea";
    promptInput.placeholder = "Type your prompt for the comment...";
    // Prefill from localStorage if available
    chrome.storage.local.get(["userPrompt"], ({ userPrompt }) => {
      if (userPrompt) promptInput.value = userPrompt;
    });
    promptSection.appendChild(promptLabel);
    promptSection.appendChild(promptInput);
    main.appendChild(promptSection);

    // Section: Buttons
    const btnRow = document.createElement("div");
    btnRow.className = "mp-test-drawer-btn-row";
    const generateBtn = document.createElement("button");
    generateBtn.textContent = "Generate Comment";
    generateBtn.className = "mp-test-drawer-btn mp-test-drawer-btn-primary";
    generateBtn.type = "button";
    const savePromptBtn = document.createElement("button");
    savePromptBtn.textContent = "Save Prompt";
    savePromptBtn.className = "mp-test-drawer-btn mp-test-drawer-btn-secondary";
    savePromptBtn.type = "button";
    btnRow.appendChild(generateBtn);
    btnRow.appendChild(savePromptBtn);
    main.appendChild(btnRow);

    // Only disable generateBtn when loading; savePromptBtn always enabled (unless loading)
    let isLoading = false;
    function updatePromptButtons() {
      generateBtn.disabled = isLoading;
      savePromptBtn.disabled = isLoading;
    }
    promptInput.addEventListener('input', updatePromptButtons);
    // Initial state
    updatePromptButtons();

    // Notification utility (if not already available)


    // Section: Output
    const outputSection = document.createElement("div");
    outputSection.className = "mp-test-drawer-output-section";
    const outputLabel = document.createElement("div");
    outputLabel.textContent = "Generated Comment";
    outputLabel.className = "mp-test-drawer-output-label";
    const output = document.createElement("div");
    output.className = "mp-test-drawer-output";
    output.style.display = "none";
    // Use button
    const useBtn = document.createElement("button");
    useBtn.textContent = "Use This Comment";
    useBtn.className = "mp-test-drawer-use-btn hidden";
    // Success message
    const successMsg = document.createElement("div");
    successMsg.className = "mp-test-drawer-success-msg";
    successMsg.textContent = "Copied to clipboard!";
    // Add to output section
    outputSection.appendChild(outputLabel);
    outputSection.appendChild(output);
    outputSection.appendChild(useBtn);
    outputSection.appendChild(successMsg);
    main.appendChild(outputSection);

    // Hide output section initially
    outputSection.style.display = "none";

    // Button logic
    generateBtn.onclick = async () => {
      if (isLoading) return;
      isLoading = true;
      updatePromptButtons();
      output.style.display = "block";
      output.textContent = "Generating...";
      useBtn.classList.add("hidden");
      successMsg.classList.remove("active");
    
      // Insert note element before output, if it doesn't exist
      let noteEl = outputSection.querySelector(".mp-test-drawer-note");
      if (!noteEl) {
        noteEl = document.createElement("div");
        noteEl.className = "mp-test-drawer-note";
        noteEl.style.fontSize = "0.95rem";
        noteEl.style.color = "#d97706";
        noteEl.style.marginBottom = "8px";
        noteEl.style.display = "none";
        outputSection.insertBefore(noteEl, output);
      }
    
      const originalText = generateBtn.textContent;
      generateBtn.innerHTML = `<span class='mp-test-spinner' style='display:inline-block;vertical-align:middle;margin-right:8px;width:18px;height:18px;border:2.5px solid #fff;border-right-color:transparent;border-radius:50%;animation:mp-spin 0.7s linear infinite;'></span>Generating...`;
    
      try {
        const userPrompt = promptInput.value.trim() || "";
        let comment = await onGenerate(userPrompt);
        const isInvalid = !comment || comment === "NULL" || comment.includes("I can't generate a comment");

        if (typeof comment === 'string') {
          comment = comment.trim();
          if (comment.startsWith('"') && comment.endsWith('"')) {
            comment = comment.slice(1, -1).trim();
          }
        }
    
    
        if (isInvalid) {
          output.textContent = comment || "No comment generated.";
          noteEl.textContent = "Note: This comment may not be suitable or was skipped by AI due to context.";
          noteEl.style.display = "block";
          useBtn.classList.add("hidden");
        } else {
          output.textContent = comment;
          noteEl.style.display = "none";
          useBtn.classList.remove("hidden");
        }
    
        outputSection.style.display = "block";
      } catch (e) {
        output.textContent = "Error generating comment.";
        useBtn.classList.add("hidden");
        outputSection.style.display = "block";
      } finally {
        isLoading = false;
        generateBtn.innerHTML = originalText;
        updatePromptButtons();
      }
    };
    
    savePromptBtn.onclick = () => {
      const userPrompt = promptInput.value.trim() || "";
      chrome.storage.local.set({ userPrompt }, () => {
        savePromptBtn.textContent = "Saved!";
        savePromptBtn.classList.add("bg-green-100", "text-green-700");
        showNotification('Prompt saved successfully', 'success');
        setTimeout(() => {
          savePromptBtn.textContent = "Save Prompt";
          savePromptBtn.classList.remove("bg-green-100", "text-green-700");
        }, 1200);
      });
    };

    useBtn.onclick = () => {
      let comment = output.textContent;
      if (comment && comment.length > 0 && post) {
        // Remove leading and trailing double quotes if present (redundant, but safe)
        comment = comment.trim();
        if (comment.startsWith('"') && comment.endsWith('"')) {
          comment = comment.slice(1, -1).trim();
        }
        // Try to fill the comment box in the same post
        let input = null;
        // Try all selectors in order
        input = post.querySelector('div[contenteditable="true"][role="textbox"]')
          || post.querySelector('.comments-comment-box__form-contenteditable')
          || post.querySelector('.ql-editor');
        if (input) {
          // Set the value/content (simulate user input for React/LinkedIn)
          input.focus();
          // Remove all children and set text
          input.innerHTML = '';
          document.execCommand('insertText', false, comment);
          // Place cursor at end
          const range = document.createRange();
          range.selectNodeContents(input);
          range.collapse(false);
          const sel = window.getSelection();
          sel.removeAllRanges();
          sel.addRange(range);
          // Optionally trigger input event
          input.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
          // Fallback: copy to clipboard
          navigator.clipboard.writeText(comment);
          successMsg.classList.add("active");
          setTimeout(() => {
            successMsg.classList.remove("active");
          }, 1500);
        }
      }
    };

    // Drawer structure
    drawer.appendChild(main);
    parent.appendChild(drawer);

    // Animate in
    setTimeout(() => {
      drawer.classList.remove("mp-drawer-closed");
      drawer.classList.add("mp-drawer-open");
      overlayDiv.classList.remove("opacity-0");
    }, 10);

    // Close logic
    function closeDrawer() {
      drawer.classList.remove("mp-drawer-open");
      drawer.classList.add("mp-drawer-closed");
      overlayDiv.classList.add("opacity-0");
      setTimeout(() => {
        if (drawer.parentNode) drawer.remove();
        if (overlayDiv.parentNode) overlayDiv.remove();
      }, 300);
    }
  }

  // Utility: Inject Test Comment button into the post's action bar
  function injectTestCommentButton(post, postContent) {
    // Prevent duplicate buttons in the comment box
    const commentForm = post.querySelector('form.comments-comment-box__form');
    if (!commentForm || commentForm.querySelector('.mp-test-comment-btn')) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'mp-test-comment-btn flex items-center justify-center';
    btn.style.background = 'rgb(16, 17, 18)';
    btn.style.color = 'rgb(255, 255, 255)';
    btn.style.fontWeight = '400';
    btn.style.fontSize = '10px';
    btn.style.border = 'none';
    btn.style.borderRadius = '7px';
    btn.style.padding = '0px 6px 4px 2px';
    btn.style.marginTop = '5px';
    btn.style.marginRight = '8px';
    btn.style.height = '30px';
    btn.style.marginLeft = '6px';
    btn.style.display = 'flex';
    btn.style.alignItems = 'center';
    btn.style.justifyContent = 'center';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background 0.18s';
    btn.title = 'AI Comment';
    btn.onmouseenter = () => { btn.style.background = 'rgb(35, 35, 37)'; };
    btn.onmouseleave = () => { btn.style.background = 'rgb(16, 17, 18)'; };
    btn.innerHTML = `
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="margin-right:7px;"><circle cx="12" cy="12" r="10" fill="white" fill-opacity="0.18"/><path d="M9.5 10.5C9.5 9.11929 10.6193 8 12 8C13.3807 8 14.5 9.11929 14.5 10.5C14.5 11.8807 13.3807 13 12 13C10.6193 13 9.5 11.8807 9.5 10.5Z" fill="white"/><rect x="11" y="14" width="2" height="4" rx="1" fill="white"/></svg>
      <span style="font-weight:500;font-size:12px;color:#fff;">AI Comment</span>
    `;
    btn.onclick = (e) => {
      e.stopPropagation();
      showTestCommentDrawer(post, postContent, async (userPrompt) => {
        return await generateGPTComment(postContent, userPrompt);
      });
    };

    // Find the action row: .display-flex.justify-space-between > .display-flex (first child)
    const justifyRow = commentForm.querySelector('.display-flex.justify-space-between');
    if (justifyRow && justifyRow.children.length > 0) {
      const iconRow = justifyRow.querySelector('.display-flex');
      if (iconRow && !iconRow.querySelector('.mp-test-comment-btn')) {
        iconRow.appendChild(btn);
        return;
      }
    }
    // Fallback: append to form
    commentForm.appendChild(btn);
  }

  // Extract post content utility (simple version)
  function extractPostContent(post) {
    // Try common LinkedIn post content selectors
    const contentElement =
      post.querySelector('.update-components-update-v2__commentary') ||
      post.querySelector('.update-components-text');
    if (contentElement) {
      return contentElement.textContent.trim();
    }
    return post.textContent.trim();
  }

  // Call API to generate comment (self-contained, similar to generateGPTComment)
  async function generateGPTComment(postContent, fallbackUserPrompt) {
    // Always fetch latest userPrompt and commentLength from storage
    const storage = await new Promise(resolve => {
      chrome.storage.local.get(['userPrompt', 'commentLength'], resolve);
    });
    const userPrompt = (fallbackUserPrompt && fallbackUserPrompt.trim()) || '';
    const commentLength = storage.commentLength || 30;
    const model = 'llama3.1:latest';
    const finalSystemPrompt = [
      defaultStartPrompt.trim(),
      userPrompt,
      defaultEndPrompt.trim(),
    ].join("\n");
    const systemPrompt = finalSystemPrompt.replace("{{MAX_WORDS}}", commentLength);
    const body = JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Generate comment for post: "${postContent}"` },
      ],
      options: {
        max_token: MaxTokens[commentLength] || 256,
        repeat_penalty: 1.2,
      },
    });
    const serverUrl = `${APIURL}/ai/chat`;
    try {
      const res = await fetch(serverUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body,
      });
      const data = await res.json();
      if (data.error) return 'Error: ' + (data.error.message || 'API error');
      return data.data.data;
    } catch (e) {
      return 'Error generating comment.';
    }
  }

  // Main logic: only run if showtest is true
  chrome.storage.local.get(['showtest'], ({ showtest }) => {
    if (!showtest) return;
    // Wait for DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', run);
    } else {
      run();
    }
  });

  function run() {
    // Find all posts (same selector as main extension)
    const postSelector = '.feed-shared-update-v2';
    const posts = document.querySelectorAll(postSelector);
    posts.forEach(post => {
      const postContent = extractPostContent(post);
      injectTestCommentButton(post, postContent);
    });
    // Optionally, observe for new posts (infinite scroll)
    const feed = document.querySelector('div.feed-outlet, main, body');
    if (feed && window.MutationObserver) {
      const observer = new MutationObserver(() => {
        const posts = document.querySelectorAll(postSelector);
        posts.forEach(post => {
          if (!post.querySelector('.mp-test-comment-btn')) {
            const postContent = extractPostContent(post);
            injectTestCommentButton(post, postContent);
          }
        });
      });
      observer.observe(feed, { childList: true, subtree: true });
    }
  }
})(); 