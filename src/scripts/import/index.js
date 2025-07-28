function getActiveTabUrl(callback) {
  chrome.runtime.sendMessage({ action: "getActiveTabUrl" }, (response) => {
    if (response.url) {
      callback(response.url);
    } else {
      callback(null);
    }
  });
}

function currentDd(callback) {
  chrome.runtime.sendMessage({ action: "currentDd" }, (response) => {
    if (response) {
      callback(response);
    } else {
      callback(null);
    }
  });
}

// sec header
async function getSecChUaHeader() {
  if (navigator.userAgentData) {
    const brands = await navigator.userAgentData.getHighEntropyValues([
      "brands",
    ]);
    const secChUa = brands.brands
      .map((brand) => `"${brand.brand}";v="${brand.version}"`)
      .join(", ");
    return secChUa;
  } else {
    // Fallback for older browsers that do not support navigator.userAgentData
    const ua = navigator.userAgent;
    const isChromium = ua.includes("Chrome") || ua.includes("Chromium");
    const chromeVersionMatch =
      ua.match(/Chrome\/(\d+)/) || ua.match(/Chromium\/(\d+)/);
    const chromeVersion = chromeVersionMatch
      ? chromeVersionMatch[1]
      : "Unknown";

    return `"Chromium";v="${chromeVersion}", "Not;A=Brand";v="24", "Google Chrome";v="${chromeVersion}"`;
  }
}

function getXLiTrackHeader() {
  const clientVersion = "1.13.22412";
  const mpVersion = "1.13.22412";
  const osName = "web";
  const timezoneOffset = new Date().getTimezoneOffset() / -60;
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const deviceFormFactor = window.innerWidth <= 768 ? "MOBILE" : "DESKTOP";
  const mpName = "voyager-web";
  const displayDensity = window.devicePixelRatio || 1;
  const displayWidth = window.screen.width;
  const displayHeight = window.screen.height;

  return JSON.stringify({
    clientVersion,
    mpVersion,
    osName,
    timezoneOffset,
    timezone,
    deviceFormFactor,
    mpName,
    displayDensity,
    displayWidth,
    displayHeight,
  });
}

function getAcceptLanguage() {
  const languages = navigator.languages || [
    navigator.language || navigator.userLanguage || "en-US",
  ];
  return languages
    .map((lang, index) => `${lang};q=${(1 - index * 0.1).toFixed(1)}`)
    .join(", ");
}

function getSecChUaMobile() {
  return window.innerWidth <= 768 ? "?1" : "?0";
}

function getSecChUaPlatform() {
  return `"${navigator.platform}"`;
}

function getXLiLang() {
  const language = navigator.language || navigator.userLanguage || "en-US";
  return language.replace("-", "_");
}

//jession token
async function getCsrfToken() {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ action: "getCookie" }, (response) => {
      if (response.error) {
        reject(response.error);
        console.log({ dfdfd: response });
      } else {
        // Clean the CSRF token by removing extra quotes
        const rawCsrfToken = response.jsessionId;
        const cleanedCsrfToken = rawCsrfToken ? JSON.parse(rawCsrfToken) : null;
        console.log({ dfdf: rawCsrfToken, dfdaa: cleanedCsrfToken });
        resolve(cleanedCsrfToken);
      }
    });
  });
}

//get query parameter
function getQueryParam(url, param) {
  const urlParams = new URLSearchParams(new URL(url).search);
  return urlParams.get(param);
}

// Function to check if the current URL contains 'heroEntityKey'
function hasHeroEntityKey(url) {
  return !!getQueryParam(url, "heroEntityKey");
}

// Function to get keywords from the URL
function getKeywordsFromUrl(url) {
  return getQueryParam(url, "keywords");
}

function getHandle(linkedinProfileUrl) {
  const url = getLinkedinProfileUrl(linkedinProfileUrl);
  return url?.split("/in/")?.[1];
}

function getLinkedinProfileUrl(navigationUrl) {
  return navigationUrl?.split("?")?.[0];
}

