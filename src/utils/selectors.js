const selectors = require("../selectors.json");

const getSelectors = async () => {
  try {
     
    // // Fetch selectors.json (bundled with extension)
    // const selectors = await fetch(chrome.runtime.getURL("selectors.json")).then(
    //   (res) => res.json()
    // );
      // console.log({selectors})
    const currentUrl = window.location.href;
    let pageSelectors = {};

    // Find matching URL pattern
    for (const [pattern, selector] of Object.entries(selectors)) {
      const regex = new RegExp(pattern.replace(/\*/g, "[^/]+"));
      if (regex.test(currentUrl)) {
        pageSelectors = selector;
        break;
      }
    }

    // console.log("found page selectors: ", pageSelectors)

    if (!Object.keys(pageSelectors).length) return null;

    return pageSelectors;
  } catch (e) {
    console.log("error finding selectors: ", e);
  }
};


module.exports = getSelectors;