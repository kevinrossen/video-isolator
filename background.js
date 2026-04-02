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
  const SITE_SELECTORS = {
    "victoryplus.com": "#videoPlayerContainer video",
    "youtube.com": "#movie_player video",
    "vimeo.com": "video",
    "x.com": "video",
    "twitch.tv": "video"
  };

  const hostname = window.location.hostname;
  let selector = null;
  for (const [domain, sel] of Object.entries(SITE_SELECTORS)) {
    if (hostname === domain || hostname.endsWith('.' + domain)) {
      selector = sel;
      break;
    }
  }

  if (!selector) {
    return { success: false, message: "This site is not supported" };
  }

  const video = document.querySelector(selector);
  if (!video) {
    return { success: false, message: "No video player found on this page" };
  }

  // Save the video's original position so we can restore it
  window.__videoIsolatorParent = video.parentElement;
  window.__videoIsolatorNextSibling = video.nextSibling;

  // Add a black backdrop that covers everything
  const backdrop = document.createElement('div');
  backdrop.id = '__video_isolator_backdrop';
  document.body.appendChild(backdrop);

  // Move video to body so it shares the same stacking context
  // as the backdrop. appendChild moves the node atomically,
  // preserving MediaSource connections and playback state.
  document.body.appendChild(video);
  video.classList.add('__video_isolator_target');
  video.controls = true;

  const style = document.createElement('style');
  style.id = '__video_isolator_style';
  style.textContent = `
    #__video_isolator_backdrop {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483646 !important;
      background: #000 !important;
    }
    .__video_isolator_target {
      position: fixed !important;
      top: 0 !important;
      left: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      z-index: 2147483647 !important;
      object-fit: contain !important;
      background: #000 !important;
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
  const backdrop = document.getElementById('__video_isolator_backdrop');
  const video = document.querySelector('.__video_isolator_target');

  if (style || backdrop || video) {
    if (style) style.remove();
    if (backdrop) backdrop.remove();
    if (video) {
      video.classList.remove('__video_isolator_target');
      video.controls = false;
      // Move video back to its original position
      if (window.__videoIsolatorParent) {
        if (window.__videoIsolatorNextSibling) {
          window.__videoIsolatorParent.insertBefore(video, window.__videoIsolatorNextSibling);
        } else {
          window.__videoIsolatorParent.appendChild(video);
        }
        window.__videoIsolatorParent = null;
        window.__videoIsolatorNextSibling = null;
      }
    }
    return { success: true, message: "Page restored!" };
  }
  return { success: false, message: "No saved state to restore" };
}
