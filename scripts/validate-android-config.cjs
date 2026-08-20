const fs = require("fs");

const configPath = process.argv[2];
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const isValid =
  config.name === "SwarLipi" &&
  config.orientation === "portrait" &&
  config.android?.versionCode === 1 &&
  config.android?.allowBackup === true &&
  typeof config.android?.package === "string" &&
  config.android.package.length > 0;

if (!isValid) {
  console.error("Android configuration validation failed.");
  process.exit(1);
}

console.log(`Android config validated: ${config.android.package} (versionCode ${config.android.versionCode})`);
