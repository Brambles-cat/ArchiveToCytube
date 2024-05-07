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
    if (url.startsWith("https://pony.tube")) {
        url = await get_ponytube_id(url)
    }

    url = url.split('/')
    if (!url.at(-1)) {
        return url.at(-2) + "/"
    }

    return url.at(-1)
}

function blacklist_check(video_data) {
    return video_data[csv_map.CHANNEL].startsWith('[BLACKLIST]')
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

function get_ponytube_id(url) {
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

module.exports = {
    getInput,
    csv_map,
    get_archive_csv,
    vid_identifier,
    log,
    logErr,
    delay,
    blacklist_check,
    setErrDelay
}