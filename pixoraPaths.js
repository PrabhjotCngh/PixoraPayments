const path = require('path');
const os = require('os');

function pixoraBaseDir() {
  // Windows
  if (process.platform === 'win32' && process.env.APPDATA) {
    return process.env.APPDATA;
  }

  // macOS: Use Application Support
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }

  // Linux/Unix: Respect XDG if set, else ~/.config
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  // Fallback
  return path.join(os.homedir(), '.config');
}

function pixoraDir() {
  return path.join(pixoraBaseDir(), 'pixorapayments'); // lowercase
}

module.exports = { pixoraDir };
