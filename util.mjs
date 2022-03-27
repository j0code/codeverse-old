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

export function respond(res, status, data) {
  if(!res) return
  if(data == undefined) data = {}
  if(!status || typeof data != "object") {
    res.writeHead(500)
    res.end(JSON.stringify({status: (status || statusCodes.server_error).status, data: {}}))
    return
  }
  data = data || {}
  var o = { status: status.status, data }
  res.writeHead(status.httpCode)
  res.end(JSON.stringify(o))
  //console.log("o", o)
}
