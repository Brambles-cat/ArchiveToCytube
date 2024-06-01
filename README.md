# T10 Pony Archive to Cytube Playlist

Written in js because:
1. Cloudflare on the site blocks connection attempts from the needed web sockets that I'd originally written in python
2. This project uses [Puppeteer](https://github.com/puppeteer/puppeteer) and a still functional [plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) that enables automation without being stopped by Cloudflare
3. The python [alternative](https://github.com/MeiK2333/pyppeteer_stealth) is pretty outdated and was transplanted by the Puppeteer plugin anyway

Using this requires [Node.js](https://nodejs.org/en) and a list of dependencies is listed in [package.json](https://github.com/Brambles-cat/ArchiveToCytube/blob/main/package.json)

To use this, the variables in .env need to be configured first. Then in the command prompt, navigate to the same directory as index.js and run
```bash
node index.js
```

## Using The Script With Flags
You can provide flags when running the script in the command line. Currently these are the available flags:

- queuedelay\<int>
  This flag sets the minimum delay (in milliseconds) between adding videos to the playlist. For example, -queue2000 adds a 2 second delay between adding each video
- show
  Makes the script run the web driver in non-headless mode; Lets you see how the script interacts with the Cytube page
- errdelay\<int>
  Sets the delay (in milliseconds) that the script pauses after encountering an error
- checkblacklisted
  Instructs the script to skip over videos from blacklisted channels and warns you if videos already in the playlist are marked as blacklisted in the archive

### Example Usage
```bash
node index.js -show -queuedelay1500
```

## ToDo:
1. If there's a disconnection because of a duplicate login, pause the execution and press enter to resume rather than having to rerun the script
2. Replace delaying with more reliable puppeteer functions that wait until elements are visible to use them
3. Notify user to update auth token if the `Add as temporary` checkbox is disabled
