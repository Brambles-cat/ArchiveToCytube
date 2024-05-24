const { update_playlist } = require('./cytube_auto.js')
const { getInput, logErr, log, setErrDelay } = require('./utils.js')
require('dotenv').config()


function get_flags() {
  let args = process.argv.slice(2)
  if (args.length == 0) args = process.env.DEFAULT_FLAGS.trimEnd().split(' ')
  if (args[0] === '') args = []
  let flags = {}

  const boolean = ['-show', '-checkblacklisted']
  const delay = ['-queuedelay', '-errdelay']

  // smollest bit of redundancy fixable with stacks, but inconsequential
  args.forEach(arg => {

    for (var b_flag of boolean) {
      if (arg === b_flag) {
        flags[b_flag] = true
        return
      }
    }

    for (var d_flag of delay) {
      if (!arg.startsWith(d_flag)) continue
      const val = parseInt(arg.slice(d_flag.length))
      if (isNaN(val))
        logErr(`${d_flag} must have a value, e.g. ${d_flag}1000`)

      flags[d_flag] = val
      return
    }

    logErr(`${arg} is not a valid flag`, false)
    
  })

  for (var d_flag of delay) 
    if (flags[d_flag] === undefined) flags[d_flag] = 2000

  return flags
}

async function main() {
  const flags = get_flags()
  if (!process.env.CHANNEL) {
    logErr('No Channel specificed in .env', false)
    return
  }

  const channel_url = `https://cytu.be/r/${process.env.CHANNEL}`
  log()

  // Effectively the same as a Token or API key for cytube required for adding videos to the playlist
  // Can be found by visiting cytube while logged in
  // Inspect page -> Application -> Cookies -> Value of row auth
  let cookie = await getInput('Authentication Cookie: ', true)

  cookie =  {
    'name': 'auth',
    'value': cookie,
    'domain': '.cytu.be'
  }

  setErrDelay(flags['-errdelay'])

  update_playlist(
    cookie            = cookie,
    headless          = !flags['-show'],
    queue_delay       = flags['-queuedelay'],
    url               = channel_url,
    check_blacklisted = flags['-checkblacklisted']
  )
}

main()