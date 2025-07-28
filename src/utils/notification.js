// function createNotificationUI() {
//   const notificationContainer = document.createElement("div");
//   notificationContainer.id = "linkedin-auto-commenter-notifications";
//   notificationContainer.style.position = "fixed";
//   notificationContainer.style.bottom = "20px";
//   notificationContainer.style.right = "20px";
//   notificationContainer.style.zIndex = "9999";
//   document.body.appendChild(notificationContainer);
// }

// // Show notification
// function showNotification(message, type = "info") {
//   // Get the container where notifications will be appended.
//   let notificationContainer = document.getElementById(
//     "linkedin-auto-commenter-notifications"
//   );

//   // Defensive check: If the container doesn't exist, log an error and exit.
//   if (!notificationContainer) {
//     createNotificationUI();
//     notificationContainer = document.getElementById(
//       "linkedin-auto-commenter-notifications"
//     );
//   }

//   const notification = document.createElement("div");
//   notification.classList.add(
//     "linkedin-auto-commenter-notification",
//     `notification-${type}`
//   );
//   notification.innerHTML = `
//     <div class="notification-content">
//       <span>${message}</span>
//       <button class="notification-close" aria-label="Close notification">&times;</button>
//     </div>
//   `;

//   // Append the newly created notification to its container.
//   notificationContainer.appendChild(notification);

//   // Find the close button within this specific notification.
//   const closeButton = notification.querySelector(".notification-close");

//   const removeNotification = () => {
//     notification.classList.add("notification-hiding"); // Add class to trigger fade-out animation/transition
//     // Wait for the animation to complete before removing the element from the DOM.
//     // Adjust the timeout (e.g., 300ms) to match your CSS transition duration.
//     setTimeout(() => {
//       // Check if the element still exists before trying to remove it
//       if (notification.parentNode) {
//         notification.remove();
//       }
//     }, 300);
//   };

//   // Add click event listener to the close button.
//   if (closeButton) {
//     closeButton.addEventListener("click", () => {
//       removeNotification();
//       // If there's an auto-hide timeout, clear it since the user closed it manually.
//       clearTimeout(autoHideTimeout);
//     });
//   } else {
//     console.warn(
//       "LinkedIn Auto Commenter: Close button not found within the notification element."
//     );
//   }

//   // Set a timeout to automatically remove the notification after 5 seconds.
//   const autoHideTimeout = setTimeout(removeNotification, 5000);
// }

// module.exports = {
//   showNotification,
// };


const loadingSvg = `<svg width="20" height="20" viewBox="0 0 50 50" fill="none" stroke="#0073b1">
<circle cx="25" cy="25" r="20" stroke-width="5" opacity="0.3"/>
<path d="M45 25a20 20 0 0 1-20 20" stroke-width="5" stroke-linecap="round">
  <animateTransform attributeName="transform" type="rotate" from="0 25 25" to="360 25 25" dur="1s" repeatCount="indefinite"/>
</path>
</svg>
`

function createNotificationUI() {
  const notificationContainer = document.createElement("div");
  notificationContainer.id = "linkedin-auto-commenter-notifications";
  notificationContainer.style.position = "fixed";
  notificationContainer.style.bottom = "20px";
  notificationContainer.style.left = "20px";
  notificationContainer.style.zIndex = "9999";
  document.body.appendChild(notificationContainer);
}

// Show notification
function showNotification(message, type = "info") {
  // Get the container where notifications will be appended.
  let notificationContainer = document.getElementById(
    "linkedin-auto-commenter-notifications"
  );

  // Defensive check: If the container doesn't exist, create it.
  if (!notificationContainer) {
    createNotificationUI();
    notificationContainer = document.getElementById(
      "linkedin-auto-commenter-notifications"
    );
  }

  const notification = document.createElement("div");
  notification.classList.add(
    "linkedin-auto-commenter-notification",
    `notification-${type==="loading" ? 'info': type}` // Use the type for potential specific styling
  );

  // --- Conditional HTML based on type ---
  let buttonOrSpinnerHtml = '';
  if (type === 'loading') {
    // Add a spinner element (requires CSS for animation)
    // You might want to use an SVG or a more complex spinner structure
    // buttonOrSpinnerHtml = `<div class="loading-spinner" aria-label="Loading...">${loadingSvg}</div>`;
    buttonOrSpinnerHtml = `<span class="notification-close" style="margin-top: 1px">${loadingSvg}</span>`;
  } else {
    // Add the standard close button for other types
    buttonOrSpinnerHtml = '<button class="notification-close" aria-label="Close notification">&times;</button>';
  }

  notification.innerHTML = `
    <div class="notification-content">
      <span >${message}</span> ${buttonOrSpinnerHtml}
    </div>
  `;

  // Append the newly created notification to its container.
  notificationContainer.appendChild(notification);

  // --- Define Removal Logic ---
  // Make this accessible for manual closing, especially for 'loading' type
  const removeNotification = () => {
    notification.classList.add("notification-hiding"); // Add class for fade-out animation
    // Wait for animation before removing
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300); // Adjust timeout to match your CSS transition duration
  };

  // Attach the close function to the element itself so the caller can use it
  // e.g., loadingNotification.closeNotification();
  notification.closeNotification = removeNotification;

  // --- Conditional Close Button & Auto-Hide Logic ---
  if (type !== 'loading') {
    const closeButton = notification.querySelector(".notification-close");
    let autoHideTimeout; // Declare here for scope within this block

    if (closeButton) {
      closeButton.addEventListener("click", () => {
        removeNotification();
        // Clear auto-hide if manually closed
        // Check if timeout exists before clearing
        if (autoHideTimeout) {
           clearTimeout(autoHideTimeout);
        }
      });
    } else {
      // This case should ideally not happen if type is not 'loading'
      console.warn(
        "LinkedIn Auto Commenter: Close button not found for non-loading notification."
      );
    }

    // Set a timeout to automatically remove the notification for non-loading types
    autoHideTimeout = setTimeout(removeNotification, 5000);
  }
  // --- No auto-hide for 'loading' type ---

  // --- Return the element reference ---
  return notification;
}

module.exports = {
  showNotification,
};