// Helper: Parse LinkedIn search filters from URL and build queryParameters, and extract origin
function buildLinkedInQueryParametersFromUrl(tabUrl) {
  const url = new URL(tabUrl);
  const params = url.searchParams;
  // Map of LinkedIn filter keys to GraphQL keys
  const filterMap = {
    company: "company",
    connectionOf: "connectionOf",
    currentCompany: "currentCompany",
    firstName: "firstName",
    followerOf: "followerOf",
    geoUrn: "geoUrn",
    industry: "industry",
    keywords: "keywords",
    lastName: "lastName",
    network: "network",
    openToVolunteer: "openToVolunteer",
    pastCompany: "pastCompany",
    profileLanguage: "profileLanguage",
    schoolFilter: "schoolFilter",
    schoolFreetext: "schoolFreetext",
    serviceCategory: "serviceCategory",
    titleFreeText: "title",
    title: "title",
  };
  const queryParameters = [];
  for (const [param, gqlKey] of Object.entries(filterMap)) {
    let value = params.get(param);
    if (value) {
      // Try to parse JSON arrays, otherwise treat as single value
      let valuesArr = [];
      try {
        // Remove quotes if present
        if (value.startsWith("[") && value.endsWith("]")) {
          valuesArr = JSON.parse(value);
        } else if (value.startsWith('"') && value.endsWith('"')) {
          valuesArr = [value.slice(1, -1)];
        } else {
          valuesArr = [value];
        }
      } catch (e) {
        valuesArr = [value];
      }
      // Remove extra quotes from each value
      valuesArr = valuesArr.map((v) =>
        typeof v === "string" ? v.replace(/^"|"$/g, "") : v
      );
      // Special: keywords and schoolFreetext are not arrays in GraphQL
      if (gqlKey === "keywords" || gqlKey === "schoolFreetext") {
        queryParameters.push(
          `(key:${gqlKey},value:List(${encodeURIComponent(valuesArr[0])}))`
        );
      } else {
        queryParameters.push(
          `(key:${gqlKey},value:List(${valuesArr
            .map((v) => encodeURIComponent(v))
            .join(",")}))`
        );
      }
    }
  }
  // Always add resultType:PEOPLE
  queryParameters.push("(key:resultType,value:List(PEOPLE))");
  // Get origin from URL, fallback to 'SWITCH_SEARCH_VERTICAL'
  const origin = params.get("origin") || "SWITCH_SEARCH_VERTICAL";
  return { queryParameters, origin };
}

// Update searchPeople to use dynamic filters and origin
async function searchPeople(start, keywords, heroEntityKey, tabUrl) {
  console.log({ start, keywords, heroEntityKey });
  try {
    // Retrieve CSRF token
    const csrfCookie = await getCsrfToken();
    console.log({ csrfCookie });
    // Ensure CSRF token is available
    if (!csrfCookie) {
      throw new Error("CSRF token is not available.");
    }

    // Retrieve other headers
    const secChUaHeader = await getSecChUaHeader();
    const secChUaMobile = getSecChUaMobile();
    const secChUaPlatform = getSecChUaPlatform();
    const xLiLang = getXLiLang();
    const acceptLanguage = getAcceptLanguage();
    const xLiTrackHeader = getXLiTrackHeader();

    const baseUrl = "https://www.linkedin.com/voyager/api/graphql";

    // Build queryParameters and origin from URL
    const { queryParameters, origin } =
      buildLinkedInQueryParametersFromUrl(tabUrl);

    const keywordPart = keywords
      ? `keywords:${encodeURIComponent(keywords)},`
      : "";

    const query = `start:${start},origin:${origin},query:(${keywordPart}flagshipSearchIntent:SEARCH_SRP,queryParameters:List(${queryParameters.join(
      ","
    )}),includeFiltersInResponse:false)`;

    const apiUrl = `${baseUrl}?variables=(${query})&queryId=voyagerSearchDashClusters.a2b606e8c1f58b3cf72fb5d54a2a57e7`;
    console.log({ apiUrl });
    const referrerUrl = tabUrl;

    const res = await fetch(apiUrl, {
      headers: {
        accept: "application/vnd.linkedin.normalized+json+2.1",
        "accept-language": acceptLanguage,
        "csrf-token": csrfCookie, // Pass CSRF token
        priority: "u=1, i",
        "sec-ch-ua": secChUaHeader,
        "sec-ch-ua-mobile": secChUaMobile,
        "sec-ch-ua-platform": secChUaPlatform,
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
        "x-li-lang": xLiLang,
        "x-li-page-instance":
          "urn:li:page:d_flagship3_search_srp_people_load_more;ImndbNAqTdWD1riSxBLiKQ==",
        "x-li-pem-metadata": "Voyager - People SRP=search-results",
        "x-li-track": xLiTrackHeader,
        "x-restli-protocol-version": "2.0.0",
      },
      referrer: referrerUrl,
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "include",
    });

    const json = await res.json();
    const error = json.data.errors;
    if (error) {
      console.log("Error at searchs:", error);
      return null;
    }
    return json;
  } catch (error) {
    console.log("Error at search:", { error });
    return null;
  }
}

