// scripts/ensure-branding.js
//
// Applies the app's name and launcher icon to the generated Android
// project. Both live in files that `npx cap sync` can regenerate or
// overwrite, so like the other ensure-* scripts this is designed to be
// re-run after every sync, and is safe to run repeatedly.
//
// Two jobs:
//   1. app_name in res/values/strings.xml - this, not capacitor.config.json's
//      appName, is what the launcher actually displays on an EXISTING
//      project. appName is only read when `cap add android` first
//      scaffolds the project, so editing it alone renames nothing.
//   2. The launcher icons in res/mipmap-*.
//
// Deliberately does NOT touch the applicationId / package name. Changing
// that would make Android treat this as a completely different app: users
// would get a second copy installed alongside the old one rather than an
// update, and every flag, route and track saved under the old package
// would be invisible to it.
//
// Usage: node scripts/ensure-branding.js   (or: npm run fix-manifest)

const fs = require('fs');
const path = require('path');

const APP_NAME = 'Datum';

const projectRoot = path.join(__dirname, '..');
const resDir = path.join(projectRoot, 'android', 'app', 'src', 'main', 'res');
const iconSrcDir = path.join(projectRoot, 'resources', 'android');

if (!fs.existsSync(resDir)) {
  console.error(`Android res folder not found at ${resDir} - run "npx cap add android" first.`);
  process.exit(1);
}

// ---------- 1. App name ----------
const stringsFile = path.join(resDir, 'values', 'strings.xml');
if (!fs.existsSync(stringsFile)) {
  console.error(`strings.xml not found at ${stringsFile}`);
  process.exit(1);
}
let strings = fs.readFileSync(stringsFile, 'utf8');
const before = strings;
// app_name and title_activity_main are both shown to the user (launcher
// label and recents-screen title), so both need updating or the old name
// keeps surfacing in one place.
for (const key of ['app_name', 'title_activity_main']) {
  strings = strings.replace(
    new RegExp(`(<string name="${key}">)[^<]*(</string>)`),
    `$1${APP_NAME}$2`
  );
}
if (strings !== before) {
  fs.writeFileSync(stringsFile, strings);
  console.log(`strings.xml: app name set to "${APP_NAME}".`);
} else {
  console.log(`strings.xml: app name already "${APP_NAME}" (or keys not found - check manually).`);
}

// ---------- 2. Launcher icons ----------
if (!fs.existsSync(iconSrcDir)) {
  console.error(`Icon source folder missing at ${iconSrcDir} - skipping icons.`);
} else {
  let copied = 0;
  for (const densityDir of fs.readdirSync(iconSrcDir)) {
    const from = path.join(iconSrcDir, densityDir);
    const to = path.join(resDir, densityDir);
    if (!fs.statSync(from).isDirectory()) continue;
    fs.mkdirSync(to, { recursive: true });
    for (const file of fs.readdirSync(from)) {
      fs.copyFileSync(path.join(from, file), path.join(to, file));
      copied++;
    }
  }
  console.log(`Copied ${copied} launcher icon file(s) into res/.`);

  // On Android 8+, an adaptive icon defined in mipmap-anydpi-v26 takes
  // priority over the PNGs above and would keep showing the old artwork.
  // The new icon already has its own rounded silhouette baked in, so
  // wrapping it in the adaptive mask would double-round and crop it -
  // removing these XMLs makes the system fall back to the PNGs as-is.
  const anydpi = path.join(resDir, 'mipmap-anydpi-v26');
  if (fs.existsSync(anydpi)) {
    for (const file of fs.readdirSync(anydpi)) {
      if (file.endsWith('.xml')) fs.unlinkSync(path.join(anydpi, file));
    }
    console.log('Removed adaptive-icon XML so the new PNG icon is used unmasked.');
  }
}
