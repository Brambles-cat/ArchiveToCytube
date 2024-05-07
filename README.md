# T10 Pony Archive to Cytube Playlist

Written in js because:
1. Cloudflare on the site blocks connection attempts from the needed web sockets that I'd originally written in python
2. This project uses [Puppeteer](https://github.com/puppeteer/puppeteer) and a still functional [plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) that enables automation without being stopped by Cloudflare
3. The python [alternative](https://github.com/MeiK2333/pyppeteer_stealth) is pretty outdated and was transplanted by the Puppeteer plugin anyway

Using this requires [Node.js](https://nodejs.org/en) and a list of dependencies is listed in [package.json](https://github.com/Brambles-cat/ArchiveToCytube/blob/main/package.json)

To use this, the variables in .env need to be configured first, and then in the command prompt, navigate to the same directory as index.js and run
```bash
node index.js
```

## Known Issues:
1. Currently it can't tell when it's been disconnected because of a duplicate login and it'll keep trying to add videos without any errors being thrown
2. Tries adding videos labeled as age restricted, which aren't accepted by Cytube

## ToDo:
1. Check notes for each archive entry for `age restriction` and skip over them if present
2. Error handling for invalid auth cookie input
3. Right now the logging is disgusting. Need to clean that up later