const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklist_check, vid_identifier, get_archive_csv, log, logErr, delay, getInput } = require('./utils.js')

puppeteer.use(StealthPlugin())

function update_playlist(use_cookie, headless, queue_delay, url, check_blacklisted) {    
    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()

        if (use_cookie)
            await login_with_cookie(page, url)
        else
            await normal_login(page, url)

        // Give the page a bit to load the playlist with all the videos
        await delay(2000)

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

        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

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

async function login_with_cookie(page) {
    let input = await getInput('Authentication Cookie: ', true)

    let cookie =  {
        'name': 'auth',
        'value': input,
        'domain': '.cytu.be'
    }

    while (true) {
        await page.setCookie(cookie)
        await page.goto(url)

        // if the logout element exists that means that the authentication cookie has worked
        let logged_in = await page.$('#logout')

        if (logged_in) break
        
        logErr("Invalid Authentication Cookie Provided")
        log()

        cookie.value = await getInput('Authentication Cookie: ', true)
    }
}

async function normal_login(page, url) {
    await page.goto("https://cytu.be/login")

    // Wait until logged in, then go to the cytube channel
    while (!(await page.$("div.alert.alert-success.messagebox.center")))
        await delay(1000)

    await page.goto(url)
}

module.exports = { update_playlist }