const os = require('os');
const path = require('path');
const fs = require('fs');
let rrc = null;
let loadedPgo = false;
let recordPgo = false;
let pgoEntries = null;
let pgoFilePath = null;
let rrcErr;
let recorded = false;
exports.start = () => {  
  try {
    rrc = require('alinode/relational_require_cache');
  } catch (err) {
    rrcErr = err.message;
  }
  if(!rrc) { // 兼容老版本
    try {
      rrc = require('strontium/relational_require_cache');
      rrcErr = null;
    } catch (err) { }
  }
  recordPgo = process.env.PGO_RECORD || process.argv.indexOf('--record-pgo') > -1;
  pgoEntries = [ process.cwd(), path.join(__dirname, 'node_modules') ];
  loadedPgo = false;
  if(recordPgo) {
    if (rrc && !recorded) {
      recorded = true;
      rrc.record(pgoEntries);
    }
  } else if(rrc) {
    pgoFilePath = path.join(__dirname, 'require_cache.strrc');
    if (fs.existsSync(pgoFilePath)) {
      rrc.load(pgoFilePath, pgoEntries);
      loadedPgo = true;
    }
  }
}

exports.end = () => {
  if(recordPgo && rrc) {
    pgoFilePath = path.join(os.tmpdir(), 'require_cache.strrc');
    rrc.dump(pgoFilePath);
  }
}

exports.info = (event) => {
  const { type, start, size } = JSON.parse(event.toString());
  if (type === 'size') {
    return fs.statSync(pgoFilePath).size;
  }
  return fs.readFileSync(pgoFilePath).slice(start,start + size).toString('base64')
}
