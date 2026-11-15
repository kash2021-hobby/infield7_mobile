const fs = require("node:fs");
const path = require("node:path");

// Android push needs Firebase's google-services.json. Builds without it still work; the phone just cannot register for notifications.
module.exports = ({ config }) => {
  if (!fs.existsSync(path.join(__dirname, "google-services.json"))) return config;
  return { ...config, android: { ...config.android, googleServicesFile: "./google-services.json" } };
};
