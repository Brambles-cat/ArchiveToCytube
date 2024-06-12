const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklisted_creator, get_row_video_ids, get_archive_csv, log, logErr, delay, getInput } = require('./utils.js')

puppeteer.use(StealthPlugin())

let
    has_edit_pemissions = true,
    ask_before_adding = false

function update_playlist(use_cookie, headless, queue_delay, playlist_url, check_blacklisted, add_if_missing, report_contradictory) {
    if (add_if_missing === 0)
        has_edit_pemissions = false
    else if (add_if_missing === 1)
        ask_before_adding = true

    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()
        if (use_cookie)
            await login_with_cookie(page, playlist_url)
        else
            await normal_login(page, playlist_url, headless)
        
        try {
            // This is the + button which is needed to reveal the playlist adding video options
            await page.click('#showmediaurl')

            // this is to uncheck the 'add as temporary' box
            await page.waitForSelector("#addfromurl .checkbox .add-temp").then(button => button.click());
        } catch {
            await logErr("Can't add videos to this playlist")
            has_edit_pemissions = false
        }

        // return a 2d array of all video identifiers currently in the playlist
        let playlistSnapshot
        
        do {
            // Give the page a bit to load the playlist with all the videos
            await delay(2000)
            
            playlistSnapshot = await page.evaluate(() => {
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
        } while (!Object.keys(playlistSnapshot).length)
        
        let
            row_is_blacklisted,
            csv_row = 1,
            add_vid_attempts = 0,
            row_video_ids,
            included,
            should_queue = true,
            is_contradictory = false

        const
            blacklist_included = [],
            contradictory_included = []

        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

        // for each video in the archive, try adding it to
        // the cytube playlist if it isn't already present
        for (var archive_row of archive_data) {
            ++csv_row
            row_is_blacklisted = check_blacklisted && blacklisted_creator(archive_row)
            row_video_ids = await get_row_video_ids(archive_row)
            included = check_includes(playlistSnapshot, row_video_ids)

            if (row_is_blacklisted) {
                if (included.video_id) {
                    await logErr(`${csv_row}: blacklisted video found in playlist - ${archive_row[index.TITLE]}`)
                    blacklist_included.push(`${archive_row[index.TITLE]}  -  ${playlistSnapshot[included.video_id]}`)
                    delete playlistSnapshot[included.video_id]
                    continue
                }

                log(`${csv_row}: skipping blacklisted video`)
                continue
            }

            if (included.video_id) {
                switch (included.archive_index) {
                    case index.LINK:
                        if (!archive_row[index.STATE])
                            log(`${csv_row}: present`)
                        else
                            is_contradictory = true
                        break

                    case index.ALT_LINK:
                        if (archive_row[index.FOUND] !== "needed")
                            log(`${csv_row}: alt present`)
                        else
                            is_contradictory = true
                        break

                    default:
                        log(`${csv_row}: age-restriction bypassing link present`)
                }

                if (is_contradictory && report_contradictory) {
                    contradictory_included.push(
                        `${playlistSnapshot[included.video_id]} - ${archive_row[index.TITLE]}`
                    )

                    is_contradictory = false
                }
                
                delete playlistSnapshot[included.video_id]
                continue
            }

            // Add the first available url

            if (archive_row[index.NOTES].includes("age restriction")) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_add()) {
                    log("adding using age-restriction bypassing link...\n")
                    await page.type('#mediaurl', archive_row[index.NOTES].split(" ").at(-1))
                }
            }
            else if (!archive_row[index.STATE]) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_add()) {
                    log("adding...\n")
                    await page.type('#mediaurl', archive_row[index.LINK])
                }
            }
            else if (archive_row[index.FOUND] === "found") {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_add()) {
                    log("adding using alt link...\n")
                    await page.type('#mediaurl', archive_row[index.ALT_LINK])
                }
            }
            else if (row_video_ids.length === 3) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_add()) {
                    log("adding using link in notes...\n")
                    await page.type('#mediaurl', archive_row[index.NOTES].split(" ").at(-1))
                }
            }
            else {
                await logErr(`${csv_row}: no useable links for: ${archive_row[index.TITLE]}`)
                continue
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
            if (should_queue) {
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

            for (const video_identifiers of blacklist_included)
                logErr(video_identifiers, false)
            log()
        }

        if (Object.keys(playlistSnapshot).length !== 0) {
            log("Videos found in Cytube playlist that are duplicates or aren't in the archive")

            for (const url of Object.values(playlistSnapshot))
                logErr(url, false)
            log()
        }

        if (contradictory_included.length) {
            log("Videos found in playlist that shouldn't be according to archive labels")

            for (const video_identifier of contradictory_included)
                logErr(video_identifier, false)
            log()
        }

        if (!headless) getInput('')
        await browser.close()
    })
}

async function login_with_cookie(page) {
    let input = getInput('Authentication Cookie: ', true)
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

        cookie.value = getInput('Authentication Cookie: ', true)
    }
}

async function normal_login(page, url, headless) {
    await page.goto("https://cytu.be/login")

    if (headless) {
        let u_name, pass

        while (true) {
            u_name = getInput("Username: ", true)
            pass = getInput("Password: ", true)
            await page.type("#mainpage #username", u_name)
            await page.type("#mainpage #password", pass)

            try {
                await page.click("section#mainpage button.btn.btn-success.btn-block")
                await page.waitForSelector("div.alert.alert-success.messagebox.center", { timeout: 2500 })
                break
            }
            catch {}

            logErr("Invalid username or password", false)
            log()
        }
    }
    else {
        log("Please login through Cytube")
        await page.waitForSelector("div.alert.alert-success.messagebox.center", { timeout: 0 })
    }

    await page.goto(url)
}


id_indices = [index.LINK, index.ALT_LINK, index.NOTES]

function check_includes(playlist_snapshot, video_ids) {
    const ret = {archive_index: null, video_id: null}
    let id, i = 0

    for (;i < video_ids.length; ++i) {
        id = video_ids[i]

        if (typeof id === "string") {
            if (id in playlist_snapshot) {
                ret.video_id = id
                break
            }
        }
        // For Ponytube videos with two ids
        else if (id[0] in playlist_snapshot) {
            ret.video_id = id[0]
            break
        }
        else if (id[1] in playlist_snapshot) {
            ret.video_id = id[1]
            break
        }
    }

    if (ret.video_id !== null)
        ret.archive_index = id_indices[i]

    return ret    
}

function can_add() {
    return (
        has_edit_pemissions &&
        (
            !ask_before_adding ||
            getInput("Add this video to the playlist? (y/n)\n").toLowerCase() === "y"
        )
    )
}

module.exports = { update_playlist }