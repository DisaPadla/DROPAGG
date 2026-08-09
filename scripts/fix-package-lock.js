const fs = require("fs");
const path = require("path");

const lockPath = path.join(__dirname, "../package-lock.json");

if (fs.existsSync(lockPath)) {
  let content = fs.readFileSync(lockPath, "utf8");
  const count = (content.match(/artifactory\.infrateam\.xyz/g) || []).length;
  console.log(`Found ${count} artifactory URLs in package-lock.json. Replacing with registry.npmjs.org...`);

  content = content.replaceAll(
    "https://artifactory.infrateam.xyz:443/artifactory/api/npm/npm/",
    "https://registry.npmjs.org/"
  );

  content = content.replaceAll(
    "https://artifactory.infrateam.xyz/artifactory/api/npm/npm/",
    "https://registry.npmjs.org/"
  );

  fs.writeFileSync(lockPath, content, "utf8");
  console.log("Successfully replaced all corporate artifactory URLs with official npm registry!");
} else {
  console.error("package-lock.json not found!");
}
