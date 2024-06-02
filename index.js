const { update_playlist } = require('./cytube_auto.js')
const { logErr, log, setErrDelay, blacklist_check } = require('./utils.js')
require('dotenv').config()


function get(v) {
  if (v === undefined || v.toLowerCase() === "false")
    return false

  if (v.toLowerCase() === "true")
    return true

  throw new Error(`\"${v}\" used for boolean variable. Expected \"true\" or \"false\"`)
}

function int(v) {
  if (v === undefined)
    return 1000

  const ret = parseInt(v)

  if (isNaN(ret))
    throw new Error(`\"${v}\" used for integer variable. Expected a number`)

  return parseInt(v)
}

async function main() {
  if (!process.env.CHANNEL) {
    logErr('No Channel specificed in .env', false)
    return
  }

  const channel_url = `https://cytu.be/r/${process.env.CHANNEL}`
  log()

  const
    q_delay     = int(process.env.QUEUE_DELAY),
    error_delay = int(process.env.ERROR_DELAY)

  const
    show              = get(process.env.SHOW),
    blacklist_check   = get(process.env.CHECK_BLACKLISTED),
    use_auth_cookie   = get(process.env.USE_AUTH_COOKIE)

  setErrDelay(error_delay)

  update_playlist(
    use_cookie        = use_auth_cookie,
    headless          = !show && !use_auth_cookie,
    queue_delay       = q_delay,
    url               = channel_url,
    check_blacklisted = blacklist_check
  )
}

main()