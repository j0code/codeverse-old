import WebApp from "../webapp/main.mjs" // @j0code/webapp
import crypto from "crypto"
import UAParser from "ua-parser-js"
import fs from "fs/promises"

const port = 25560
const host = `cohalejoja.selfhost.eu:${port}`
const base_url = `https://${host}`

const statusCodes = {
  success: { httpCode: 200, status: { code: "success", description: "Success" }},
  invalid: { httpCode: 500, status: { code: "invalid", description: "Invalid" }},
  username_taken: { httpCode: 500, status: { code: "username_taken", description: "Username already taken" }},
  user_unknown: { httpCode: 500, status: { code: "user_unknown", description: "Wrong username or password" }},
  server_error: { httpCode: 500, status: { code: "server_error", description: "General error" }},
  no_session: { httpCode: 401, status: { code: "no_session", description: "No session" }},
  session_expired: { httpCode: 401, status: { code: "session_expired", description: "Session expired, or unknown" }},
  wrong_syntax: { httpCode: 500, status: { code: "wrong_syntax", description: "Wrong syntax, e.g. required value missing" }},
  wrong_password: { httpCode: 500, status: { code: "wrong_password", description: "Wrong password" }},
  passwords_match: { httpCode: 500, status: { code: "passwords_match", description: "Current and new passwords must not match" }}
}

const sql_options = {
  host: "localhost",
  user: "root",
  password: "i.Cc:NLsJ92MByk",
  database: "codeverse"
}

var app = new WebApp(port, sql_options, () => {}, (query, e1) => {
  query("CREATE TABLE IF NOT EXISTS `accounts` (`id` INT AUTO_INCREMENT PRIMARY KEY, `username` VARCHAR(16) UNIQUE NOT NULL, `password` VARCHAR(256) NOT NULL, `email` VARCHAR(32) NOT NULL, `birthdate` DATETIME NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `verified` BOOLEAN DEFAULT FALSE, `emailverified` BOOLEAN DEFAULT FALSE)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("accounts table created")
  })
  query("CREATE TABLE IF NOT EXISTS `sessions` (`sessionid` INT AUTO_INCREMENT PRIMARY KEY, `id` INT, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `expires` DATETIME NOT NULL, `address` VARCHAR(39) NOT NULL, `agent` JSON NOT NULL, `token` VARCHAR(256) NOT NULL)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("Table created")
  })
  query("CREATE TABLE IF NOT EXISTS `profile` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(32) NOT NULL, `bio` VARCHAR(1024) NOT NULL)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("Table created")
  })
})

app.node("register", (req, data, res) => {
  var check = checkRegister(data)
  if(!check) {
    // valid -> create acc
    app.query(`SELECT * FROM accounts WHERE username = "${data.username}"`, (err, result, fields) => {
      if(err) throw err
      if(result.length == 0) {
        // hash password
        var pw_hash = hash256(data.password)
        console.log("HASH " + data.password + " -> " + pw_hash) // debug log
        // covert date
        var sqldate = new Date(data.birthdate).toISOString().slice(0, -1).replace('T', ' ')
        // put on db
        app.query(`INSERT INTO \`accounts\` (\`username\`, \`password\`, \`email\`, \`birthdate\`) VALUES ("${data.username}", "${pw_hash}", "${data.email}", "${sqldate}")`, (err, result) => {
          if(err) throw err
          console.log("Created account!") // debug log
          getAccount("username", data.username, acc => {
            createSession(acc, req, res)
          })
        })
      } else {
        // username already taken
        respond(res, statusCodes.username_taken, "") // temp
        console.log("uat")
      }
    })
  } else {
    // invalid
    respond(res, statusCodes.invalid, {details: check}) // temp
    console.log("inv")
  }
})

app.node("account", (req, data, res) => {
  auth(req, res, session => {
    getAccount("id", session.id, acc => {
      respond(res, statusCodes.success, {username: acc.username, email: acc.email, creation: acc.creation, birthdate: acc.birthdate})
    })
  })
})

app.node("account/changepw", (req, data, res) => {
  auth(req, res, session => {
    if(!data.current_password || !data.new_password) return respond(res, statusCodes.wrong_syntax)
    if(data.current_password == data.new_password) return respond(res, statusCodes.passwords_match)
    getAccount("id", session.id, acc => {
      var pw_hash = hash256(data.current_password)
      if(pw_hash != acc.password) return respond(res, statusCodes.wrong_password)
      pw_hash = hash256(data.new_password)
      app.query(`UPDATE accounts SET password = '${pw_hash}' WHERE id = '${session.id}'`, (e, result, fields) => {
        if(e) {
          respond(res, statusCodes.server_error)
          throw e
        }
        respond(res, statusCodes.success)
        deleteSessions(id, acc.id)
      })
    })
  })
})

