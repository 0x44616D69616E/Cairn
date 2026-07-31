// scripts/lib/patchMainActivity.js
//
// Shared logic for registering a custom native plugin in MainActivity.java.
// Used by both ensure-storage-plugin.js and ensure-compass-plugin.js (and
// any future one) so they don't each need their own copy of this, and so
// registering a SECOND custom plugin after a first one is already there
// works correctly instead of only handling the fully-stock starting case.

const fs = require('fs');
const path = require('path');

// Finds MainActivity.java by actually searching the java/ tree, rather
// than computing the expected path from capacitor.config.json's appId.
// Those can disagree in practice - if the android/ project was generated
// before an appId rename (as happened here: capacitor.config.json says
// com.alienwizard.cairn, but the native project was generated back when
// it was com.alienwizard.offlinetopo, and renaming an already-generated
// Android package isn't something changing one config field does
// retroactively) - so this reads the real package straight out of the
// file's own `package X;` line instead of assuming it matches config.
function findMainActivity(projectRoot) {
  const javaRoot = path.join(projectRoot, 'android', 'app', 'src', 'main', 'java');
  if (!fs.existsSync(javaRoot)) return null;

  let found = null;
  (function walk(dir) {
    if (found) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === 'MainActivity.java') found = full;
      if (found) return;
    }
  })(javaRoot);

  if (!found) return null;

  const source = fs.readFileSync(found, 'utf8');
  const packageMatch = source.match(/^package\s+([\w.]+);/m);
  if (!packageMatch) return null;

  return { file: found, dir: path.dirname(found), packageName: packageMatch[1] };
}

function ensurePluginRegistered(mainActivitySource, pluginClassName) {
  if (mainActivitySource.includes(`registerPlugin(${pluginClassName}.class)`)) {
    return { content: mainActivitySource, changed: false, message: `${pluginClassName} already registered - nothing to do.` };
  }

  // Case 1: onCreate() already exists (most likely because a different
  // custom plugin was registered here first) - add ours as a new line
  // inside it, before whatever's already there.
  const onCreatePattern = /(public void onCreate\(android\.os\.Bundle savedInstanceState\)\s*\{)/;
  const onCreateMatch = mainActivitySource.match(onCreatePattern);
  if (onCreateMatch) {
    return {
      content: mainActivitySource.replace(onCreatePattern, `${onCreateMatch[1]}\n        registerPlugin(${pluginClassName}.class);`),
      changed: true,
      message: `Added registerPlugin(${pluginClassName}.class) to the existing onCreate().`
    };
  }

  // Case 2: fully stock Capacitor 6 template, no onCreate() at all yet -
  // create one.
  const stockPattern = /public class MainActivity extends BridgeActivity\s*\{\s*\}/;
  if (stockPattern.test(mainActivitySource)) {
    return {
      content: mainActivitySource.replace(
        stockPattern,
        `public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(${pluginClassName}.class);
        super.onCreate(savedInstanceState);
    }
}`
      ),
      changed: true,
      message: `Created onCreate() and registered ${pluginClassName}.`
    };
  }

  return {
    content: mainActivitySource,
    changed: false,
    error: true,
    message:
      `MainActivity.java doesn't match a known pattern, so this couldn't be patched automatically. ` +
      `Add this as a line inside onCreate(), before the call to super.onCreate():\n\n` +
      `        registerPlugin(${pluginClassName}.class);\n`
  };
}

module.exports = { ensurePluginRegistered, findMainActivity };
