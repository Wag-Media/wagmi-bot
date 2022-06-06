const Discord = require("discord.js")
const API = require("../lib/api")
const logger = require("../lib/logger")

class InstantElevationAction {
	constructor(client) {
		this.client = client
		this.register()
	}

    /**
     * Register event handlers
     */
	register() {
		this.client.on("messageCreate", async (msg) => this.handleMessage(msg))
	}

	/**
	 * Handle sent message; Ignore messages creating threads
	 * 
	 * @param {Discord.Message} msg - message data
	 */
	handleMessage(msg) {
		if (msg.author.bot) return

        if (msg.type !== 'THREAD_CREATED') {
            this.elevate(msg)
        }
	}

	/**
	 * Elevate message to instant elevation channel
	 * 
	 * @param {Discord.Message} msg - message data
	 */
	async elevate(msg) {
	    let { config } = API.getConfiguration()

		try {
			/** Only elevate from news or content channels and set the elevation title **/
			let elevate = false
			let elevationTitle = "Top Story 🔥"
			if (config.news_channel_ids.includes(msg.channelId)) {
				elevate = true
			} else if (config.content_channel_ids.includes(msg.channelId)) {
				elevate = true
				elevationTitle = "Top Content 🔥"
			}

			if (elevate) {
				const embed = new Discord.MessageEmbed()
					.setColor('#0099ff')
					.setAuthor(`${msg.author.username} in  #${msg.channel.name}`)
					.setURL(msg.url)
					.setTitle(elevationTitle)
					.setDescription(msg.content)
					.setTimestamp()

				let attachments = []
				if (msg.attachments.size > 0) {
					msg.attachments.each(a => {
						attachments.push(a.proxyURL)
					})
				}

				/** Send embedded messages and attachments **/
				await this.client.channels.cache.get(config.instant_elevation_channel_id).send({ embeds: [embed, ...msg.embeds], })
				if (attachments.length) {
					await this.client.channels.cache.get(config.instant_elevation_channel_id).send({ files: attachments })
				}

				logger.info(`Instant Elevation: Message %s elevated to <#%s>`, msg.id, config.instant_elevation_channel_id)
			}
		} catch(err) {
			logger.error("Instant Elevation: Error on elevating message %O with error %O", msg, err)
		}
	}
}

module.exports = InstantElevationAction