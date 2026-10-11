import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
const vendor = new URL('../public/vendor/', import.meta.url);
mkdirSync(vendor, { recursive: true });
const dependency = new URL('../node_modules/libphonenumber-js/', import.meta.url);
// Ship locally: no third-party request receives a visitor's phone number.
const bundle = readFileSync(new URL('bundle/libphonenumber-max.js', dependency), 'utf8');
writeFileSync(new URL('libphonenumber.js', vendor), bundle.replace(/\/\/# sourceMappingURL=.*$/gm, ''));
copyFileSync(new URL('LICENSE', dependency), new URL('libphonenumber-LICENSE.txt', vendor));
console.log('Built self-hosted phone parsing bundle.');
