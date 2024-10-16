const puppeteer = require('puppeteer-extra')
const StealthPlugin = require('puppeteer-extra-plugin-stealth')

const { csv_map: index, blacklisted_creator, get_row_links, get_archive_csv, log, logErr, delay, getInput, vid_identifier } = require('./utils.js')

puppeteer.use(StealthPlugin())

let
    has_edit_permissions = true,
    ask_before_adding = false

function update_playlist(use_cookie, headless, queue_delay, playlist_url, check_blacklisted, add_if_missing, report_contradictory) {
    if (add_if_missing === 0)
        has_edit_permissions = false
    else if (add_if_missing === 1)
        ask_before_adding = true

    puppeteer.launch({ headless: headless}).then(async browser => {
        const page = await browser.newPage()
        if (use_cookie)
            await login_with_cookie(page, playlist_url)
        else
            await normal_login(page, playlist_url, headless)
        
        if (has_edit_permissions) {
            try {
                await delay(2000)
                // This is the + button which is needed to reveal the playlist adding video options
                await page.waitForSelector('#showmediaurl').then(button => button.click())
                await delay(1000)
                // this is to uncheck the 'add as temporary' box
                await page.waitForSelector("#addfromurl .checkbox .add-temp").then(button => button.click())
            } catch {
                await logErr("Can't add videos to this playlist")
                has_edit_permissions = false
            }
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

                for (const e of elements) {
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
            row_links,
            included,
            should_queue = true,
            is_contradictory = false

        const
            blacklist_included = [],
            contradictory_included = []

        const archive_data = await get_archive_csv('https://docs.google.com/spreadsheets/d/1rEofPkliKppvttd8pEX8H6DtSljlfmQLdFR-SlyyX7E/export?format=csv')

        // for each video in the archive, try adding it to
        // the cytube playlist if it isn't already present
        for (const archive_row of archive_data) {
            ++csv_row
            row_is_blacklisted = check_blacklisted && blacklisted_creator(archive_row)
            row_links = get_row_links(archive_row)
            included = await check_includes(playlistSnapshot, row_links)

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
                    contradictory_included.push({
                        href: playlistSnapshot[included.video_id],
                        archive_row: archive_row,
                    })

                    is_contradictory = false
                }
                
                delete playlistSnapshot[included.video_id]
                continue
            }

            // Add the first available url

            if (archive_row[index.NOTES].includes("age restriction")) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_update(ask_before_adding)) {
                    log("adding using age-restriction bypassing link...\n")
                    await page.type('#mediaurl', archive_row[index.NOTES].split(" ").at(-1))
                }
            }
            else if (!archive_row[index.STATE]) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_update(ask_before_adding)) {
                    log("adding...\n")
                    await page.type('#mediaurl', archive_row[index.LINK])
                }
            }
            else if (archive_row[index.FOUND] === "found") {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_update(ask_before_adding)) {
                    log("adding using alt link...\n")
                    await page.type('#mediaurl', archive_row[index.ALT_LINK])
                }
            }
            else if (row_links.length === 3) {
                log(`${csv_row}: not present - ${archive_row[index.TITLE]}`)

                if (should_queue = can_update(ask_before_adding)) {
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

            for (const bad_video of contradictory_included)
                logErr(`${bad_video.href} - ${bad_video.archive_row[index.TITLE]}`, false)
            log()

            if (has_edit_permissions && (getInput("Resolve contradictory items? (y/n): ").toLowerCase() === "y")) {
                
                log("Finding positions of bad entries in the playlist...")

                const class_ids = await page.$$eval(".queue_entry", (nodes, hrefs) => {
                    nodes = [...nodes].slice(1)
                    return nodes
                        .filter(node => hrefs.includes(node.querySelector(".qe_title").href))
                        .map(node => ({ node, href: node.querySelector(".qe_title").href }))
                        .sort((a, b) =>
                            hrefs.indexOf(a.href) -
                            hrefs.indexOf(b.href)
                        )
                        .map(({ node }) => node.classList[1])

                }, contradictory_included.map(e => e.href))

                let url_to_add, archive_row, bad_video

                for (let i = 0; i < contradictory_included.length; ++i) {
                    bad_video = contradictory_included[i]
                    archive_row = bad_video.archive_row

                    log(`\n${
                        bad_video.href} - ${bad_video.archive_row[index.TITLE]
                    }\nState: ${
                        archive_row[index.STATE]
                    }\nAlt url: ${
                        archive_row[index.FOUND]
                    }\nUrl in notes: ${
                        archive_row[index.NOTES].includes("://")
                    }`)

                    if (!archive_row[index.STATE])
                        url_to_add = archive_row[index.LINK]
                    else if (archive_row[index.FOUND] === "found")
                        url_to_add = archive_row[index.ALT_LINK]
                    else if (archive_row[index.NOTES].includes("://"))
                        // precondition: all urls in notes are at the end of the cell
                        url_to_add = archive_row[index.NOTES].split(" ").at(-1)
                    else {
                        logErr("No useable links found", false)
                        if (can_update(true, "Remove bad url only?")) {
                            if (await page.$('.server-msg-disconnect')) {
                                logErr('Disconnected from server because of duplicate login')
                                return
                            }
                        }
                        continue
                    }

                    if (can_update(true, "Remove bad url and replace with an alternative?")) {
                        if (await page.$('.server-msg-disconnect')) {
                            logErr('Disconnected from server because of duplicate login')
                            return
                        }
                        // btn.btn-xs.btn-default.qbtn-[tmp/delete]

                        log("Finding bad entry...")
                        await page.click(`.queue_entry.${class_ids[i]} .btn-group .qbtn-${headless ? 'delete' : 'tmp'}`)
                        if (!headless) {
                            if (getInput('Marked as temporary. Delete? (y/n)\n').toLowerCase() === "y") {
                                await page.click(`.queue_entry.${class_ids[i]} .btn-group .qbtn-delete`)
                                // Just to see
                                await delay(1000)
                            }
                        }

                        log("Adding replacement...")
                        await page.type('#mediaurl', url_to_add)
                        await page.click('#queue_end')
                        await delay(queue_delay + (!headless * 1000))
                    }
                }
            }
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

async function check_includes(playlist_snapshot, video_links) {
    const ret = {archive_index: null, video_id: null}
    let id, i = 0

    for (;i < video_links.length; ++i) {
        id = await vid_identifier(video_links[i])

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

function can_update(ask=true, msg="Add this video to the playlist?") {
    return (
        has_edit_permissions &&
        (
            !ask ||
            getInput(`${msg} (y/n)\n`).toLowerCase() === "y"
        )
    )
}

module.exports = { update_playlist }