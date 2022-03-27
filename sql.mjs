import * as sqllib from "mysql"
import UAParser from "ua-parser-js"
import config from "./config-loader.mjs"
import { parseCookie, hash256, respond } from "./util.mjs"

const sql = sqllib.createConnection(config.sql)

// temp
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

sql.connect(e => {
	if(e) {console.log(e);return}
	console.log("Connected to mySQL!")

	sql.query("CREATE TABLE IF NOT EXISTS `accounts` (`id` INT AUTO_INCREMENT PRIMARY KEY, `username` VARCHAR(16) UNIQUE NOT NULL, `password` VARCHAR(256) NOT NULL, `email` VARCHAR(32) NOT NULL, `birthdate` DATETIME NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `verified` BOOLEAN DEFAULT FALSE, `emailverified` BOOLEAN DEFAULT FALSE)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("accounts table created")
  })
  sql.query("CREATE TABLE IF NOT EXISTS `sessions` (`sessionid` INT AUTO_INCREMENT PRIMARY KEY, `id` INT NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `expires` DATETIME NOT NULL, `address` VARCHAR(39) NOT NULL, `agent` JSON NOT NULL, `token` VARCHAR(256) NOT NULL)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("sessions table created")
  })
  sql.query("CREATE TABLE IF NOT EXISTS `profile` (`id` INT AUTO_INCREMENT PRIMARY KEY, `name` VARCHAR(32) NOT NULL, `bio` VARCHAR(1024) NOT NULL, `sex` ENUM(\"m\", \"f\", \"d\"), `pronouns` ENUM(\"any\", \"male\", \"female\", \"neutral\", \"animate\", \"inanimate\"), `color` BINARY(3))", (e, result) => {
    if(e) {console.log(e);return}
    console.log("profile table created")
  })
})

export default sql

export function legacy_auth(req, res, callback, onerr) {
  // check session cookie
  if(req.get("cookie")) var cookies = parseCookie(req.get("cookie"))
  if(!req.get("cookie") || !cookies.session) {
    respond(res, statusCodes.no_session)
    if(onerr) onerr("no_token")
    else console.error("auth ERROR: no_session (no_token)")
    return
  }
  // find session
  sql.query(`SELECT * FROM sessions WHERE token = "${cookies.session}"`, (e, result, fields) => {
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
    var raw_agent = JSON.parse(session.agent).ua
    if(session.address != req.ip || raw_agent != req.get("user-agent")) {
      if(onerr) onerr("session_mismatch")
      else {
        respond(res, statusCodes.no_session)
        console.error("auth ERROR: no_session (session_mismatch)")
      }
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

export function auth(token, ip, uagent) {
	return new Promise((resolve, reject) => {
		// find session
	  sql.query(`SELECT * FROM sessions WHERE token = "${token}"`, (e, result, fields) => {
	    if(e) throw e
	    if(result.length == 0) {
	      res.setHeader("Location", base_url + "/login")
	      if(reject) reject({ reason: "unknown_session" })
	      else console.error("auth ERROR: no_session (unknown_session)")
	      return
	    }
	    var session = result[0]
	    // match session
	    var raw_agent = JSON.parse(session.agent).ua
	    if(session.address != ip || raw_agent != uagent) {
	      if(reject) reject({ reason: "session_mismatch", addr: session.address, ip, raw_agent, uagent })
	      else {
	        console.error("auth ERROR: no_session (session_mismatch)")
	      }
	      return
	    }
	    if(session.expires.getTime() < Date.now()) { // session expired
	      deleteSessions("token", cookies.session) // delete session
	      if(reject) reject({ reason: "session_expired" })
	      else console.error("auth ERROR: no_session (session_expired)")
	      return
	    }
	    if(resolve) resolve(result[0])
	  })
	})
}

export function adminauth(req, res, callback, onerr) {
  auth(req, res, session => {
    if(session.id != 1) {
      if(onerr) onerr("not_admin")
      else {
        respond(res, statusCodes.no_session)
        console.error("adminauth ERROR: no_session (not_admin)")
      }
      return
    }
    getAccount("id", session.id, account => {
      if(account.username != "j0code" || !account.verified) {
        if(onerr) onerr("not_admin")
        else {
          respond(res, statusCodes.no_session)
          console.error("adminauth ERROR: no_session (not_admin)")
        }
        return
      }
      if(callback) callback(session, account)
    }, onerr)
  }, onerr)
}

export function getAccount(row, check, callback, onerr) {
  sql.query(`SELECT * FROM accounts WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
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

export function getProfile(row, check, callback, onerr) {
  sql.query(`SELECT *, hex(color) AS color_hex FROM profile WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
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

export function createProfile() {

}

export function getSession(row, check, callback, onerr) {
  sql.query(`SELECT * FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
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

export function getSessions(row, check, callback, onerr) {
  sql.query(`SELECT * FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
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

export function deleteSessions(row, check, callback, onerr) {
  sql.query(`DELETE FROM sessions WHERE \`${row}\` = "${check}"`, (e, result, fields) => {
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

export function createSession(acc, req, res) {
  // create session
  var uagent = UAParser(req.get("user-agent"))
  console.log(`User Agent: ${uagent.browser.name}/${uagent.browser.major} on ${uagent.os.name}`)
  var token = hash256(Math.random()+"") // random hash
  // check exists
  sql.query(`SELECT * FROM sessions WHERE token = "${token}"`, (e, result, fields) => {
    if(e) throw e
    if(result.length != 0) return respond(res, statusCodes.server_error, "Generated session token already exists. Please try again.")
    // insert session into table
    var date = new Date(Date.now() + (1000*60*60*24)) // expires in 1 day
    var sqldate = date.toISOString().slice(0, -1).replace('T', ' ') // convert into YYYY-MM-DD hh:mm:ss format
    sql.query(`INSERT INTO \`sessions\` (\`id\`, \`expires\`, \`address\`, \`agent\`, \`token\`) VALUES ("${acc.id}", "${sqldate}", "${req.ip}", "${JSON.stringify(uagent).replaceAll("\"", "\\\"")}", "${token}")`, (e, result) => {
      if(e) throw e
      console.log("Created session!") // debug log
      res.cookie("session", token, {path: "/", httpOnly: true, secure: true})
      respond(res, statusCodes.success, "")
    })
  })
}