function getDelayRange(cas) {
  if (cas <= 10) return { times: 1, minDelay: 0, maxDelay: 0 };
  if (cas <= 20) return { times: 2, minDelay: 1500, maxDelay: 2500 };
  if (cas <= 50) return { times: 5, minDelay: 3500, maxDelay: 6000 };
  if (cas <= 100) return { times: 10, minDelay: 8500, maxDelay: 12000 };
  if (cas <= 200) return { times: 20, minDelay: 14000, maxDelay: 17000 };
  if (cas <= 300) return { times: 30, minDelay: 19000, maxDelay: 22000 };
  if (cas <= 500) return { times: 50, minDelay: 24000, maxDelay: 30000 };
  return { times: 100, minDelay: 30000, maxDelay: 35000 };
}

function getRandomDelay(minDelay, maxDelay) {
  return Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function checkIfStop() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["scrapeMetadata"], (result) => {
      resolve(
        result?.scrapeMetadata?.status === "stop" ||
          result?.scrapeMetadata?.status === "paused"
      );
    });
  });
}

// Listen for Pause/Resume Messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "stop") {
    chrome.storage.local.get(["scrapeMetadata"], (result) => {
      chrome.storage.local.set({
        scrapeMetadata: {
          status: "stop",
        },
      });
    });
    console.log("Pausing the scraping process...");
  }
});

// Save metadata at the start
function saveInitialMetadata(
  status,
  totalPages,
  contact_type,
  board,
  authToken,
  startPoint,
  times,
  dataProgress,
  keywords,
  heroEntityKey,
  segment_list
) {
  chrome.storage.local.set(
    {
      scrapeMetadata: {
        status: status,
        totalPages: totalPages,
        contact_type: contact_type,
        board: board,
        progress: dataProgress ? dataProgress : 0,
        authToken: authToken,
        startPoint: startPoint,
        times: times,
        keywords: keywords,
        heroEntityKey: heroEntityKey,
        segment_list: segment_list,
      },
    },
    () => {
      console.log("Initial metadata saved.");
    }
  );
}

// Update progress and check if scraping is finished
function updateProgressAndCheckIfFinished(
  progress,
  totalPages,
  times,
  apiCallsCompleted
) {
  chrome.storage.local.get(["scrapeMetadata"], (result) => {
    if (result?.scrapeMetadata) {
      let currentProgress = result.scrapeMetadata.progress || 0;
      let updatedProgress = currentProgress + progress;

      // Ensure that the progress does not exceed the total pages
      if (updatedProgress >= totalPages) {
        updatedProgress = totalPages;
      }

      let updatedMetadata = {
        ...result.scrapeMetadata,
        progress: updatedProgress,
      };

      // If API calls are done but progress is less than totalPages
      if (apiCallsCompleted >= times && updatedProgress < totalPages) {
        updatedProgress = totalPages; // Set progress to totalPages
        updatedMetadata = {
          ...updatedMetadata, // Use updatedMetadata here
          progress: updatedProgress,
          status: "finished", // Mark status as finished
        };
        console.log(
          "API calls completed but progress was less. Setting progress to totalPages."
        );
      }

      // Check if progress matches or exceeds totalPages
      if (updatedProgress >= totalPages) {
        updatedMetadata.status = "finished"; // Mark status as finished

        // Set status to 'end' after 3 seconds
        setTimeout(() => {
          chrome.storage.local.get(["scrapeMetadata"], (result) => {
            if (result?.scrapeMetadata?.status === "finished") {
              const finalMetadata = {
                status: "end",
              };

              // 1. Update status to "end"
              chrome.storage.local.set(
                { scrapeMetadata: finalMetadata },
                () => {
                  console.log("Status updated to 'end':", finalMetadata);

                  // 2. Clear all scrape-related data after a short delay (optional)
                  setTimeout(() => {
                    chrome.storage.local.remove(["scrapeMetadata"], () => {
                      console.log("Scrape data cleared successfully.");
                    });
                  }, 500); // Small delay to ensure status is updated first
                }
              );
            }
          });
        }, 1800); // 1.8 seconds delay
      }

      // Update metadata in storage
      chrome.storage.local.set({ scrapeMetadata: updatedMetadata }, () => {
        console.log("Progress updated:", updatedMetadata);

        if (updatedMetadata.status === "finished") {
          console.log("Scraping process finished.");
        }
      });
    }
  });
}

