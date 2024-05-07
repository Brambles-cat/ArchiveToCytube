const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklist_check, vid_identifier, get_archive_csv, log, logErr, env, delay } = require('./utils.js')

puppeteer.use(StealthPlugin())

function update_playlist(cookie, headless, err_delay, queue_delay, url, check_blacklisted) {
    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()

        await page.setCookie(cookie)
        await page.goto(url)
        
        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

        // since a browser is being used, a delay is needeed so all the necessary elements have time to load
        await delay(2500)

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
        
        let blacklisted
        let csv_row = 1, add_vid_attempts = 0, alt_links_used = 0

        // for each video in the archive, try adding it to
        // the cytube playlist if it isn't already present
        for (var videoData of archive_data) {
            ++csv_row
            blacklisted = check_blacklisted && blacklist_check(videoData)

            if (playlistSnapshot.includes(await vid_identifier(videoData[index.LINK]))) {
                if (blacklisted) logErr(`${csv_row}: blacklisted video found in playlist - ${videoData[index.TITLE]}`)
                else log(`${csv_row}: present`)
                continue
            }

            if (videoData[index.STATE]) {
                if (videoData[index.FOUND] !== "found") {
                    if (blacklisted) log(`${csv_row}: skipping blacklisted video`)

                    else {
                        logErr(csv_row + ': no useable alt link - Title: ' + videoData[index.TITLE])
                        await delay(err_delay)
                    }

                    continue
                }

                if (playlistSnapshot.includes(await vid_identifier(videoData[index.ALT_LINK]))) {
                    if (blacklisted) {
                        logErr(`${csv_row}: blacklisted video found in playlist - ${videoData[index.TITLE]}`)
                        await delay(err_delay)
                    }
                    else
                        log(csv_row + ": alt present")
                    continue
                }

                if (blacklisted) {
                    log(`${csv_row}: skipping blacklisted video`)
                    continue
                }
                
                log("using alt link - alts used: " + ++alt_links_used)
                await page.type('#mediaurl', videoData[index.ALT_LINK])

            } else {
                if (blacklisted) {
                    log(`${csv_row}: skipping blacklisted video`)
                    continue
                }
                await page.type('#mediaurl', videoData[index.LINK]);
            }

            await page.click('#queue_end')

            log(csv_row + ": not preset - Title: " + videoData[index.TITLE] + "\nVideo Adding Attempts: " + ++add_vid_attempts)
            // Cytube has a limit on how fast videos can be added so a
            // delay was needed whether puppeteer was used or not
            // I found that 600-1000 ms was enough of a delay to not face this issue
            // but the default value is 1000 just to be safe
            await delay(queue_delay + (!headless * 1000))

        }

        await browser.close()
        log('done')
    })
}

module.exports = { update_playlist }