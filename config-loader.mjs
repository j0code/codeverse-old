import fs from "fs/promises"

try {
	var data = await fs.readFile("config.json", { encoding: "utf-8" })
	data = JSON.parse(data)
	data.https.key  = await fs.readFile(data.https.key),
	data.https.cert = await fs.readFile(data.https.cert)
} catch(e) {
	console.error(e)
}

export default data
