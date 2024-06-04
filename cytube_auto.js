const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklisted_creator, get_row_video_ids, check_includes, get_archive_csv, log, logErr, delay, getInput } = require('./utils.js')

puppeteer.use(StealthPlugin())

function update_playlist(use_cookie, headless, queue_delay, playlist_url, check_blacklisted) {
    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()
        if (use_cookie)
            await login_with_cookie(page, playlist_url)
        else
            await normal_login(page, playlist_url)

        // Give the page a bit to load the playlist with all the videos
        await delay(3000)

        let can_add = true
        try {
            // This is the + button which is needed to reveal the playlist adding video options
            await page.click('#showmediaurl')

            // this is to uncheck the 'add as temporary' box
            await page.waitForSelector("#addfromurl .checkbox .add-temp").then(button => button.click());
        } catch {
            await logErr("Can't add videos to this playlist")
            can_add = false
        }

        // return a 2d array of all video identifiers currently in the playlist
        let playlistSnapshot = await page.evaluate(() => {
            const elements = Array.from(document.getElementsByClassName('qe_title'));
            let id, ids_links = {}
            elements.shift()

            // can't use vid_identifier() here since this runs in the page context

            for (var e of elements) {
                id = e.href.split('/')

                if (!id.at(-1)) {
                    id = id.at(-2) + "/"
                }

                id = id.at(-1)
                ids_links[id] = e.href
            }
           
            return ids_links
        })
        
        let row_is_blacklisted
        let csv_row = 1, add_vid_attempts = 0
        let row_video_ids
        let includes
        const blacklist_included = []

        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

        // for each video in the archive, try adding it to
        // the cytube playlist if it isn't already present
        for (var archive_row of archive_data) {
            ++csv_row
            row_is_blacklisted = check_blacklisted && blacklisted_creator(archive_row)
            row_video_ids = await get_row_video_ids(archive_row)

            if (row_is_blacklisted) {
                var present_url

                for (const id of row_video_ids) {
                    includes = check_includes(playlistSnapshot, id)

                    if (includes.in_snapshot) {
                        present_url = playlistSnapshot[includes.id]
                        delete playlistSnapshot[includes.id]
                        break
                    }
                }

                if (present_url) {
                    await logErr(`${csv_row}: blacklisted video found in playlist - ${archive_row[index.TITLE]}`)
                    blacklist_included.push(`${archive_row[index.TITLE]}  -  ${present_url}`)
                    continue
                }

                log(`${csv_row}: skipping blacklisted video`)
                continue
            }

            if (archive_row[index.NOTES].includes("age restriction bypass") || archive_row[index.NOTES].includes("bypass age restriction")) {
                includes = check_includes(playlistSnapshot, row_video_ids[2])

                if (includes.in_snapshot) {
                    delete playlistSnapshot[includes.id]
                    log(`${csv_row}: age-restriction bypassing link present`)
                    continue
                }

                log(`${csv_row}: not present - Title: ${archive_row[index.TITLE]}`)
                if (can_add) {
                    log("adding using age-restriction bypassing link...\n")
                    await page.type('#mediaurl', archive_row[index.NOTES].split(" ").at(-1))
                }
            }

            else if (archive_row[index.FOUND] === "found") {
                includes = check_includes(playlistSnapshot, row_video_ids[1])

                if (includes.in_snapshot) {
                    log(`${csv_row}: alt present`)
                    delete playlistSnapshot[includes.id]
                    continue
                }

                log(`${csv_row}: not present - Title: ${archive_row[index.TITLE]}`)
                if (can_add) {
                    log("adding using alt link...\n")
                    await page.type('#mediaurl', archive_row[index.ALT_LINK])
                }
            }
            
            else if (archive_row[index.FOUND] === "needed") {
                await logErr(`${csv_row}: no useable alt link - Title: ${archive_row[index.TITLE]}`)
                continue
            }

            else {
                includes = check_includes(playlistSnapshot, row_video_ids[0])
                if (includes.in_snapshot) {
                    log(`${csv_row}: present`)
                    delete playlistSnapshot[includes.id]
                    continue
                }

                log(`${csv_row}: not present - Title: ${archive_row[index.TITLE]}`)
                if (can_add) {
                    log("adding...\n")
                    await page.type('#mediaurl', archive_row[index.LINK])
                }
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
            if (can_add) {
                await page.click('#queue_end')
                await delay(queue_delay + (!headless * 1000))

                ++add_vid_attempts
            }
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

        if (Object.keys(playlistSnapshot).length !== 0) {
            log("Videos found in Cytube playlist that shouldn't be according to the pony archive")
            for (var url of Object.values(playlistSnapshot))
                logErr(url, false)
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
    let logged_in
    await page.goto("https://cytu.be/login")

    // Wait until logged in, then go to the cytube channel
    while (!logged_in) {
        await delay(750)
        try {
            logged_in = await page.$("div.alert.alert-success.messagebox.center")
        }
        catch {}
    }

    await page.goto(url)
}

module.exports = { update_playlist }