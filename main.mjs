import { WebApp } from "@j0code/webapp"
import crypto from "crypto"
import uaparser from "ua-parser-js"

const statusCodes = {
  success: { httpCode: 200, status: { code: "success", description: "success" }},
  invalid: { httpCode: 500, status: { code: "invalid", description: "Invalid" }},
  username_taken: { httpCode: 500, status: { code: "username_taken", description: "Username already taken" }},
}

const sql_options = {
  host: "localhost",
  user: "root",
  password: "",
  database: "codeverse"
}

var app = new WebApp(25560, sql_options, () => {}, (query, e1) => {
  query("CREATE TABLE IF NOT EXISTS `accounts` (`id` INT AUTO_INCREMENT PRIMARY KEY, `username` VARCHAR(16) UNIQUE NOT NULL, `password` VARCHAR(256) NOT NULL, `email` VARCHAR(32) NOT NULL, `birthdate` DATETIME NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `verified` BOOLEAN DEFAULT FALSE, `emailverified` BOOLEAN DEFAULT FALSE)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("accounts table created")
  })
  query("CREATE TABLE IF NOT EXISTS `sessions` (`sessionid` INT AUTO_INCREMENT PRIMARY KEY, `id` INT, `username` VARCHAR(16) NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `expires` DATETIME NOT NULL, `address` VARCHAR(39) NOT NULL, `agent` JSON NOT NULL, `token` VARCHAR(64) NOT NULL)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("Table created")
  })
})

app.node("register", (data, res) => {
  var check = checkRegister(data)
  if(!check) {
    // valid -> create acc
    app.query(`SELECT * FROM accounts WHERE username = "${data.username}"`, (err, result, fields) => {
      if(err) throw err
      console.log(result) // debug log
      if(result.length == 0) {
        // hash password
        var hash = crypto.createHash("sha256")
        hash.update(data.password)
        var pw_hash = hash.digest("hex")
        console.log("HASH " + data.password + " -> " + pw_hash) // debug log
        // put on db
        app.query(`INSERT INTO \`accounts\` (\`username\`, \`password\`, \`email\`, \`birthdate\`) VALUES ("${data.username}", "${pw_hash}", "${data.email}", "${data.birthdate}")`, (err, result) => {
          if(err) throw err
          console.log(result) // debug log
          console.log("Created account!") // debug log
          respond(res, statusCodes.success, "")
        })
      } else {
        // username already taken
        respond(res, statusCodes.username_taken, "") // temp
        console.log("uat")
      }
    })
  } else {
    // invalid
    respond(res, statusCodes.invalid, check) // temp
    console.log("inv")
  }
})

app.node("profile", (data, res) => {
  // temporary
  var q = "SELECT * FROM accounts WHERE id = 1"
  if(data.username) q = "SELECT * FROM accounts WHERE username = \"" + data.username + "\""
  app.query(q, (e, result, fields) => {
    if(e) throw e
    console.log(result)
    var acc = result[0]
    respond(res, statusCodes.success, {username: acc.username, email: acc.email, creation: acc.creation, birthdate: acc.birthdate})
  })
})

function respond(res, status, data) {
  if(!res) return
  if(!status || data == "undefined" || !["object","string"].includes(typeof data)) {
    res.writeHead(500)
    res.end('')// insert error
    return
  }
  var o = { status: status.status, data }
  res.writeHead(status.httpCode)
  res.end(JSON.stringify(o))
  console.log("o", o)
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
