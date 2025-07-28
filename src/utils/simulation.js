const { getRandomDelay } = require("./utils");

// Helper: Simulate human-like typing
async function simulateTyping(element, text) {
  // Focus the input
  element.focus();

  // Clear existing content
  element.textContent = "";

  const pauseAt = getRandomDelay(0, text.length - 1);
  // Type each character with random delay
  for (let i = 0; i < text.length; i++) {
    // Add character
    element.textContent += text[i];

    // Dispatch input event
    const inputEvent = new Event("input", { bubbles: true });
    element.dispatchEvent(inputEvent);

    if (i === pauseAt) {
      await new Promise((resolve) =>
        setTimeout(resolve, getRandomDelay(1000, 3000))
      );
    }

    // Random delay between keystrokes (30-100ms)
    const delay = Math.floor(Math.random() * 30) + 150;
    await new Promise((resolve) => setTimeout(resolve, delay));
  }
}

// Helper: Simulate mouse click
function simulateMouseClick(element) {
  if (!element) return;

  // Simulate mouse events
  const events = ["mousedown", "mouseup", "click"];

  events.forEach((eventName) => {
    const mouseEvent = new MouseEvent(eventName, {
      bubbles: true,
      cancelable: true,
      view: window,
    });

    element.dispatchEvent(mouseEvent);
  });
}
async function setCommentInputValue(element, text) {
  element.focus();

  // Clear existing content first
  if (element.isContentEditable) {
    element.innerHTML = ''; // Clear for contenteditable
    element.textContent = text;
  } else if ("value" in element) { // For <input> or <textarea>
    element.value = ''; // Clear for input/textarea
    element.value = text;
  } else {
    // Fallback, though less common for comment inputs
    element.innerHTML = '';
    element.textContent = text;
  }

  // Dispatch a sequence of events to better mimic user input
  // and trigger potential listeners on the page.
  const inputEvent = new Event('input', { bubbles: true, cancelable: true });
  element.dispatchEvent(inputEvent);

  // Some platforms might also listen for 'change' or even key events
  // to enable submit buttons or validate input.
  const changeEvent = new Event('change', { bubbles: true, cancelable: true });
  element.dispatchEvent(changeEvent);

  // A small delay can sometimes help ensure events are processed.
  await new Promise(resolve => setTimeout(resolve, 100)); // 100ms delay
}

module.exports = {
  simulateTyping,
  simulateMouseClick,
  setCommentInputValue,
};
