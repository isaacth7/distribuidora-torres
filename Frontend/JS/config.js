// Frontend/JS/config.js
(function () {
  const isLocal =
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1';

  window.APP_CONFIG = {
    API_BASE: isLocal
      ? 'http://localhost:3000'
      : 'https://distribuidora-torres.onrender.com'
  };
})();
