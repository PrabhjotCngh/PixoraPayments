const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const LOG_PATH = path.join(__dirname, 'dslrbooth.log');

function logLine(obj) {
  const line = JSON.stringify({ time: new Date().toISOString(), ...obj }) + '\n';
  process.stdout.write(line);
  try {
    fs.appendFileSync(LOG_PATH, line);
  } catch (e) {
    console.error('Failed to append log:', e.message);
  }
}

app.get('/', (req, res) => {
  const { event_type, param1, param2 } = req.query || {};
  logLine({ event_type, param1, param2, query: req.query });
  res.send('OK');
});

app.listen( () => {
  console.log(`PixoraBridge Logger listening on https://pixora.textberry.io`);
  console.log(`Logging to ${LOG_PATH}`);
});