function removeOneZero(number) {
  return parseInt(number.toString().replace("0", ""), 10);
}

function saveScrapedDataBackground(
  data,
  authToken,
  contact_type,
  board,
  segment_list
) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        action: "saveScrapedData",
        metadata: {
          prospects: data,
          authToken,
          contact_type,
          board,
          segment_list,
        },
      },
      (response) => {
        if (response?.status === "success") {
          resolve(response);
        } else {
          reject(response?.error || "Unknown error");
        }
      }
    );
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "paused") {
    chrome.storage.local.get(["scrapeMetadata"], (result) => {
      chrome.storage.local.set({
        scrapeMetadata: { ...result.scrapeMetadata, status: "paused" },
      });
      console.log({ result });
    });
  } else if (message.action === "resumed") {
    console.log("Resuming the scraping process...");
    chrome.storage.local.get(["scrapeMetadata"], (result) => {
      chrome.storage.local.set({
        scrapeMetadata: { ...result.scrapeMetadata, status: "resumed" },
      });
      console.log({ result });
      const {
        totalPages,
        progress,
        contact_type,
        board,
        authToken,
        times,
        segment_list,
      } = result.scrapeMetadata;
      // Ensure to call fetchAllTimes with proper parameters
      const withoutZero = removeOneZero(progress);
      console.log({ withoutZero });
      fetchAllTimes(
        totalPages,
        withoutZero,
        authToken,
        contact_type,
        board,
        segment_list
      );
    });
  }
});

