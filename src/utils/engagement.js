class EngagementTracker {
  constructor() {
    this.RETENTION_DAYS = 30;
    this.MAX_SNIPPET_LENGTH = 100;
  }

  async addEngagement(action) {
    // Get or initialize history
    const { engagementHistory = [] } = await chrome.storage.local.get(
      "engagementHistory"
    );

    // Clean up old entries first
    const freshHistory = this.removeExpiredEntries(engagementHistory);

    // Find or create post entry
    let postEntry = freshHistory.find((p) => p.postId === action.postId);
    if (!postEntry) {
      postEntry = {
        postId: action.postId,
        postSnippet: this.truncateSnippet(action.postContent),
        posterName: action.posterName,
        posterProfile: action.posterProfile,
        postUrl: action.postUrl,
        actions: [],
        lastEngaged: new Date().toISOString(),
      };
      freshHistory.unshift(postEntry);
    }

    // Add new action
    if (action.type && action.value) {
      postEntry.actions.push({
        type: action.type,
        value: action.value,
        timestamp: new Date().toISOString(),
      });
    }

    for (let key in action) {
      if (key === "type" || key === "value") continue;
      postEntry[key] = action[key];
    }

    // Update last engaged time
    postEntry.lastEngaged = new Date().toISOString();

    // Save back to storage
    await chrome.storage.local.set({ engagementHistory: freshHistory });
  }

  removeExpiredEntries(history) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.RETENTION_DAYS);
    return history.filter((entry) => new Date(entry.lastEngaged) > cutoff);
  }

  truncateSnippet(text) {
    return text.length > this.MAX_SNIPPET_LENGTH
      ? text.substring(0, this.MAX_SNIPPET_LENGTH) + "..."
      : text;
  }

  async getPostById(postId) {
    const { engagementHistory = [] } = await chrome.storage.local.get(
      "engagementHistory"
    );
    return engagementHistory.find((p) => p.postId === postId);
  }
}

const tracker = new EngagementTracker();
module.exports = tracker;