app.node("profile", (req, data, res) => {
  auth(req, res, session => {
    getAccount(data.username ? "username" : "id", data.username ? data.username : session.id, acc => {
      var o = {username: acc.username, creation: acc.creation}
      getProfile("id", acc.id, profile => {
        o.name = profile.name
        o.bio = profile.bio
        respond(res, statusCodes.success, o)
      }, e => {
        if(e && e != "no_result") console.error("profile Error:", e)
        o.name = ""
        o.bio = ""
        respond(res, statusCodes.success, o)
      })
    }, e => {
      if(e) console.error("profile Error:", e)
      respond(res, statusCodes.user_unknown)
    })
  })
})

app.node("sessions", (req, data, res) => {
  auth(req, res, session => {
    getSessions("id", session.id, sessions => {
      var a = []
      for(var s of sessions) {
        a.push({address: s.address, agent: JSON.parse(s.agent), creation: s.creation, expires: s.expires})
      }
      respond(res, statusCodes.success, a)
    })
  })
})

app.node("login", (req, data, res) => {
  if(!data.password || !data.username) return respond(res, statusCodes.wrong_syntax)
  getAccount("username", data.username, acc => {
    // check pw hash
    var pw_hash = hash256(data.password)
    console.log("HASH " + data.password + " -> " + pw_hash)
    if(acc.password != pw_hash) return respond(res, statusCodes.user_unknown)
    createSession(acc, req, res)
  }, e => {
    if(e == "no_result") respond(res, statusCodes.user_unknown)
    else console.error("login Error:", e)
  })
})

app.node("logout", (req, data, res) => {
  res.cookie("session", "", {path: "/", httpOnly: true, secure: true, maxAge: 0}) // delete cookie
  res.end() // no response
  // delete session
  if(!req.get("cookie")) return
  if(req.get("cookie")) var cookies = parseCookie(req.get("cookie"))
  if(!cookies.session) return
  deleteSessions("token", cookies.session, () => {}, e => {
    if(e) console.error("logout Error: ", e)
  }) // delete session
})

app.get(["/js/*","/css/*","/api.mjs","/cookie.mjs","/favicon.ico"], (req, res) => {
  sendFile(req.url, res)
})

app.get("/", (req, res) => {
  sendFile("/index.html", res, {"X-Content-Type-Options": "nosniff"})
})

app.get("/login", (req, res) => sendComposedFile(res, "/login"))
app.get("/register", (req, res) => sendComposedFile(res, "/register"))
app.get("/account", (req, res) => sendComposedFile(res, "/account"))
app.get("/account/changepw", (req, res) => sendComposedFile(res, "/account/changepw"))
app.get("/profile*", (req, res) => sendComposedFile(res, "/profile"))
app.get("/sessions", (req, res) => sendComposedFile(res, "/sessions"))

app.get("*", (req, res) => {
  res.redirect("/")
})

function sendFile(path, res, headers) {
  res.sendFile("." + path, {root: process.cwd() + "/docs/", headers}, e => {
    if(e) {
      console.error(e)
      if(e.code == "ENOTFOUND") {
        res.writeHead(404)
        res.end("404 Not Found")
        return
      }
      res.writeHead(500)
      res.end("500 Internal Server Error")
    }
  })
}

function sendComposedFile(res, path) {
  fs.readFile(process.cwd() + "/docs/head.html", {encoding: "utf8"}).then(head => {
    fs.readFile(process.cwd() + "/docs" + path + "/index.html", {encoding: "utf8"}).then(body => {
      res.set("Cache-Control", "no-cache")
      res.set("X-Content-Type-Options", "nosniff")
      res.send(`${head}\n<body>\n${body}</body></html>`)
    })
  })
}

function respond(res, status, data) {
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

function auth(req, res, callback, onerr) {
  // check session cookie
  if(req.get("cookie")) var cookies = parseCookie(req.get("cookie"))
  if(!req.get("cookie") || !cookies.session) {
    respond(res, statusCodes.no_session)
    if(onerr) onerr("no_token")
    else console.error("auth ERROR: no_session (no_token)")
    return
  }
  // find session
  app.query(`SELECT * FROM sessions WHERE token = "${cookies.session}"`, (e, result, fields) => {
    if(e) throw e
    if(result.length == 0) {
      res.setHeader("Location", base_url + "/login")
      respond(res, statusCodes.no_session)
      if(onerr) onerr("unknown_session")
      else console.error("auth ERROR: no_session (unknown_session)")
      return
    }
    var session = result[0]
    // match session
    var raw_agent = JSON.parse(session.agent).raw
    if(session.address != req.ip || raw_agent != req.get("user-agent")) {
      respond(res, statusCodes.no_session)
      if(onerr) onerr("session_mismatch")
      else console.error("auth ERROR: no_session (session_mismatch)")
      return
    }
    if(session.expires.getTime() < Date.now()) { // session expired
      respond(res, statusCodes.session_expired)
      deleteSessions("token", cookies.session) // delete session
      if(onerr) onerr("session_expired")
      else console.error("auth ERROR: no_session (session_expired)")
      return
    }
    if(callback) callback(result[0])
  })
}

function getAccount(row, check, callback, onerr) {
  app.query(`SELECT * FROM accounts WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
    if(e) {
      if(onerr) onerr(e)
      else {
        console.error("getAccount Error:", e)
      }
      return
    }
    if(result.length == 0) {
      if(onerr) onerr("no_result")
      else {
        console.error("getAccount ERROR: no result")
      }
      return
    }
    if(callback) callback(result[0])
  })
}

function getProfile(row, check, callback, onerr) {
  app.query(`SELECT * FROM profile WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
    if(e) {
      if(onerr) onerr(e)
      else {
        console.error("getProfile Error:", e)
      }
      return
    }
    if(result.length == 0) {
      if(onerr) onerr("no_result")
      else {
        console.error("getProfile ERROR: no result")
      }
      return
    }
    if(callback) callback(result[0])
  })
}

