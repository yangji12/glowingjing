// Loads the browser scripts into Node's global scope.
const path = require('path');
['util', 'data', 'model', 'engine', 'scoring'].forEach((f) => require(path.join(__dirname, '..', 'js', f + '.js')));
module.exports = globalThis.AdSim;
