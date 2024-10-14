# T10 Pony Archive to Cytube Playlist

Written in js because:
1. Cloudflare on the site blocks connection attempts from the needed web sockets that I'd originally written in python
2. This project uses [Puppeteer](https://github.com/puppeteer/puppeteer) and a still functional [plugin](https://github.com/berstend/puppeteer-extra/tree/master/packages/puppeteer-extra-plugin-stealth) that enables automation without being stopped by Cloudflare
3. The python [alternative](https://github.com/MeiK2333/pyppeteer_stealth) is pretty outdated and was transplanted by the Puppeteer plugin anyway

Using this requires [Node.js](https://nodejs.org/en) and a list of dependencies is listed in [package.json](https://github.com/Brambles-cat/ArchiveToCytube/blob/main/package.json) which can be installed by running
```bash
npm i
```

## Usage
Firstly, the `CHANNEL` variable in .env must be set to the name of the Cytube channel the program should run using. Several settings in this file can also be modified to change how the program behaves. Then in the command prompt, navigate to the same directory as index.js and run
```bash
node index.js
```

Depending on which login method is set in .env, either a prompt for an authentication cookie will appear, or the Cytube login page will be brought up. In the case of the former, the cookie can be found by logging into Cytube, inspecting the page >> Application >> Cookies (left sidebar) >> and copying the value in the `auth` row. The cookie does change every so often so if the `Add as temporary` checkbox is greyed out, it means that the auth value being used is outdated

## ToDo:
1. If there's a disconnection because of a duplicate login, pause the execution and press enter to resume rather than having to rerun the script
2. Notify user to update auth token if the `Add as temporary` checkbox is disabled
