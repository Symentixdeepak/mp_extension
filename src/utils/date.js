function formatDateTime(date) {
  const formattedDate = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(new Date(date));


  return formattedDate;
}

  // Format as DD_MM_YYYY
  function formatDateForExcel(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}_${month}_${year}`;
  }

module.exports = {
  formatDateTime,
  formatDateForExcel
};
