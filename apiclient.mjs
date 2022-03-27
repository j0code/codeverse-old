import { logEvent } from "./util.mjs"

import { auth } from "./sql.mjs"

export default class APIClient {

	#io; #socket
	constructor(io, socket) {
		this.#io = io
		this.#socket = socket
		var ip = socket.request.connection.remoteAddress
		var token = socket.handshake.auth.token
		var uagent = socket.request.headers["user-agent"]

		logEvent(ip, "IO", "connect")
		console.log("token:", token)

		auth(token, ip, uagent).then(session => {
			socket.emit("auth")
		}).catch(e => {
			// unauthenticated or error
			console.log("apiclient auth error:", e)
			socket.disconnect(true)
		})

		socket.on("disconnect", () => {
			// c'mon, do something
			console.log("disconnect!")
		})

		socket.on("test", (data, callback) => {
			console.log(data, callback)
			//callback("henlo")
		})

		socket.onAny((e, data) => {
			logEvent(ip, "IO", e, data)
		})
	}

}
