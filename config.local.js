/*
  Local development overrides for U.O.G.A.
  ------------------------------------------------------------------
  1) Copy this file to `config.local.js`
  2) Replace YOUR_LOCAL_GOOGLE_MAPS_KEY with your localhost key
  3) Do not commit config.local.js (it is git-ignored)
*/
(function () {
  var localConfig = {
    GOOGLE_MAPS_API_KEY: 'AIzaSyAjCdthiKfjonK6JNuipHQBek8NSRnPriQ',
    POSTHOG_PROJECT_KEY: 'phc_wUu7Hy6xrCLfYBqJQXwAMrZNY6huYN43wwcVZHJFW5i8',
    POSTHOG_CONFIG: {
      // Keep false by default to control cost and privacy.
      enableSessionRecording: false
    }
  };

  window.UOGA_LOCAL_CONFIG = Object.assign({}, window.UOGA_LOCAL_CONFIG || {}, localConfig);

  // Keep compatibility with existing config consumers.
  if (window.UOGA_CONFIG && localConfig.GOOGLE_MAPS_API_KEY && /^AIza[0-9A-Za-z_-]{35}$/.test(localConfig.GOOGLE_MAPS_API_KEY)) {
    window.UOGA_CONFIG.GOOGLE_MAPS_API_KEY = localConfig.GOOGLE_MAPS_API_KEY;
  }
})();
 