function getSession(row, check, callback, onerr) {
  app.query(`SELECT * FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
    if(e) {
      if(onerr) onerr(e)
      else {
        console.error("getSession Error:", e)
      }
      return
    }
    if(result.length == 0) {
      if(onerr) onerr("no_result")
      else {
        console.error("getSession ERROR: no result")
      }
      return
    }
    if(callback) callback(result[0])
  })
}

function getSessions(row, check, callback, onerr) {
  app.query(`SELECT * FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
    if(e) {
      if(onerr) onerr(e)
      else {
        console.error("getSession Error:", e)
      }
      return
    }
    if(callback) callback(result)
  })
}

function deleteSessions(row, check, callback, onerr) {
  app.query(`DELETE FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
    if(e) {
      if(onerr) onerr(e)
      else {
        console.error("deleteSessions Error:", e)
      }
      return
    }
    if(callback) callback(result)
  })
}

function createSession(acc, req, res) {
  // create session
  var uagent = UAParser(req.get("user-agent"))
  console.log(`User Agent: ${uagent.browser.name}/${uagent.browser.major} on ${uagent.os.name}`)
  var token = hash256(Math.random()+"") // random hash
  // check exists
  app.query(`SELECT * FROM sessions WHERE token = "${token}"`, (e, result, fields) => {
    if(e) throw e
    if(result.length != 0) return respond(res, statusCodes.server_error, "Generated session token already exists. Please try again.")
    // insert session into table
    var date = new Date(Date.now() + (1000*60*60*24)) // expires in 1 day
    var sqldate = date.toISOString().slice(0, -1).replace('T', ' ') // convert into YYYY-MM-DD hh:mm:ss format
    app.query(`INSERT INTO \`sessions\` (\`id\`, \`expires\`, \`address\`, \`agent\`, \`token\`) VALUES ("${acc.id}", "${sqldate}", "${req.ip}", "${JSON.stringify({raw: req.get("user-agent"), parsed: uagent}).replaceAll("\"", "\\\"")}", "${token}")`, (e, result) => {
      if(e) throw e
      console.log("Created session!") // debug log
      res.cookie("session", token, {path: "/", httpOnly: true, secure: true})
      respond(res, statusCodes.success, "")
    })
  })
}

function checkRegister(data) {
  if(data.password && data.username && data.email && data.birthdate) {
		if(data.username.length >= 3) {
			if(data.password.length >= 8) {
				if(data.email != "" && /\S+@\S+\.\S+/.test(data.email)) {
					var time = new Date();
					var birthdate = null;
					try {
						birthdate = new Date(data.birthdate);
					} catch(e) {
						return "Invalid date";
					}
					var years = time.getUTCFullYear() - birthdate.getUTCFullYear();
					if(years > 13) return;
					else if(years == 13) {
						if(birthdate.getUTCMonth() > time.getUTCMonth) return;
						else if(birthdate.getUTCMonth() == time.getUTCMonth) {
							if(birthdate.getUTCDate() >= time.getUTCDate) return;
							else return "Too young (min: 13)";
						} else return "Too young (min: 13)";
					} else return "Too young (min: 13)";
				} else return "Invalid email address";
			} else return "Passwort too short (min: 8)";
		} else return "Username too short (min: 3)";
	} else return "Invalid or incomplete";
}

function hash256(a) {
  var hash = crypto.createHash("sha256")
  hash.update(a)
  return hash.digest("hex")
}

function parseCookie(cookie) {
  var cookies = cookie.split(";")
  var o = {}
  for(var i = 0; i < cookies.length; i++) {
    var kv = cookies[i].split("=")
    if(kv.length != 2) continue
    o[kv[0]] = kv[1]
  }
  return o
}
