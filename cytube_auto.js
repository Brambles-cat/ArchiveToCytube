const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklist_check, vid_identifier, get_archive_csv, log, logErr, delay, getInput } = require('./utils.js')

puppeteer.use(StealthPlugin())

function update_playlist(cookie, headless, queue_delay, url, check_blacklisted) {
    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()

        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

        while (true) {
            await page.setCookie(cookie)
            await page.goto(url)

            // since a browser is being used, a delay might be needeed so all the necessary elements have time to load
            await delay(2500 + (!headless * 1000))

            // if the logout element exists that means that the authentication cookie has worked
            let logged_in = await page.$('#logout')
            let retries = 0
            
            while (!logged_in && retries < 3) {
                logErr("Indicator of successful login is absent\nRetrying...")
                logged_in = await page.$('#logout')
                await delay(1000)
                if (logged_in) break
            }

            if (logged_in) break
            
            logErr("\nConclusion: Invalid Authentication Cookie Provided")
            log()

            cookie['value'] = await getInput('Authentication Cookie: ', true)
        }

        // This is the + button which is needed to reveal the playlist adding video options
        await page.click('#showmediaurl')

        // this is to uncheck the 'add as temporary' box
        await page.waitForSelector("#addfromurl .checkbox .add-temp").then(button => button.click());

        // return a 2d array of all video identifiers currently in the playlist
        let playlistSnapshot = await page.evaluate(() => {
            const elements = Array.from(document.getElementsByClassName('qe_title'));
            elements.shift()
            return elements.map(e => {
            // can't use vid_identifier() here since this runs in the page context
            str = e.href.split('/')
            if (!str.at(-1)) {
                return str.at(-2) + "/"
            }
            return str.at(-1)
            });
        })
        
        let is_blacklisted
        let csv_row = 1, add_vid_attempts = 0
        let alternate = false
        const blacklist_included = []

        function skip_check(video_data) {
            if (is_blacklisted) {
                log(`${csv_row}: skipping blacklisted video`)
                return true
            }

             if (videoData[index.NOTES].includes("age restriction")) {
                log(`${csv_row}: skipping age restricted video`)
                return true
            }
            return false
        }

        // for each video in the archive, try adding it to
        // the cytube playlist if it isn't already present
        for (var videoData of archive_data) {
            ++csv_row
            is_blacklisted = check_blacklisted && blacklist_check(videoData)

            if (playlistSnapshot.includes(await vid_identifier(videoData[index.LINK]))) {
                if (is_blacklisted) {
                    await logErr(`${csv_row}: blacklisted video found in playlist - ${videoData[index.TITLE]}`)
                    blacklist_included.push(`${videoData[index.TITLE]}  -  ${videoData[index.LINK]}`)
                }
                else log(`${csv_row}: present`)
                continue
            }

            // video having a non null state means that the first link shouldn't work
            if (videoData[index.STATE]) {
                if (videoData[index.FOUND] !== "found") {
                    if (skip_check) continue

                    await logErr(csv_row + ': no useable alt link - Title: ' + videoData[index.TITLE])
                    continue
                }

                if (playlistSnapshot.includes(await vid_identifier(videoData[index.ALT_LINK]))) {
                    if (is_blacklisted) {
                        await logErr(`${csv_row}: blacklisted video found in playlist - ${videoData[index.TITLE]}`)
                        blacklist_included.push(`${videoData[index.TITLE]}  -  ${videoData[index.ALT_LINK]}`)
                    }
                    else log(`${csv_row}: alt present`)
                    continue
                }

                if (skip_check(videoData)) continue

                alternate = true
                await page.type('#mediaurl', videoData[index.ALT_LINK])

            } else {
                if (skip_check(videoData)) continue
                await page.type('#mediaurl', videoData[index.LINK]);
            }

            if (await page.$('.server-msg-disconnect')) {
                logErr('Disconnected from server because of duplicate login')
                return
            }

            /* Cytube has a limit on how fast videos can be added so a
             delay was needed whether puppeteer was used or not
             I found that 600-1000 ms was enough of a delay to not face this issue
             but the default value is 2000 just to be safe since sometimes queing
             can take a bit longer before clearing the url entry box, which may cause errors
            */
            await page.click('#queue_end')
            await delay(queue_delay + (!headless * 1000))

            log(`${csv_row}: not present - Title: ${videoData[index.TITLE]}\n${alternate ? 'adding using alt link...' : 'adding...'}\n`)

            ++add_vid_attempts
            alternate = false;
        }

        log('done')
        
        // in case a new err pops up or smt
        await delay(2000)

        const alerts = await page.$$eval('.alert.alert-danger', alerts => {
            return alerts.map(alert => {
                const links = []
                links.push(alert.childNodes[3].nodeValue.split('.')[0])

                const elements = alert.querySelectorAll('a')
                for (let e of elements)
                    if (!e.href.includes('https://git'))
                        links.push(e.href)

                return links;
            });
        });

        log("\nResults Summary:")
        log(`Tried adding ${add_vid_attempts} videos to Cytube\n`)

        for (let alert of alerts) {
            log(alert[0])
            for (let i = 1; i < alert.length; ++i)
                logErr(alert[i], false)
            log()
        }

        if (blacklist_included.length) {
            log("Blacklisted videos found in Cytube playlist")
            for (let video_identifiers of blacklist_included)
                logErr(video_identifiers, false)
            log()
        }

        if (!headless) await getInput('', false)
        await browser.close()
    })
}

module.exports = { update_playlist }