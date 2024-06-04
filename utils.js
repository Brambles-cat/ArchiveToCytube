const https = require('https')
const { parse } = require('csv-parse');
const readline = require('readline-sync')
const cheerio = require('cheerio')

// just to access csv row values by name rather than by number
const csv_map = Object.freeze({
    LINK: 3,
    TITLE: 4,
    CHANNEL: 5,
    STATE: 7,
    ALT_LINK: 8,
    FOUND: 9,
    NOTES: 10
})

// returns a 2d array representing the csv file (without including the first row)
function parse_csv(csv_text) {
    return new Promise((resolve, reject) => {
        const csv_data = [];
        const parser = parse(csv_text, { columns: false, trim: true })
        
        parser
        .on('data', (csvrow) => {
            csv_data.push(csvrow);
        })

        .on('end', () => {
            csv_data.shift()
            resolve(csv_data)
        })

        .on('error', (error) => {
            reject(error)
        })
    })
}

// returns up to date archive csv by using a download link to the google sheet
function get_archive_csv(url, maxRedirects = 3) {
    return new Promise((resolve, reject) => {
        if (maxRedirects < 0) {
            reject(new Error('Too many redirects'));
        } else {
            https.get(url, (response) => {
                    if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                        // Handle redirect
                        get_archive_csv(response.headers.location, maxRedirects - 1)
                            .then(resolve)
                            .catch(reject);
                    } else {
                        // No redirect, process response
                        let data = '';
                        response.on('data', (chunk) => {
                            data += chunk;
                        });
                        response.on('end', async () => {
                            resolve(await parse_csv(data));
                        });
                    }
                }
            
            ).on('error', (err) => {
                reject(err);
            });
        }
    });
}

// returns the part of the link that identifies the video
// luckily the value differes between youtube, ponytube, and
// bilibili as far as I can tell
async function vid_identifier(url) {
    let ponytube_url

    if (url.startsWith("https://pony.tube")) {
        ponytube_url = await get_ponytube_true_url(url)
    }

    url = url.split("/")
    if (ponytube_url) {
        ponytube_url = ponytube_url.split("/")
        return ponytube_url.at(-1) === url.at(-1) ? url.at(-1) : [ponytube_url.at(-1), url.at(-1)]
    }

    // bilibili only so far
    if (!url.at(-1)) {
        return url.at(-2) + "/"
    }

    return url.at(-1)
}

function blacklisted_creator(archive_row) {
    return archive_row[csv_map.CHANNEL].startsWith('[BLACKLIST]')
}

// This is for the coolooorrrs
function log(msg = '') { console.log('\u001b[1;33m' + msg) }

let err_delay
function setErrDelay(ms) { err_delay = ms }

async function logErr(msg, should_wait = true) {
    console.log('\u001b[1;31m' + msg)
    if (should_wait) await delay(err_delay)
}

// verbatim, essentially sleep() function
const delay = ms => {
    return new Promise(res => setTimeout(res, ms))
}

async function getInput(prompt, is_sensitive) {
    return readline.question(prompt, {
        hideEchoBack: is_sensitive
    })
}

function get_ponytube_true_url(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            var data = "";
            response.on('data', (chunk) => {
                data += chunk.toString();
            })

            response.on('end', () => {
                const $ = cheerio.load(data)
                const metaTag = $('meta[property="og:url"]')
                const content = metaTag.attr('content')
                resolve(content)
            })

            response.on('err', (error) => {
                reject(error);
            })
        });
    })
}

async function get_row_video_ids(archive_row) {
    const split_notes = archive_row[csv_map.NOTES].split(" ")
    const notes_url = split_notes.at(-1).includes("://") ? split_notes.at(-1) : null
    const ret = [archive_row[csv_map.LINK], archive_row[csv_map.ALT_LINK]]

    if (notes_url)
        ret.push(notes_url)

    return Promise.all(ret.map(async url => await vid_identifier(url)))
}

function check_includes(playlist_snapshot, video_id) {
    const ret = {id: 0, in_snapshot: true}
    if (typeof video_id === "string") {
        ret.id = video_id
        ret.in_snapshot = video_id in playlist_snapshot
        return ret
    }
    // Ponytube video with two ids
    else if (video_id[0] in playlist_snapshot) {
        ret.id = video_id[0]
    }
    else {
        ret.id = video_id[1]
        ret.in_snapshot = video_id[1] in playlist_snapshot
    }

    return ret
}

module.exports = {
    getInput,
    csv_map,
    get_archive_csv,
    check_includes,
    log,
    logErr,
    delay,
    blacklisted_creator,
    get_row_video_ids,
    setErrDelay
}