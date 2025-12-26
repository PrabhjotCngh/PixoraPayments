const path = require('path');
const os = require('os');

function pixoraBaseDir() {
  // Linux / Mac (standard)
  if (process.env.XDG_CONFIG_HOME) {
    return process.env.XDG_CONFIG_HOME;
  }

  // Windows
  if (process.env.APPDATA) {
    return process.env.APPDATA;
  }

  // Fallback
  return path.join(os.homedir(), '.config');
}

function pixoraDir() {
  return path.join(pixoraBaseDir(), 'pixorapayments'); // lowercase
}

module.exports = { pixoraDir };
