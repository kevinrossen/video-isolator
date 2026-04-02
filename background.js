// Track which tabs are currently isolated
const isolatedTabs = new Set();

chrome.action.onClicked.addListener((tab) => {
  if (isolatedTabs.has(tab.id)) {
    // Restore the page
    chrome.scripting.executeScript({
      target: {tabId: tab.id},
      func: restorePageFunction
    }, (results) => {
      if (results && results[0] && results[0].result && results[0].result.success) {
        isolatedTabs.delete(tab.id);
      }
    });
  } else {
    // Isolate the video
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

// Clean up when tabs are closed or navigated away
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
      selector: "#videoPlayerContainer"
    },
    "youtube.com": {
      selector: "#movie_player"
    },
    "vimeo.com": {
      strategy: "vimeo-video"
    },
    "x.com": {
      strategy: "x-video"
    }
  };

  function findSiteConfig(hostname) {
    for (const [domain, config] of Object.entries(SITE_REGISTRY)) {
      if (hostname === domain || hostname.endsWith('.' + domain)) {
        return config;
      }
    }
    return null;
  }

  function findVideoPlayer(config) {
    if (config.selector) {
      return document.querySelector(config.selector);
    }

    if (config.strategy === "x-video") {
      const article = document.querySelector('article');
      if (!article) return null;

      const video = article.querySelector('video');
      if (!video) return null;

      let container = video;
      while (container.parentElement && container.parentElement !== article) {
        container = container.parentElement;
      }
      return container;
    }

    if (config.strategy === "vimeo-video") {
      // Vimeo uses Emotion CSS-in-JS with unstable class names.
      // Find the <video> element and walk up 3 levels to the
      // media area container (video → wrapper → player → media area).
      const video = document.querySelector('video');
      if (!video) return null;

      let container = video;
      for (let i = 0; i < 3 && container.parentElement; i++) {
        container = container.parentElement;
      }
      return container;
    }

    return null;
  }

  const hostname = window.location.hostname;
  const config = findSiteConfig(hostname);

  if (!config) {
    return { success: false, message: "This site is not supported" };
  }

  const videoPlayer = findVideoPlayer(config);

  if (!videoPlayer) {
    return { success: false, message: "No video player found on this page" };
  }

  // Save original page state
  if (!window.__originalHTML) {
    window.__originalHTML = document.body.innerHTML;
    window.__originalStyles = document.body.getAttribute('style') || '';
  }

  // Clear the page and re-append the original player node
  // (appendChild moves the live node, preserving video playback state)
  document.body.innerHTML = '';
  document.body.appendChild(videoPlayer);

  // Style for fullscreen viewport fill
  videoPlayer.style.width = '100vw';
  videoPlayer.style.height = '100vh';
  videoPlayer.style.position = 'fixed';
  videoPlayer.style.top = '0';
  videoPlayer.style.left = '0';
  videoPlayer.style.zIndex = '999999';
  videoPlayer.style.backgroundColor = '#000';

  document.body.style.margin = '0';
  document.body.style.padding = '0';
  document.body.style.overflow = 'hidden';
  document.body.style.backgroundColor = '#000';

  return { success: true, message: "Video isolated!" };
}

function restorePageFunction() {
  if (window.__originalHTML) {
    document.body.innerHTML = window.__originalHTML;
    document.body.setAttribute('style', window.__originalStyles);
    window.__originalHTML = null;
    window.__originalStyles = null;
    return { success: true, message: "Page restored!" };
  } else {
    return { success: false, message: "No saved state to restore" };
  }
}
