const fs = require('fs');

const pyContent = fs.readFileSync('../colorado_cli/01_process_v2.py', 'utf-8');
const csvContent = fs.readFileSync('../colorado_cli/self_collected_jurisdictions.csv', 'utf-8');

const mapping = {};

// Parse python dictionary
const dictMatch = pyContent.match(/city_mapping = \{([\s\S]*?)\}/);
if (dictMatch) {
  const lines = dictMatch[1].split('\n');
  lines.forEach(line => {
    const kv = line.split(':');
    if (kv.length === 2) {
      const city = kv[0].replace(/['",]/g, '').trim();
      let code = kv[1].replace(/['",]/g, '').trim();
      // Remove leading zeros for lookup matching consistency if needed, but the original script does XXYYYY
      // In JS, we keep the original code. Wait, 01_process_v2 removes leading zeros later? 
      // SUTS expects codes without leading zeros maybe? 10006 vs 010006.
      // 01_add_locations.js says: code = code.replace(/^0+/, '');
      code = code.replace(/^0+/, '');
      mapping[city.toUpperCase()] = { code, is_self_collected: false };
    }
  });
}

// Parse CSV
const csvLines = csvContent.split('\n').slice(1);
csvLines.forEach(line => {
  if (line.trim()) {
    let [code, name, label, info, is_self_collected] = line.split(',');
    if (name.startsWith('"')) {
      const quoteMatch = line.match(/"([^"]+)"/);
      if (quoteMatch) {
         name = quoteMatch[1];
      }
    }
    name = name.toUpperCase().trim();
    code = code.replace(/^0+/, '').trim();
    mapping[name] = { code, is_self_collected: is_self_collected && is_self_collected.trim() === 'True' };
  }
});

fs.writeFileSync('data/jurisdictions.json', JSON.stringify(mapping, null, 2));
console.log('Generated data/jurisdictions.json with ' + Object.keys(mapping).length + ' entries.');
