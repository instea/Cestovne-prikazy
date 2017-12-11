const fs = require('fs');
const indexFilePath = 'dist/index.html';

console.log('After build script started...');

// read our index file
console.log('About to rewrite file: ', indexFilePath);
fs.readFile(indexFilePath, 'utf8', function(err, data) {
  if (err) {
    return console.log(err);
  }

  data = replaceBase(data, '<base href="/leaves/">');

  // now write that file back
  fs.writeFile(indexFilePath, data, function(err) {
    if (err) return console.log(err);
    console.log('Successfully rewrote index html');
  });
});

function replaceBase(source, html) {
  const regex = /<base [^>]*>/;
  return source.replace(regex, html);
}