// NEW IMPLEMENTATION - Fixed import logic
async function fetchAllTimes(
  totalQuantity,
  startPoint,
  authToken,
  contact_type,
  board,
  segment_list
) {
  console.log("Starting import with quantity:", totalQuantity);

  // Get current LinkedIn search URL and parameters
  const tabUrl = await new Promise((resolve) => getActiveTabUrl(resolve));
  const keyword = getKeywordsFromUrl(tabUrl);
  const heroEntityKey = getQueryParam(tabUrl, "heroEntityKey");

  // Calculate how many API calls we need (10 results per call)
  const apiCallsNeeded = Math.ceil(totalQuantity / 10);

  // Initialize metadata with correct status
  await new Promise((resolve) =>
    chrome.storage.local.set(
      {
        scrapeMetadata: {
          status: "importing",
          progress: 0,
          total: totalQuantity,
          contact_type,
          board,
          authToken,
          startPoint: 0,
          keywords: keyword,
          heroEntityKey,
          segment_list,
          searchUrl: tabUrl,
          apiCallsNeeded,
          currentApiCall: 0,
        },
      },
      resolve
    )
  );

  let totalImported = 0;
  let currentApiCall = 0;

  for (let i = 0; i < apiCallsNeeded; i++) {
    // Check for stop/pause status before each API call
    const { scrapeMetadata } = await new Promise((resolve) =>
      chrome.storage.local.get(["scrapeMetadata"], resolve)
    );

    if (scrapeMetadata?.status === "stop" || scrapeMetadata?.status === "end") {
      console.log(`Import stopped at iteration ${i}`);
      return;
    }

    if (scrapeMetadata?.status === "paused") {
      console.log("Import paused. Waiting to resume...");
      while (true) {
        await delay(2000);
        const { scrapeMetadata: updatedMetadata } = await new Promise(
          (resolve) => chrome.storage.local.get(["scrapeMetadata"], resolve)
        );
        if (updatedMetadata?.status === "resumed") break;
        if (
          updatedMetadata?.status === "stop" ||
          updatedMetadata?.status === "end"
        ) {
          console.log(`Import ${updatedMetadata.status} while paused.`);
          return;
        }
      }
    }

    try {
      console.log(
        `Making API call ${i + 1}/${apiCallsNeeded} for start=${i * 10}`
      );

      const search = await searchPeople(i * 10, keyword, heroEntityKey, tabUrl);

      if (!search?.included) {
        console.log("No results from LinkedIn search. Stopping.");
        await new Promise((resolve) =>
          chrome.storage.local.set(
            {
              scrapeMetadata: {
                status: "error",
                progress: totalImported,
                total: totalQuantity,
                error: "No results from LinkedIn search. Stopping.",
                contact_type,
                board,
                authToken,
                startPoint: i + 1,
                keywords: keyword,
                heroEntityKey,
                segment_list,
                searchUrl: tabUrl,
              },
            },
            resolve
          )
        );
        break;
      }

      const peoplesProfiles = search.included.filter(
        (s) => s.template === "UNIVERSAL"
      );

      const jsonify = peoplesProfiles.map((p) => {
        const nameParts = (p?.title?.text || "").split(" ");
        return {
          first_name: nameParts[0] || "",
          last_name: nameParts[1] || "",
          current_job_title: p?.primarySubtitle?.text || "",
          summary: p?.summary?.text || "",
          avatar:
            p?.image?.attributes?.[0]?.detailData?.nonEntityProfilePicture
              ?.vectorImage?.artifacts?.[0]?.fileIdentifyingUrlPathSegment ||
            "",
          mp_customer_linkedin_profile:
            getLinkedinProfileUrl(p?.navigationUrl) || "",
        };
      });

      if (jsonify.length > 0) {
        try {
          console.log(`Saving batch of ${jsonify.length} profiles to backend`);
          await saveScrapedDataBackground(
            jsonify,
            authToken,
            contact_type,
            board,
            segment_list
          );
          totalImported += jsonify.length;
          currentApiCall = i + 1;

          console.log(
            `Successfully imported ${totalImported}/${totalQuantity} profiles`
          );

          // Update progress after each successful batch
          await new Promise((resolve) =>
            chrome.storage.local.set(
              {
                scrapeMetadata: {
                  status: "importing",
                  progress: totalImported,
                  total: totalQuantity,
                  contact_type,
                  board,
                  authToken,
                  startPoint: i + 1,
                  keywords: keyword,
                  heroEntityKey,
                  segment_list,
                  searchUrl: tabUrl,
                  apiCallsNeeded,
                  currentApiCall,
                },
              },
              resolve
            )
          );
        } catch (err) {
          console.error("Error saving batch to backend:", err);
          await new Promise((resolve) =>
            chrome.storage.local.set(
              {
                scrapeMetadata: {
                  status: "error",
                  progress: totalImported,
                  total: totalQuantity,
                  error: err?.message || "Failed to save data to backend.",
                  contact_type,
                  board,
                  authToken,
                  startPoint: i + 1,
                  keywords: keyword,
                  heroEntityKey,
                  segment_list,
                  searchUrl: tabUrl,
                },
              },
              resolve
            )
          );
          return;
        }
      }

      // Check if we've reached the target quantity
      if (totalImported >= totalQuantity) {
        console.log(
          `Reached target quantity: ${totalImported}/${totalQuantity}`
        );
        break;
      }

      // Random delay between requests (unless last iteration)
      if (i < apiCallsNeeded - 1) {
        const { minDelay, maxDelay } = getDelayRange(totalQuantity);
        const randomDelay = getRandomDelay(minDelay, maxDelay);
        console.log(`Waiting ${randomDelay}ms before next API call`);
        await delay(randomDelay);
      }
    } catch (error) {
      console.error("Error in API call:", error);
      await new Promise((resolve) =>
        chrome.storage.local.set(
          {
            scrapeMetadata: {
              status: "error",
              progress: totalImported,
              total: totalQuantity,
              error: error.message || "Unknown error",
              contact_type,
              board,
              authToken,
              startPoint: i + 1,
              keywords: keyword,
              heroEntityKey,
              segment_list,
              searchUrl: tabUrl,
            },
          },
          resolve
        )
      );
      return;
    }
  }

  // Mark as finished
  console.log(`Import completed. Total imported: ${totalImported}`);
  await new Promise((resolve) =>
    chrome.storage.local.set(
      {
        scrapeMetadata: {
          status: "finished",
          progress: totalImported,
          total: totalQuantity,
          contact_type,
          board,
          authToken,
          startPoint: apiCallsNeeded,
          keywords: keyword,
          heroEntityKey,
          segment_list,
          searchUrl: tabUrl,
          apiCallsNeeded,
          currentApiCall,
        },
      },
      resolve
    )
  );

  // After a delay, set to end and clear
  setTimeout(() => {
    chrome.storage.local.set({ scrapeMetadata: { status: "end" } }, () => {
      setTimeout(() => {
        chrome.storage.local.remove(["scrapeMetadata"]);
      }, 500);
    });
  }, 1800);
}

