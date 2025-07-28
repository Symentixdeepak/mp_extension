// Change this line:
// const ApexCharts = require('apexcharts');
// To this:
import ApexCharts from 'apexcharts'; // Use ES Module import

let dailyEngagementChartInstance = null;

function prepareDailyEngagementData(filtered) {
    const dailyMap = {};
  
    filtered.forEach(post => {
      const date = new Date(post.lastEngaged).toISOString().split('T')[0];
      if (!dailyMap[date]) {
        dailyMap[date] = { like: 0, comment: 0, post: 0 };
      }
      dailyMap[date].post++;
      post.actions.forEach(action => {
        if (action.type === 'like') dailyMap[date].like++;
        if (action.type === 'comment') dailyMap[date].comment++;
      });
    });
  
    // Sort dates ascending
    const sortedDates = Object.keys(dailyMap).sort();
  

    const postSeries = sortedDates.map(date => dailyMap[date].post);
    const likeSeries = sortedDates.map(date => dailyMap[date].like);
    const commentSeries = sortedDates.map(date => dailyMap[date].comment);
  
    return {
      categories: sortedDates,
      likeSeries,
      commentSeries,
      postSeries
    };
  }
  
  function drawDailyEngagementChart(filtered) {
    const { categories, likeSeries, commentSeries } = filtered;
    const chartElement = document.getElementById('daily-engagement-chart');

    // Ensure the chart container exists
    if (!chartElement) {
        console.error("Element with ID 'daily-engagement-chart' not found.");
        return;
    }

    // --- FIX: Destroy previous chart instance if it exists ---
    if (dailyEngagementChartInstance) {
        dailyEngagementChartInstance.destroy();
        dailyEngagementChartInstance = null; // Clear the reference
    }
  
    const options = {
      chart: {
        type: 'bar',
        stacked: true,
        height: 320,
        toolbar: { show: false },
        background: 'transparent'
      },
      plotOptions: {
        bar: {
          horizontal: false,
          borderRadius: 4,
        },
      },
      xaxis: {
        categories: categories,
        labels: { style: { fontSize: '11px' } }
      },
      yaxis: {
        title: {
          text: 'Actions'
        }
      },
      colors: ['#3B82F6', '#34D399'], // Indigo (Likes), Emerald Green (Comments)
      legend: {
        position: 'top',
        labels: { colors: '#4B5563' }, // gray-700
      },
      tooltip: {
        shared: true,
        intersect: false,
      },
      series: [
        { name: 'Likes', data: likeSeries },
        { name: 'Comments', data: commentSeries }
      ]
    };
  
    dailyEngagementChartInstance  = new ApexCharts(document.getElementById('daily-engagement-chart'), options);
    dailyEngagementChartInstance.render();
  }
  



async function loadEngagementSummary() {
  // ... (rest of your function remains the same) ...

  const { engagementHistory = [] } = await chrome.storage.local.get('engagementHistory');
  const filterDaysElement = document.getElementById('global-date-filter');
  // Add a check in case the element isn't found immediately or on other tabs
  if (!filterDaysElement) {
      console.warn("Element with ID 'global-date-filter' not found. Cannot load analytics.");
      return;
  }
  const filterDays = parseInt(filterDaysElement.value);


  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - filterDays);
  cutoffDate.setHours(0, 0, 0, 0);

  const filtered = engagementHistory.filter(post => new Date(post.lastEngaged) >= new Date(cutoffDate));

  const postsCount = filtered.length;
  const likesCount = filtered.reduce((sum, post) => sum + post.actions.filter(a => a.type === 'like').length, 0);
  const commentsCount = filtered.reduce((sum, post) => sum + post.actions.filter(a => a.type === 'comment').length, 0);

  // Days range
  const uniqueDates = new Set(filtered.map(post => new Date(post.lastEngaged).toISOString().split('T')[0]));
  const averageActions = (likesCount + commentsCount) / (uniqueDates.size || 1);

  // Update numbers (Ensure these elements exist)
  document.getElementById('total-posts-engaged').textContent = postsCount;
  document.getElementById('total-likes-done').textContent = likesCount;
  document.getElementById('total-comments-done').textContent = commentsCount;
//   document.getElementById('average-actions').textContent = averageActions.toFixed(1);

  // Top Users
  const userMap = {};
  filtered.forEach(post => {
    // Use posterName or a default if user isn't directly available
    const userName = post.posterName || 'Unknown User';
    if (!userMap[userName]) userMap[userName] = 0;
    userMap[userName] += post.actions.length;
  });

  const topUsers = Object.entries(userMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const topUsersList = document.getElementById('top-users');
  topUsersList.innerHTML = topUsers.length ? topUsers.map(([user, count]) => `<li><b>${user}</b> — ${count} actions</li>`).join('') : '<li>No data available.</li>';


  const seriesData = prepareDailyEngagementData(filtered)
  // Draw charts (Ensure these elements exist)
//   drawMiniChart('posts-chart', postsCount, seriesData.postSeries, "posts");
//   drawMiniChart('likes-chart', likesCount, seriesData.likeSeries, "likes");
//   drawMiniChart('comments-chart', commentsCount, seriesData.likeSeries, "comments");

  drawDailyEngagementChart(seriesData);
}



// Hook to dropdown change (Ensure the element exists before adding listener)
const filterDropdown = document.getElementById('global-date-filter');
if (filterDropdown) {
    filterDropdown.addEventListener('change', loadEngagementSummary);
} else {
    console.warn("Element with ID 'global-date-filter' not found. Change listener not added.");
}


// Load initially - DOMContentLoaded might fire before all elements are ready in some cases,
// but it's generally the right place. Ensure the HTML structure is correct.
// The check inside loadEngagementSummary for elements helps mitigate timing issues.
document.addEventListener('DOMContentLoaded', () => {
    // Check if we are on the options page where the analytics tab exists
    if (document.getElementById('analytics')) { // Check if the analytics tab content exists
         // Initial load might happen before the tab is visible, elements might not be ready.
         // Consider loading only when the tab becomes active, like you do in history/index.js
         // However, the DOMContentLoaded listener is standard practice.
         // Let's try loading, the checks inside the functions will prevent errors if elements aren't found.
         loadEngagementSummary();
    }
});


// Change this line:
// module.exports = loadEngagementSummary;
// To this:
export default loadEngagementSummary; // Use ES Module export
