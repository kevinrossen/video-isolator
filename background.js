// Track which tabs are currently isolated
const isolatedTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (isolatedTabs.has(tab.id)) {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: restorePageFunction
    }, (results) => {
      if (results && results[0] && results[0].result && results[0].result.success) {
        isolatedTabs.delete(tab.id);
      }
    });
  } else {
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: isolateVideoFunction
    }, (results) => {
      if (results && results[0] && results[0].result && results[0].result.success) {
        isolatedTabs.add(tab.id);
      }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  isolatedTabs.delete(tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    isolatedTabs.delete(tabId);
  }
});

// --- Injected into page context ---

function isolateVideoFunction() {
  const SITE_REGISTRY = {
    "victoryplus.com": {
      videoSelector: "#videoPlayerContainer video"
    },
    "youtube.com": {
      videoSelector: "#movie_player video"
    },
    "vimeo.com": {
      videoSelector: "video"
    },
    "x.com": {
      videoSelector: "article video"
    }
  };

  function findVideo(hostname) {
    for (const [domain, config] of Object.entries(SITE_REGISTRY)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return document.querySelector(config.videoSelector);
      }
    }
    return null;
  }

  const hostname = window.location.hostname;
  const video = findVideo(hostname);

  if (video === undefined) {
    return { success: false, message: "This site is not supported" };
  }

  if (!video) {
    return { success: false, message: "No video player found on this page" };
  }

  // Overlay the video using CSS instead of moving it in the DOM.
  // This preserves MediaSource connections, keeps the video playing,
  // and maintains all event listeners.
  video.classList.add('__video_isolator_target');
  video.controls = true;

  const style = document.createElement('style');
  style.id = '__video_isolator_style';
  style.textContent = `
    .__video_isolator_target {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      background: #000 !important;
      object-fit: contain !important;
    }
    .__video_isolator_target::-webkit-media-controls {
      display: flex !important;
      opacity: 1 !important;
    }
  `;
  document.head.appendChild(style);

  return { success: true, message: "Video isolated!" };
}

function restorePageFunction() {
  const style = document.getElementById('__video_isolator_style');
  const video = document.querySelector('.__video_isolator_target');

  if (style || video) {
    if (style) style.remove();
    if (video) {
      video.classList.remove('__video_isolator_target');
      video.controls = false;
    }
    return { success: true, message: "Page restored!" };
  } else {
    return { success: false, message: "No saved state to restore" };
  }
}
