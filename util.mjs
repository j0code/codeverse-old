import crypto from "crypto"

export function logEvent(ip, method, ...args) {
  console.log(`[${ip}] ${method} ${args.join(" ")}`)
}

export function hash256(a) {
  var hash = crypto.createHash("sha256")
  hash.update(a)
  return hash.digest("hex")
}

export function parseCookie(cookie) {
  var cookies = cookie.split(";")
  var o = {}
  for(var i = 0; i < cookies.length; i++) {
    var kv = cookies[i].split("=")
    if(kv.length != 2) continue
    o[kv[0]] = kv[1]
  }
  return o
}
