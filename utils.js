const https = require('https')
const { parse } = require('csv-parse');
require('dotenv').config()

// just to access csv row values by name rather than by number
const csv_map = Object.freeze({
    LINK: 3,
    TITLE: 4,
    STATE: 7,
    ALT_LINK: 8,
    FOUND: 9
})

const env = {
    // used as a login token or api key or whatever it is
    "cookie": {
        'name': 'auth',
        'value': process.env.AUTH_COOKIE,
        'domain': '.cytu.be'
    },
    "channel": 'https://cytu.be/r/' + process.env.CHANNEL
}

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
function vid_identifier(str) {
    str = str.split('/')
    if (!str.at(-1)) {
        return str.at(-2) + "/"
    }
    
    return str.at(-1)
}

// This is for the coolooorrrs
function log(msg) { console.log('\u001b[1;33m' + msg) }

function logErr(msg) { console.log('\u001b[1;31m' + msg) }

// verbatim, essentially sleep() function
const delay = ms => new Promise(res => setTimeout(res, ms));

class Node {
    value
    next
    constructor(value) { this.value = value }
}

class LinkedList {
    head
    tail
    size = 0
    current

    constructor(array) {
        for (var v of array) {
            this.push(v)
        }
    }

    includes(key) {
        let temp = this.head
        if (!temp) return false

        if(temp.value == key) {
            this.head = temp.next
            --this.size
            return true
        }

        while (temp.next) {
           if (temp.next.value == key) {
            temp.next = temp.next.next
            --this.size
            return true
           }
           temp = temp.next
        }
        return false
    }

    push(value) {
        if (this.head) {
            let temp = new Node(value)
            this.tail.next = temp
            this.tail = temp
        } else {
            this.head = new Node(value)
            this.tail = this.head
        }
        ++this.size
    }

    shift() {
        if (this.head) {
            this.head = this.head.next
            --this.size
        }
    }
}

module.exports = { csv_map, get_archive_csv, log, logErr, env, delay, vid_identifier }