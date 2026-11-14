document.getElementById("open-app").addEventListener("click", () => {
  chrome.tabs.create({ url: "https://drilldeck.vercel.app/" });
  window.close();
});
