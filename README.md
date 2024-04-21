# T10 Pony Archive to Cytube Playlist

Written in js because:
1. Cloudflare on the site blocks connection attempts from the needed web sockets that I'd originally written in python
2. This project uses [Puppeteer](https://github.com/puppeteer/puppeteer) and a still functional [plugin](https://github.com/berstend/puppeteer-extra) that enables automation without being stopped by Cloudflare
3. The python [alternative](https://github.com/MeiK2333/pyppeteer_stealth) is pretty outdated and was transplanted by the Puppeteer plugin anyways

Using this requires [Node.js](https://nodejs.org/en) and a list of dependencies is listed in [package.json](https://github.com/Brambles-cat/ArchiveToCytube/blob/main/package.json)

To use this, the variables in .env need to be configured first, and then in the command prompt, navigate to the same directory as index.js and run
```bash
node index.js
```

## Known Issues:
1. Some video links (mostly with pony.tube) might redirect to a different url for the same video and cause this to try adding it when it's already present in the playlist
2. Currently it can't tell when it's been disconnected because of a duplicate login and it'll keep trying to add videos without any errors

## ToDo:
1. I'm pretty sure now that Cytube determines duplicate videos by name rather than by link, so checking for that over links should fix the issue
2. Use command line arguments so that commands like the ones below can be run
```bash
# Run with headless mode off so you can see everything that the script might be doing right/wrong
node index.js -show

# Add videos at a different delay in case you want it to process faster or if the default one is
# for whatever reason too fast and causing errors
node index.js -d[int]

# + any other ones that might be useful
```
