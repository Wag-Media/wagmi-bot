const logger = require("./lib/logger")
const express = require("express")
const app = express()
const cors = require("cors")
const session = require("express-session")
const twofactor = require("node-2fa")
const Validation = require("./lib/validation")
const Valuation = require("./model/valuation")
const Treasury = require("./model/treasury")
const compare = require("secure-compare")

const authorizedUsers = process.env.API_AUTHORIZED_DISCORD_IDS.split(',')
const apiKey = process.env.API_KEY
const cookieDomain = process.env.API_COOKIE_DOMAIN.indexOf('.') !== -1 ? process.env.API_COOKIE_DOMAIN : undefined
const cookiePath = process.env.API_COOKIE_PATH
const sessionSecret = process.env.API_SESSION_SECRET

const http = require("http")
const server = http.createServer()
const { Server } = require("socket.io")
const io = new Server(server, { path: '/' })

require("./lib/io")("ws://bot-TEMPLATE:8085/")

const txHandler = require("./lib/txhandler")

var unless = function (middleware, ...paths) {
	return function (req, res, next) {
		const pathCheck = paths.some(path => path === req.path)
		pathCheck ? next() : middleware(req, res, next)
	}
}

var nonAuth = function (middleware) {
	return function (req, res, next) {
		req.headers.authorization ? next() : middleware(req, res, next)
	}
}

app.disable('x-powered-by')
app.use(cors({ credentials: true }))
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(nonAuth(session({
	secret: sessionSecret,
	resave: false,
	saveUninitialized: false,
	name: 'wagmi_bot',
	cookie: {
		maxAge: 3 * 60 * 60 * 1000,
		sameSite: true,
		domain: cookieDomain,
		path: cookiePath
	},
})))

app.use(unless((req, res, next) => {
	if (req.headers) {
		if (req.headers.authorization) {
			const parts = req.headers.authorization.split(' ')
			if (parts.length === 2 && parts[0] === 'Bearer') {
				if (compare(parts[1], apiKey) === true) {
					next()
					return
				}
			}
		}
	}

	if (req.session) {
		if (req.session.data) {
			if (authorizedUsers.includes(req.session.data.discord_id)) {
				next()
				return
			}
		}
	}

	res.status(400).send()
}, "/api/discord/login", "/api/valuation/public", "/api/treasury/public"))

require("./routes.js")(app)

app.listen(8081, () => logger.info("Server is running on port 8081."))

server.listen(8086, () => logger.info(`Websocket open on port 8086`))

io.on("connection", socket => {
	socket.on("process", (data) => {
		if (txHandler.isRunning) {
			logger.error('Transactions triggered, but they are already processing')
			socket.emit('error', 'Transactions are currently being processed')
		} else {
			Treasury.getById(data.treasuryId).then(treasury => {

				if (treasury.id) {
					let twoFATokenValid = twofactor.verifyToken(process.env.API_TWOFA_KEY, data.twoFAToken, 1);

					if (twoFATokenValid !== null && twoFATokenValid.delta === 0) {
						if (!Validation.isValidEncryptionKey(data.encryptionKey)) {
							logger.error('Transactions triggered, invalid encryption key provided')
							socket.emit('error', 'Encryption key invalid! Please retry!')
						} else {
							logger.info('Transactions triggered')
							txHandler.run(socket, data.encryptionKey, treasury.id)
						}
					} else {
						logger.error('Transactions triggered, invalid 2FA Token provided')
						socket.emit('error', '2FA Token invalid! Please retry!')
					}
				} else {
					logger.error('Transactions triggered, treasury not found')
					socket.emit('error', 'Please select a treasury!')
				}
			}).catch(e => {
				logger.error('Transactions triggered, treasury fetch failed')
				socket.emit('error', 'Error occured on fetching the treasury!')
			})
		}
	})
})

setInterval(Valuation.pruneContent, 24 * 60 * 60 * 1000)