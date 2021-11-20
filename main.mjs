import { WebApp } from "@j0code/webapp"

const statusCodes = {
  success: { httpCode: 200, status: { code: "success", description: "success" }}
}

const sql_options = {
  host: "localhost",
  user: "root",
  password: "",
  database: "codeverse"
}

var app = new WebApp(25560, sql_options, () => {}, (query, e1) => {
  query("CREATE TABLE IF NOT EXISTS `accounts` (`id` INT AUTO_INCREMENT PRIMARY KEY, `username` VARCHAR(16) NOT NULL, `password` VARCHAR(256) NOT NULL, `email` VARCHAR(32), `birthdate` DATETIME NOT NULL, `creation` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, `verified` BOOLEAN DEFAULT FALSE, `emailverified` BOOLEAN DEFAULT FALSE)", (e, result) => {
    if(e) {console.log(e);return}
    console.log("Table created")
  })
})

app.node("register", (data, res) => {
  if(data.username && data.password) {
    app.query(`INSERT INTO \`accounts\` (\`username\`, \`password\`, \`email\`, \`birthdate\`) VALUES ("${data.username}", "${data.password}", "${data.email}", "${data.birthdate}")`)
    respond(res, statusCodes.success)
  }
  // respond with error!
})

app.node("profile", (data, res) => {
  app.query("SELECT * FROM accounts WHERE id = 1", (e, result, fields) => {
    if(e) throw e
    console.log(result)
    var acc = result[0]
    respond(res, statusCodes.success, {username: acc.username, email: acc.email, creation: acc.creation, birthdate: acc.birthdate})
  })
})

function respond(res, status, data) {
  if(!res || !status || !data || !["object","string"].includes(typeof data)) {
    if(res) {
      res.writeHead(500)
      res.end('')// insert error
    }
    return
  }
  if(typeof data == "object") data = JSON.stringify(data)
  var o = { status: status.status, data }
  res.writeHead(status.httpCode)
}
