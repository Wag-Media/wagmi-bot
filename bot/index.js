const logger = require("./lib/logger")
const Discord = require("discord.js")
const path = require("path")
const fs = require("fs")

const http = require("http")
const server = http.createServer()
const { Server } = require("socket.io")
const io = new Server(server)

const API = require("./lib/api")

const client = new Discord.Client({
	partials: [
		Discord.Partials.Channel,
		Discord.Partials.Message,
		Discord.Partials.Reaction,
		Discord.Partials.User
	],
	intents: [
		Discord.GatewayIntentBits.Guilds,
		Discord.GatewayIntentBits.MessageContent,
		Discord.GatewayIntentBits.GuildMembers,
		Discord.GatewayIntentBits.GuildMessages,
		Discord.GatewayIntentBits.GuildMessageReactions,
		Discord.GatewayIntentBits.DirectMessages
	]
})

let guild = null

client.on('error', logger.error)
client.on('warn', logger.warn)
client.on('disconnect', () => { logger.info('Disconnected from discord.') })
client.on('reconnecting', () => { logger.info('Reconnecting to discord.') })
client.log = async (message) => {
	const { config } = await API.loadConfiguration()
	
	guild.channels.fetch(config.log_channel_id).then(channel => {
		channel.send(message)
	})
}

client.once("ready", async () => {
	guild = await client.guilds.fetch(process.env.BOT_GUILD_ID)
	logger.info(`Logged in as ${client.user.tag}!`)

	server.listen(8085, () => logger.info(`Websocket open on port 8085`))

	await API.loadConfiguration()

	io.on("connection", socket => {
		socket.on("update", async () => {
			await API.loadConfiguration()
		})

		socket.on("send", async payload => {
			client.users.fetch(payload.userId, false).then(user => {
				user.send(payload.message).catch(err => {
					logger.error("Error sending message to %s: %O", user.username, err)
				})
			})
		})

		socket.on("verification", async (callback) => {
			const embed = new Discord.EmbedBuilder()

			const welcomeTitle = `Welcome to ${guild.name}!`

			embed.addFields({ name: welcomeTitle, value: config.verification_intro_text })

			try {
				const message = await client.channels.cache.get(config.verification_channel_id).send({ embeds: [embed] })
				message.react("✅")
				logger.info("Verification message has been reset!")
				callback({ status: 200 })
			} catch(err) {
				logger.error("Error on resetting verification message: %O", err)
				callback({ status: 422, err })
			}
		})
	})

	await client.user.setActivity("Verify in #front-desk")
})

client.on("guildCreate", async (joinedGuild) => {
	// Check if the joined guild's ID matches the BOT_GUILD_ID from the environment variable
	if (joinedGuild.id !== process.env.BOT_GUILD_ID) {
	  try {
		await joinedGuild.leave();
		//logger.info(`Bot left the guild with ID: ${joinedGuild.id}`);
	  } catch (error) {
		logger.error(`Error leaving the guild with ID: ${joinedGuild.id}`, error);
	  }
	}
  });

/** Load "actions" and initialize them **/
const actionsPath = path.join(__dirname, 'actions');
const actionFiles = fs.readdirSync(actionsPath).filter(file => file.endsWith('.js'));

let actionHandlers = {}

for (const file of actionFiles) {
	const filePath = path.join(actionsPath, file);
	const actionClass = require(filePath);
	const actionInstance = new actionClass(client)

	const handlers = actionInstance.register()
	for (const eventName in handlers) {
		if (!(eventName in actionHandlers)) {
			actionHandlers[eventName] = []
		}

		actionHandlers[eventName].push(handlers[eventName])
	}
}

for (const eventName in actionHandlers) {
	client.on(eventName, async (... args) => {
		if (eventName === "messageReactionAdd" || eventName === "messageReactionRemove") {
			if (args[0].partial) {
				try {
					await args[0].fetch()
				} catch (err) {
					logger.error("Error on fetching reaction: %O", err)
					return
				}
			}
		}

		for (const handler of actionHandlers[eventName]) {
			await handler(... args)
		}
	})
}

client.login(process.env.BOT_TOKEN)