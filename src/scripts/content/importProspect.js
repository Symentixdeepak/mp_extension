// Import Prospect Button & Drawer Content Script (self-contained)

const { getPosterName, getPosterProfile } = require("../../utils/utils");
const { showNotification } = require("../../utils/notification");
const { APIURL } = require("../../utils/constant");

(function () {
  // Inject custom styles for the drawer and its contents (copied from testComment.js, with unique IDs/classes)
  function injectDrawerStyles() {
    if (document.getElementById("mp-import-drawer-style")) return;
    const style = document.createElement("style");
    style.id = "mp-import-drawer-style";
    style.textContent = `
      .mp-import-drawer-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.30); z-index: 99998; transition: opacity 0.3s;
      }
      .mp-import-drawer {
        position: fixed; top: 0; right: 0; width: 400px; height: 100vh; background: #fff;
        box-shadow: rgba(0,0,0,0.1) -2px 0px 5px; z-index: 99999;
        display: flex; flex-direction: column;
        transform: translateX(100%);
        transition: transform 0.3s cubic-bezier(0.4,0,0.2,1);
      }
      .mp-import-drawer-open { transform: translateX(0); }
      .mp-import-drawer-closed { transform: translateX(100%); }
      .mp-import-drawer-header {
        display: flex; align-items: center; justify-content: space-between;
        padding: 14px 18px 10px 18px; border-bottom: 1px solid #e5e7eb;
        position: relative;
      }
      .mp-import-drawer-logo-title { display: flex; align-items: center; gap: 6px; }
      .mp-import-drawer-logo { width: 36px; height: 36px; border-radius: 6px; }
      .mp-import-drawer-title { font-size: 2rem; font-weight: 700; color: #22223b; letter-spacing: -0.5px; }
      .mp-import-drawer-close {
        background: none; border: none; cursor: pointer; padding: 4px; border-radius: 4px;
        position: absolute; top: 12px; right: 12px; z-index: 2;
        width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;
        transition: background 0.15s;
      }
      .mp-import-drawer-close:hover {
        background: #f3f4f6;
      }
      .mp-import-drawer-close svg {
        width: 22px; height: 22px; color: #222;
      }
      .mp-import-drawer-main {
        flex: 1; overflow-y: auto; padding: 18px 18px 12px 18px; display: flex; flex-direction: column; gap: 18px;
      }
      .mp-import-drawer-section-title { font-size: 1.55rem; font-weight: 700; color: #22223b; margin-bottom: 4px; }
      .mp-import-drawer-desc { font-size: 1.15rem; color: #555; margin-bottom: 0; }
      .mp-import-drawer-label { font-size: 14px; font-weight: 700; color: #333; margin-bottom: 6px; margin-top: -5px; }
      .mp-import-drawer-btn-row { display: flex; gap: 12px; margin-top: 6px; }
      .mp-import-drawer-btn {
        flex: 1; font-size: 1rem; font-weight: 600; border-radius: 7px;
        padding: 10px 0; cursor: pointer; transition: background 0.2s, color 0.2s, border 0.2s, box-shadow 0.2s;
      }
      .mp-import-drawer-btn-primary {
        background: #101112; color: #fff; border: none;
      }
      .mp-import-drawer-btn-primary:hover { background: #232325; }
      .mp-import-drawer-btn-secondary {
        background: transparent; color: #22223b; border: 1px solid #dfdfdf; box-shadow: 0 1px 3px rgba(0,0,0,0.04);
      }
      .mp-import-drawer-btn-secondary:hover {
        background: #f6f6f7; border-color: #bdbdbd;
      }
      .mp-import-drawer-success-msg {
        margin-top: 8px; color: #22c55e; font-size: 0.98rem; font-weight: 500; display: none;
        text-align: center;
      }
      .mp-import-drawer-success-msg.active { display: block; }
      .mp-import-spinner {
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
      .mp-import-user-info { display: flex; align-items: center; gap: 14px; margin-bottom: 10px; }
      .mp-import-user-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #f3f4f6; }
      .mp-import-user-meta { display: flex; flex-direction: column; gap: 2px; }
      .mp-import-user-name { font-size: 1.5rem; font-weight: 600; color: #22223b; }
      .mp-import-user-desc { font-size: 1rem; color: #555; }
    `;
    document.head.appendChild(style);
  }

  // Utility: Extract avatar, name, info, job title, summary from post
  function extractUserInfo(post) {
    // Name
    const name = getPosterName(post);
    // Profile link
    const profile = getPosterProfile(post);
    // Avatar: try to find img in actor area, fallback to placeholder
    let avatar = "";
    const actorMeta = post.querySelector(".update-components-actor__avatar");
    if (actorMeta) {
      const img = actorMeta.querySelector("img");
      if (img && img.src) avatar = img.src;
    }
    if (!avatar && name) {
      avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
    }
    // Info: try to get sub-description text
    let info = "";
    const subDesc = post.querySelector(
      ".update-components-actor__sub-description"
    );
    if (subDesc) info = subDesc.textContent.trim();
    // Job title: try to get from actor__description or similar
    let current_job_title = "";
    const desc = post.querySelector(".update-components-actor__description");
    if (desc) current_job_title = desc.textContent.trim();
    // Summary: try to get from post content
    let summary = "";
    const summaryEl = post.querySelector(
      ".update-components-update-v2__commentary, .update-components-text"
    );
    if (summaryEl) summary = summaryEl.textContent.trim();
    // Parse name into first/last
    let first_name = "",
      last_name = "";
    if (name) {
      const parts = name.split(" ");
      first_name = parts[0] || "";
      last_name = parts.slice(1).join(" ") || "";
    }
    return {
      name,
      profile,
      avatar,
      info,
      current_job_title,
      summary,
      first_name,
      last_name,
    };
  }

  // Utility: Show the drawer
  function showImportDrawer(post) {
    injectDrawerStyles();
    // Remove any existing drawer
    const existing = document.getElementById("mp-import-drawer");
    if (existing) existing.remove();
    const overlay = document.getElementById("mp-import-overlay");
    if (overlay) overlay.remove();

    // Find main LinkedIn feed container
    let parent = document.querySelector("div.feed-outlet, main, #main, body");
    if (!parent) parent = document.body;

    // Overlay
    const overlayDiv = document.createElement("div");
    overlayDiv.id = "mp-import-overlay";
    overlayDiv.className = "mp-import-drawer-overlay";
    overlayDiv.onclick = closeDrawer;
    parent.appendChild(overlayDiv);

    // Drawer
    const drawer = document.createElement("div");
    drawer.id = "mp-import-drawer";
    drawer.className = "mp-import-drawer mp-import-drawer-closed";

    // Header
    const header = document.createElement("div");
    header.className = "mp-import-drawer-header";
    // Logo and title
    const logoTitle = document.createElement("div");
    logoTitle.className = "mp-import-drawer-logo-title";
    const logo = document.createElement("img");
    logo.src = chrome.runtime.getURL("assets/logo_48.png");
    logo.alt = "ManagePlus Logo";
    logo.className = "mp-import-drawer-logo";
    const title = document.createElement("span");
    title.textContent = "Import Prospect";
    title.className = "mp-import-drawer-title";
    logoTitle.appendChild(logo);
    logoTitle.appendChild(title);
    // Close button
    const closeBtn = document.createElement("button");
    closeBtn.innerHTML = `<svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M6 6L14 14M14 6L6 14" stroke="#222" stroke-width="2" stroke-linecap="round"/></svg>`;
    closeBtn.className = "mp-import-drawer-close";
    closeBtn.onclick = closeDrawer;
    header.appendChild(logoTitle);
    header.appendChild(closeBtn);
    drawer.appendChild(header);

    // Main content
    const main = document.createElement("div");
    main.className = "mp-import-drawer-main";

    // Section: User info
    // Use the passed object directly if it has a 'name' property, otherwise extract from DOM
    const userInfo = (post && typeof post === 'object' && post.name)
      ? post
      : extractUserInfo(post);
    const userInfoDiv = document.createElement("div");
    userInfoDiv.className = "mp-import-user-info";
    const avatarImg = document.createElement("img");
    avatarImg.className = "mp-import-user-avatar";
    avatarImg.src = userInfo.avatar;
    avatarImg.alt = userInfo.name || "Avatar";
    avatarImg.onerror = () => {
      avatarImg.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
        userInfo.name || "User"
      )}`;
    };
    const metaDiv = document.createElement("div");
    metaDiv.className = "mp-import-user-meta";
    const nameDiv = document.createElement("div");
    nameDiv.className = "mp-import-user-name";
    nameDiv.textContent = userInfo.name;
    const infoDiv = document.createElement("div");
    infoDiv.className = "mp-import-user-desc";
    infoDiv.textContent = userInfo.info;
    metaDiv.appendChild(nameDiv);
    // metaDiv.appendChild(infoDiv);
    userInfoDiv.appendChild(avatarImg);
    userInfoDiv.appendChild(metaDiv);
    main.appendChild(userInfoDiv);

    // Section: Board select
    const boardSection = document.createElement("div");
    boardSection.className = "";
    const boardLabel = document.createElement("label");
    boardLabel.textContent = "Board";
    boardLabel.className = "mp-import-drawer-label";
    const boardSelect = document.createElement("select");
    boardSelect.className = "mp-import-drawer-textarea";
    boardSection.appendChild(boardLabel);
    boardSection.appendChild(boardSelect);
    main.appendChild(boardSection);

    // Section: Contact Type select
    const contactTypeSection = document.createElement("div");
    contactTypeSection.className = "";
    const contactTypeLabel = document.createElement("label");
    contactTypeLabel.textContent = "Contact Type";
    contactTypeLabel.className = "mp-import-drawer-label";
    const contactTypeSelect = document.createElement("select");
    contactTypeSelect.className = "mp-import-drawer-textarea";
    contactTypeSection.appendChild(contactTypeLabel);
    contactTypeSection.appendChild(contactTypeSelect);
    main.appendChild(contactTypeSection);

    // Section: List select
    const listSection = document.createElement("div");
    listSection.className = "";
    // --- List label and Create List button in a flex row ---
    const listLabelRow = document.createElement("div");
    listLabelRow.style.display = "flex";
    listLabelRow.style.justifyContent = "space-between";
    listLabelRow.style.alignItems = "center";
    // List label
    const listLabel = document.createElement("label");
    listLabel.textContent = "List";
    listLabel.className = "mp-import-drawer-label";
    // Create List button (black style)
    const createListBtn = document.createElement("button");
    createListBtn.textContent = "Create List";
    createListBtn.type = "button";
    createListBtn.style.border = "none";
    createListBtn.style.color = "#101112";
    createListBtn.style.borderRadius = "7px";
    // createListBtn.style.padding = '4px 12px';
    createListBtn.style.fontSize = "13px";
    createListBtn.style.height = "32px";
    createListBtn.style.marginTop = "0px";
    createListBtn.style.marginLeft = "8px";
    createListBtn.style.cursor = "pointer";

    listLabelRow.appendChild(listLabel);
    listLabelRow.appendChild(createListBtn);
    listSection.appendChild(listLabelRow);
    // List select
    const listSelect = document.createElement("select");
    listSelect.className = "mp-import-drawer-textarea";
    listSection.appendChild(listSelect);

    // Import button
    const btnRow = document.createElement("div");
    btnRow.className = "mp-import-drawer-btn-row";
    const importBtn = document.createElement("button");
    importBtn.textContent = "Import";
    importBtn.className = "mp-import-drawer-btn mp-import-drawer-btn-primary";
    importBtn.type = "button";
    btnRow.appendChild(importBtn);
    main.appendChild(listSection);
    main.appendChild(btnRow);

    // Success message
    const successMsg = document.createElement("div");
    successMsg.className = "mp-import-drawer-success-msg";
    successMsg.textContent = "Imported successfully!";
    main.appendChild(successMsg);

    // Drawer structure
    drawer.appendChild(main);
    parent.appendChild(drawer);

    // Animate in
    setTimeout(() => {
      drawer.classList.remove("mp-import-drawer-closed");
      drawer.classList.add("mp-import-drawer-open");
      overlayDiv.classList.remove("opacity-0");
    }, 10);

    // Close logic
    function closeDrawer() {
      drawer.classList.remove("mp-import-drawer-open");
      drawer.classList.add("mp-import-drawer-closed");
      overlayDiv.classList.add("opacity-0");
      setTimeout(() => {
        if (drawer.parentNode) drawer.remove();
        if (overlayDiv.parentNode) overlayDiv.remove();
      }, 300);
    }

    // Helper to get token from background
    async function getTokenFromBackground() {
      return new Promise((resolve) => {
        chrome.runtime.sendMessage({ type: "GET_TOKEN" }, (response) => {
          if (response && response.token) {
            resolve(response.token);
          } else {
            resolve(null);
          }
        });
      });
    }

    // --- Login required message logic ---
    let loginMsgDiv = null;
    function showLoginRequired() {
      // Hide all main inputs
      boardSection.style.display = "none";
      contactTypeSection.style.display = "none";
      listSection.style.display = "none";
      btnRow.style.display = "none";
      if (!loginMsgDiv) {
        loginMsgDiv = document.createElement("div");
        loginMsgDiv.style.margin = "32px 0 0 0";
        loginMsgDiv.style.background = "#fff";
        loginMsgDiv.style.border = "1px solid #e5e7eb";
        loginMsgDiv.style.borderRadius = "8px";
        loginMsgDiv.style.padding = "24px 18px";
        loginMsgDiv.style.textAlign = "center";
        loginMsgDiv.innerHTML = `
          <div style="font-size:1.25rem;font-weight:700;margin-bottom:10px;">Login required</div>
          <div style="font-size:1rem;color:#666;font-weight:400;margin-bottom:18px;">To import this prospect you need to login to our platform ManagePlus.</div>
          <button id="mp-import-login-btn" style="background:#101112;color:#fff;font-weight:600;padding:10px 24px;border:none;border-radius:7px;cursor:pointer;font-size:1rem;">Login to ManagePlus</button>
        `;
        main.appendChild(loginMsgDiv);
        loginMsgDiv.querySelector("#mp-import-login-btn").onclick =
          function () {
            const { WEBURL } = require("../../utils/constant");
            window.open(WEBURL, "_blank");
          };
      } else {
        loginMsgDiv.style.display = "";
      }
    }
    function hideLoginRequired() {
      boardSection.style.display = "";
      contactTypeSection.style.display = "";
      listSection.style.display = "";
      btnRow.style.display = "";
      if (loginMsgDiv) loginMsgDiv.style.display = "none";
    }

    // Fetch boards, contact types, and lists (popup.js style)
    async function fetchBoardsAndPopulate() {
      const token = await getTokenFromBackground();
      if (!token) {
        showLoginRequired();
        return;
      } else {
        hideLoginRequired();
      }
      console.log("[ImportProspect] Got token from GET_TOKEN:", token);
      chrome.runtime.sendMessage(
        { action: "FETCH_BOARDS_BG", token },
        (boards) => {
          console.log("[ImportProspect] FETCH_BOARDS_BG response:", boards);
          if (!boards || !boards.success) {
            boardSelect.innerHTML = `<option value=\"\">No boards found</option>`;
            return;
          }
          if (
            typeof require("../../utils/utils").populateBoards === "function"
          ) {
            require("../../utils/utils").populateBoards(
              boardSelect,
              boards.data
            );
          }
          // Fetch contact types and lists for the first board
          if (boardSelect.value) {
            fetchContactTypesAndLists(token, boardSelect.value);
          }
        }
      );
    }
    async function fetchContactTypesAndLists(token, boardId) {
      console.log("[ImportProspect] Sending FETCH_CONTACT_TYPES_BG", {
        token,
        boardId,
      });
      chrome.runtime.sendMessage(
        { action: "FETCH_CONTACT_TYPES_BG", token, businessId: boardId },
        (data) => {
          console.log(
            "[ImportProspect] FETCH_CONTACT_TYPES_BG response:",
            data
          );
          if (
            typeof require("../../utils/utils").populateContactType ===
            "function"
          ) {
            require("../../utils/utils").populateContactType(
              contactTypeSelect,
              data.data
            );
          }
        }
      );
      console.log("[ImportProspect] Sending FETCH_SEGMENT_LIST_BG", {
        token,
        boardId,
      });
      chrome.runtime.sendMessage(
        { action: "FETCH_SEGMENT_LIST_BG", token, businessId: boardId },
        (data) => {
          console.log("[ImportProspect] FETCH_SEGMENT_LIST_BG response:", data);
          if (
            typeof require("../../utils/utils").populateListType === "function"
          ) {
            require("../../utils/utils").populateListType(
              listSelect,
              data.data
            );
          }
        }
      );
    }
    boardSelect.addEventListener("change", async () => {
      const token = await getTokenFromBackground();
      fetchContactTypesAndLists(token, boardSelect.value);
    });
    fetchBoardsAndPopulate();

    // --- Create List Form Logic ---
    let createListForm = null;
    createListBtn.onclick = async function () {
      if (createListForm) return; // Prevent multiple forms
      // Hide label+button row and select, disable import
      listLabelRow.style.display = "none";
      listSelect.style.display = "none";
      createListForm = document.createElement("div");
      createListForm.className = "mp-import-create-list-form";
      createListForm.style.marginTop = "10px";
      createListForm.style.background = "#f9f9f9";
      createListForm.style.padding = "14px";
      createListForm.style.borderRadius = "8px";
      createListForm.style.border = "1px solid #e5e7eb";
      createListForm.innerHTML = `
        <div style="margin-bottom:8px;font-weight:600;">Create New List</div>
        <div style="margin-bottom:8px;">
          <input type="text" id="mp-import-new-list-name" placeholder="List Name" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid #ccc;" />
        </div>
        <div style="margin-bottom:8px;">
          <textarea id="mp-import-new-list-prompt" rows="3" placeholder="Engagement Prompt (optional)" style="width:100%;padding:7px 10px;border-radius:6px;border:1px solid #ccc;"></textarea>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end;">
          <button type="button" id="mp-import-cancel-list-btn" class="mp-import-drawer-btn mp-import-drawer-btn-secondary">Cancel</button>
          <button type="button" id="mp-import-save-list-btn" class="mp-import-drawer-btn mp-import-drawer-btn-primary">Save</button>
        </div>
        <div id="mp-import-create-list-error" style="color:#e11d48;font-size:13px;margin-top:6px;display:none;"></div>
      `;
      listSection.appendChild(createListForm);
      // Cancel logic
      createListForm.querySelector("#mp-import-cancel-list-btn").onclick =
        function () {
          createListForm.remove();
          createListForm = null;
          listLabelRow.style.display = "flex";
          listSelect.style.display = "";
        };
      // Save logic
      createListForm.querySelector("#mp-import-save-list-btn").onclick =
        async function () {
          const saveBtn = createListForm.querySelector(
            "#mp-import-save-list-btn"
          );
          saveBtn.disabled = true;
          const originalText = saveBtn.textContent;
          saveBtn.innerHTML = `<span class='mp-import-spinner' style='display:inline-block;vertical-align:middle;margin-right:8px;width:18px;height:18px;border:2.5px solid #fff;border-right-color:transparent;border-radius:50%;animation:mp-spin 0.7s linear infinite;'></span>Saving...`;
          const name = createListForm
            .querySelector("#mp-import-new-list-name")
            .value.trim();
          const prompt = createListForm
            .querySelector("#mp-import-new-list-prompt")
            .value.trim();
          const errorDiv = createListForm.querySelector(
            "#mp-import-create-list-error"
          );
          errorDiv.style.display = "none";
          errorDiv.textContent = "";
          if (!name) {
            errorDiv.textContent = "List Name is required.";
            errorDiv.style.display = "block";
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            return;
          }
          const token = await getTokenFromBackground();
          if (!token) {
            errorDiv.textContent =
              "Authentication failed. Please log in again.";
            errorDiv.style.display = "block";
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            return;
          }
          if (!boardSelect.value) {
            errorDiv.textContent = "Please select a board.";
            errorDiv.style.display = "block";
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
            return;
          }
          // Use APIURL from constants
          const { APIURL, DEFAULT_SETTINGS } = require("../../utils/constant");
          const payload = {
            name: name,
            type: 1,
            archive_date: new Date().toISOString(),
            engagement_prompt: prompt
              ? prompt
              : DEFAULT_SETTINGS
              ? DEFAULT_SETTINGS.userPrompt
              : "",
          };
          try {
            const response = await fetch(`${APIURL}/segmentation`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
                "b-id": boardSelect.value,
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
              saveBtn.disabled = false;
              saveBtn.textContent = originalText;
              return;
            }
            // Success: refresh list select
            createListForm.remove();
            createListForm = null;
            listLabelRow.style.display = "flex";
            listSelect.style.display = "";
            // Refresh lists and select the new one
            await fetchContactTypesAndLists(token, boardSelect.value);
            setTimeout(() => {
              // Try to select the new list by name
              for (let i = 0; i < listSelect.options.length; i++) {
                if (listSelect.options[i].textContent === name) {
                  listSelect.selectedIndex = i;
                  break;
                }
              }
            }, 500);
          } catch (error) {
            errorDiv.textContent =
              "Failed to create list due to a network or unexpected error.";
            errorDiv.style.display = "block";
            saveBtn.disabled = false;
            saveBtn.textContent = originalText;
          }
        };
    };

    // Import button logic
    importBtn.onclick = async () => {
      const authToken = await getTokenFromBackground();
      if (!authToken) {
        showNotification("Failed to get auth token", "error");
        return;
      }

      if (!boardSelect.value) {
        showNotification("Please select a board.", "error");
        return;
      }
      if (!contactTypeSelect.value) {
        showNotification("Please select a contact type.", "error");
        return;
      }
      if (!listSelect.value) {
        showNotification("Please select a list.", "error");
        return;
      }
      importBtn.innerHTML = `<span class='mp-import-spinner'></span> Importing...`;
      // Prepare data for import (rows)
      const user = userInfo;
      const row = {
        first_name: user.first_name,
        last_name: user.last_name,
        current_job_title: null,
        summary: null,
        avatar: user.avatar,
        mp_customer_linkedin_profile: user.profile,
      };
      // Get auth token

      // Call background to import
      chrome.runtime.sendMessage(
        {
          action: "saveScrapedData",
          metadata: {
            prospects: [row],
            authToken,
            contact_type: contactTypeSelect.value,
            board: boardSelect.value,
            segment_list: listSelect.value,
          },
        },
        (result) => {
          importBtn.textContent = "Import";
          if (result && result.status === "success") {
            successMsg.classList.add("active");
            showNotification("Prospect imported successfully!", "success");
            setTimeout(() => {
              successMsg.classList.remove("active");
              closeDrawer();
            }, 1200);
          } else {
            showNotification(result?.error || "Import failed", "error");
          }
        }
      );
    };
  }

  // Utility: Inject Import Prospect button as a sibling below the sub-description area
  function injectImportButton(post) {
    const subDesc = post.querySelector(
      ".update-components-actor__sub-description"
    );
    if (!subDesc || subDesc.parentNode.querySelector(".mp-import-prospect-btn"))
      return;
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "mp-import-prospect-btn";
    btn.style.background = "#101112";
    btn.style.color = "#fff";
    btn.style.fontWeight = "400";
    btn.style.fontSize = "11px";
    btn.style.border = "none";
    btn.style.borderRadius = "7px";
    btn.style.padding = "4px 12px 6px 12px";
    btn.style.marginTop = "4px";
    btn.style.cursor = "pointer";
    btn.style.transition = "background 0.18s";
    btn.textContent = "Import Prospect";
    btn.onclick = (e) => {
      e.stopPropagation();
      showImportDrawer(post);
    };
    // Insert the button after the subDesc span
    if (subDesc.nextSibling) {
      subDesc.parentNode.insertBefore(btn, subDesc.nextSibling);
    } else {
      subDesc.parentNode.appendChild(btn);
    }
  }

  // --- PROFILE PAGE SUPPORT ---
  function extractProfileInfoFromCustomCard() {
    // Find the container with the name and link
    const card = document.querySelector('.ypwoaoNsuEsRQhEuYAVqNMLekgvYevJfkEk');
    if (!card) return null;
    // Name
    const nameTag = card.querySelector('h1');
    const name = nameTag ? nameTag.textContent.trim() : '';
    // Profile link
    const linkTag = card.querySelector('a[href*="/in/"]');
    let profile = '';
    if (linkTag) {
      const href = linkTag.getAttribute('href');
      profile = href.startsWith('http') ? href : `https://www.linkedin.com${href}`;
    }
    // Avatar
    let avatar = '';
    // Try to find the image in the main profile card area
    const avatarImg = document.querySelector('.pv-top-card-profile-picture__image, .mkbdwiuRcVliyZALZIeqEwdIrSCtmTOrPOA');
    if (avatarImg && avatarImg.src) avatar = avatarImg.src;
    if (!avatar && name) {
      avatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}`;
    }
    // First/Last name
    let first_name = '', last_name = '';
    if (name) {
      const parts = name.split(' ');
      first_name = parts[0] || '';
      last_name = parts.slice(1).join(' ') || '';
    }
    return {
      name,
      profile,
      avatar,
      info: '',
      current_job_title: '',
      summary: '',
      first_name,
      last_name,
    };
  }

  function injectProfileImportButtonInCustomDiv() {
    // Find the custom class div
    const customDiv = document.querySelector('.hAQynntdEFUsKEiwJQadisSUFbmMM');
    if (!customDiv) return;
    // Avoid duplicate
    if (customDiv.querySelector('#mp-profile-import-btn')) return;
    // Create wrapper div
    const wrapper = document.createElement('div');
    wrapper.style.marginTop = '0px';
    // Create button
    const btn = document.createElement('button');
    btn.id = 'mp-profile-import-btn';
    btn.type = 'button';
    btn.textContent = 'Import Prospect';
    btn.style.background = '#101112';
    btn.style.color = '#fff';
    btn.style.fontWeight = '500';
    btn.style.fontSize = '14px';
    btn.style.border = 'none';
    btn.style.borderRadius = '20px';
    btn.style.marginRight = '10px';
    btn.style.padding = '6px 12px 8px 12px';
    btn.style.cursor = 'pointer';
    btn.style.transition = 'background 0.18s';
    btn.onclick = (e) => {
      e.stopPropagation();
      const userInfo = extractProfileInfoFromCustomCard();
      if (!userInfo) return;
      showImportDrawer({
        querySelector: () => null,
        textContent: '',
        getAttribute: () => null,
        ...userInfo,
      });
    };
    wrapper.appendChild(btn);
    customDiv.appendChild(wrapper);
  }

  function waitForMoreActionsButtonAndInject(retries = 20) {
    // Try to find the main action button row (Connect/Message/More)
    let actionRow = document.querySelector('.pv-top-card-v2-ctas, .pvs-profile-actions, .artdeco-card .pvs-profile-actions');
    if (!actionRow) {
      // Fallback: try to find a row with both Connect/Message and More buttons
      const allRows = Array.from(document.querySelectorAll('div, section'));
      actionRow = allRows.find(row =>
        row.querySelector('button[aria-label="Connect"], button[aria-label="Message"]') &&
        row.querySelector('button[aria-label="More"], button[aria-label="More actions"]')
      );
    }
    if (!actionRow) {
      if (retries > 0) {
        setTimeout(() => waitForMoreActionsButtonAndInject(retries - 1), 500);
      } else {
        console.warn('Import Prospect: Action row not found.');
      }
      return;
    }
    // Now search for the More button only inside the action row
    let moreActionsBtn = actionRow.querySelector('button[aria-label="More actions"]')
      || actionRow.querySelector('button[aria-label="More"]')
      || Array.from(actionRow.querySelectorAll('button[aria-label]')).find(
        btn => btn.getAttribute('aria-label').toLowerCase().includes('more')
      );
    if (moreActionsBtn) {
      injectProfileImportButtonInCustomDiv();
      return;
    }
    if (retries > 0) {
      setTimeout(() => waitForMoreActionsButtonAndInject(retries - 1), 500);
    } else {
      console.warn('Import Prospect: More actions button not found in action row.');
    }
  }

  // Main logic: run on DOM ready and observe for new posts and navigation
  function run() {
    const postSelector = ".feed-shared-update-v2";
    const posts = document.querySelectorAll(postSelector);
    posts.forEach((post) => {
      injectImportButton(post);
    });
    // Profile page logic
    if (window.location.pathname.match(/^\/in\//)) {
      waitForMoreActionsButtonAndInject();
      injectProfileImportButtonInCustomDiv();
    }
    // Observe for new posts (infinite scroll) and navigation changes
    const feed = document.querySelector("div.feed-outlet, main, body");
    if (feed && window.MutationObserver) {
      let lastUrl = location.href;
      const observer = new MutationObserver(() => {
        // Re-inject on DOM changes
        const posts = document.querySelectorAll(postSelector);
        posts.forEach((post) => {
          injectImportButton(post);
        });
        // Profile page logic (SPA navigation)
        if (window.location.pathname.match(/^\/in\//)) {
          waitForMoreActionsButtonAndInject();
          injectProfileImportButtonInCustomDiv();
        }
        // Re-inject on navigation (SPA)
        if (location.href !== lastUrl) {
          lastUrl = location.href;
          setTimeout(() => {
            const posts = document.querySelectorAll(postSelector);
            posts.forEach((post) => {
              injectImportButton(post);
            });
            if (window.location.pathname.match(/^\/in\//)) {
              waitForMoreActionsButtonAndInject();
              injectProfileImportButtonInCustomDiv();
            }
          }, 300);
        }
      });
      observer.observe(feed, { childList: true, subtree: true });
    }
  }

  // Run on DOM ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }
})();
