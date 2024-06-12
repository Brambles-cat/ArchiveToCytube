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
    throw new Error(`\"${v}\" given instead of an integer. Expected a number`)

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
    show                  = get(process.env.SHOW),
    blacklist_check       = get(process.env.CHECK_BLACKLISTED),
    use_auth_cookie       = get(process.env.USE_AUTH_COOKIE),
    report_contradictions = get(process.env.REPORT_CONTRADICTORY_VIDEOS)

  let add_if_missing_setting

  switch (process.env.ADD_IF_MISSING.toLowerCase()) {
    case "true":
      add_if_missing_setting = 2
      break
    case "ask":
      add_if_missing_setting = 1
      break
    default:
      add_if_missing_setting = 0
  }

  setErrDelay(error_delay)

  update_playlist(
    use_cookie           = use_auth_cookie,
    headless             = !show,
    queue_delay          = q_delay,
    url                  = channel_url,
    check_blacklisted    = blacklist_check,
    add_if_missing       = add_if_missing_setting,
    report_contradictory = report_contradictions
  )
}

main()