// Main execution
(async function () {
  try {
    const cas = await new Promise((resolve) => {
      currentDd(resolve);
    });

    console.log("Starting import with settings:", cas);

    // Start fetching data
    await fetchAllTimes(
      cas.value,
      0,
      cas?.token,
      cas?.contact_type,
      cas?.board,
      cas?.segment_list
    );

    console.log("Data fetching and saving process completed.");
  } catch (error) {
    console.log("Error in fetching or saving data:", error.message);
  }
})();

function createStickyWidget() {
  const container = document.createElement("div");
  container.className = "my-extension-sticky-widget";

  container.style.bottom = "13px";
  container.style.marginTop = "0px";
  container.style.marginBottom = "20px";
  container.style.width = "370px";
  container.style.height = "600px";
  container.style.boxShadow = "0 0 10px rgba(0,0,0,0.15)";
  container.style.borderRadius = "8px";
  container.style.overflowY = "hidden";
  container.style.zIndex = "9999";
  container.style.background = "#fff";

  const shadow = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = `
    iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
  `;
  shadow.appendChild(style);

  const iframe = document.createElement("iframe");
  iframe.src = chrome.runtime.getURL("popup.html?context=widget");
  iframe.onload = () => {
    console.log("Sticky widget iframe (popup.html) loaded.");
    chrome.storage.local.get("widgetSelections", (result) => {
      const selections = result.widgetSelections || {};
      if (selections.board) boardSelect.value = selections.board;
      if (selections.contactType)
        contactTypeSelect.value = selections.contactType;
      if (selections.segmentList)
        segmentListTypes.value = selections.segmentList;
      if (selections.quantity) quantitySelect.value = selections.quantity;
      // Optionally, trigger any dependent logic after setting values
      checkAndSetImportButtonState();
    });
  };

  shadow.appendChild(iframe);
  return container;
}

function injectIntoStickySidebar() {
  if (
    !window.location.href.startsWith(
      "https://www.linkedin.com/search/results/people/"
    )
  ) {
    return;
  }

  const stickyContainers = document.querySelectorAll(
    ".scaffold-layout__sticky.scaffold-layout__sticky--is-active.scaffold-layout__sticky--md"
  );

  stickyContainers.forEach((container) => {
    if (!container.querySelector(".my-extension-sticky-widget")) {
      const widget = createStickyWidget();
      // Insert the widget at the top of the sidebar
      container.insertBefore(widget, container.firstChild);
    }
  });
}

const observer = new MutationObserver(() => {
  injectIntoStickySidebar();
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Initial injection
injectIntoStickySidebar();

function saveWidgetSelections() {
  chrome.storage.local.set({
    widgetSelections: {
      board: boardSelect.value,
      contactType: contactTypeSelect.value,
      segmentList: segmentListTypes.value,
      quantity: quantitySelect.value,
    },
  });
}

// Add to each select's change event
[boardSelect, contactTypeSelect, segmentListTypes, quantitySelect].forEach(
  (select) => {
    select.addEventListener("change", saveWidgetSelections);
  }
);

// --- LinkedIn No Results Observer ---
(function observeLinkedInNoResults() {
  function checkNoResults() {
    const noResults = document.querySelector(
      ".search-reusable-search-no-results"
    );
    console.log({ noResults });
    if (noResults) {
      console.log("No results found");
      chrome.runtime.sendMessage({ action: "DISABLE_IMPORT_BUTTON" });
    } else {
      chrome.runtime.sendMessage({ action: "ENABLE_IMPORT_BUTTON" });
    }
  }
  // Initial check
  checkNoResults();
  // Observe DOM changes
  const observer = new MutationObserver(checkNoResults);
  observer.observe(document.body, { childList: true, subtree: true });
})();
