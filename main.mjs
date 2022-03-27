import https from "https"
import express from "express"
import fs from "fs/promises"
import * as iolib from "socket.io"
import config from "./config-loader.mjs"
import sql from "./sql.mjs"
import { legacy_auth as auth, adminauth, getAccount, getProfile, getSession, getSessions, deleteSessions, createSession } from "./sql.mjs"
import APIClient from "./apiclient.mjs"
import { parseCookie, hash256, respond } from "./util.mjs"

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

const app = express()
const httpsServer = https.createServer(config.https, app)
export const io = new iolib.Server(httpsServer, {
	cors: {
		origin: "https://j0code.ddns.net",
		methods: ["GET", "POST"]
	}
})

httpsServer.listen(config.port, () => { console.log(`Server is running on ${config.port}`) }) // debug log

io.on("connection", socket => new APIClient(io, socket))

io.on("error", console.error)

/*app.node("register", (req, data, res) => {
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
      var o = {id: acc.id, username: acc.username, creation: acc.creation}
      getProfile("id", acc.id, profile => {
        o.name = profile.name
        o.bio = profile.bio
        o.sex = profile.sex || null
        o.pronouns = profile.pronouns || null
        o.color = null
        if(profile.color_hex) o.color = "#" + profile.color_hex
        respond(res, statusCodes.success, o)
      }, e => {
        if(e && e != "no_result") console.error("profile Error:", e)
        o.name = ""
        o.bio = ""
        o.sex = null
        o.pronouns = null
        o.color = null
        respond(res, statusCodes.success, o)
      })
    }, e => {
      if(e) console.error("profile Error:", e)
      respond(res, statusCodes.user_unknown)
    })
  })
})

app.node("profile/edit", (req, data, res) => {
  auth(req, res, session => {
    var sex = data.sex || null
    var pronouns = data.pronouns || null
    var color = data.color || null
    if(sex) sex = `"${sex}"`
    if(pronouns) pronouns = `"${pronouns}"`
    if(color) {
      if(color.startsWith("#")) color = color.substr(1)
      color = `unhex("${color}")`
    }
    getProfile("id", session.id, profile => { // profile exists -> update
      app.query(`UPDATE \`profile\` SET name="${data.name || ""}", bio="${data.bio || ""}", sex=${sex}, pronouns=${pronouns}, color=${color} WHERE id=${session.id}`, (err, result) => {
        if(err) throw err
        console.log("Updated profile!", result) // debug log
        respond(res, statusCodes.success)
      })
    }, e => { // profile does not exist -> create
      if(e != "no_result") console.error("profile/edit Error:", e)
      app.query(`INSERT INTO \`profile\` (\`id\`, \`name\`, \`bio\`, \`sex\`, \`pronouns\`, \`color\`) VALUES ("${session.id}", "${data.name || ""}", "${data.bio || ""}", ${sex}, ${pronouns}, ${color})`, (err, result) => {
        if(err) throw err
        console.log("Created profile!", result) // debug log
        respond(res, statusCodes.success)
      })
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
})*/

// temp
app.post("/api/login", (req, res) => {
	let data = []
  req.on("data", chunk => data.push(chunk)) // construct body
  req.on("end", () => {
    data = Buffer.concat(data).toString()
    try {
      data = JSON.parse(data)
    } catch(err) {}
    console.log("data:", data)
    res.setHeader("Content-Type", "application/json")
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
})

/*app.node("logout", (req, data, res) => {
  res.cookie("session", "", {path: "/", httpOnly: true, secure: true, maxAge: 0}) // delete cookie
  res.end() // no response
  // delete session
  if(!req.get("cookie")) return
  if(req.get("cookie")) var cookies = parseCookie(req.get("cookie"))
  if(!cookies.session) return
  deleteSessions("token", cookies.session, () => {}, e => {
    if(e) console.error("logout Error: ", e)
  }) // delete session
})*/

app.get(["/js/*","/css/*","/api.mjs","/cookie.mjs","/favicon.ico"], (req, res) => {
  sendFile(req.url, res)
})

app.get("/", (req, res) => {
  sendFile("/index.html", res, {"X-Content-Type-Options": "nosniff"})
})

app.get("/login", (req, res) => sendComposedFile(req, res, "/login"))
app.get("/register", (req, res) => sendComposedFile(req, res, "/register"))
app.get("/account", (req, res) => sendComposedFile(req, res, "/account"))
app.get("/account/changepw", (req, res) => sendComposedFile(req, res, "/account/changepw"))
app.get("/profile*", (req, res) => sendComposedFile(req, res, "/profile"))
app.get("/sessions", (req, res) => sendComposedFile(req, res, "/sessions"))

// replacement for phpMyAdmin
app.get("/admin", (req, res) => {
  console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url}`)
  adminauth(req, res, session => {
    console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url} -> 200 OK (Admin Identified)`)
    sendFile("/admin/index.html", res, {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})
  }, e => {
    if(typeof e == "string") console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url} -> 401 Unauthorized`)
    else console.error("GET /admin* Error:", e)
    res.redirect("/login")
  })
})

app.get("/admin/*", (req, res) => {
  console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url}`)
  adminauth(req, res, session => {
    console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url} -> 200 OK (Admin Identified)`)
    sendFile(req.url, res, {"Cache-Control": "no-cache", "X-Content-Type-Options": "nosniff"})
  }, e => {
    if(typeof e == "string") console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url} -> 401 Unauthorized`)
    else console.error("GET /admin/* Error:", e)
    res.redirect("/login")
  })
})

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

function sendComposedFile(req, res, path) {
  console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url}`)
  fs.readFile(process.cwd() + "/docs/head.html", {encoding: "utf8"}).then(head => {
    fs.readFile(process.cwd() + "/docs" + path + "/index.html", {encoding: "utf8"}).then(body => {
      res.set("Cache-Control", "no-cache")
      res.set("X-Content-Type-Options", "nosniff")
      res.send(`${head}\n<body>\n${body}</body></html>`)
      console.log(`[${req.socket.remoteAddress}] ${req.method.toUpperCase()} ${req.url} -> 200 OK`)
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
