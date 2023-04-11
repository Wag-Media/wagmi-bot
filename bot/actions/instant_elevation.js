const Discord = require("discord.js")
const API = require("../lib/api")
const logger = require("../lib/logger")

class InstantElevationAction {
	constructor(client) {
		this.client = client
	}

    /**
     * Register event handlers
     */
	register() {
		return {
			"messageCreate": async (msg) => await this.handleMessage(msg)
		}
	}

	/**
	 * Handle sent message; Ignore messages creating threads
	 * 
	 * @param {Discord.Message} msg - message data
	 */
	async handleMessage(msg) {
		if (msg.author.bot) return

        if (msg.channel.type !== Discord.ChannelType.DM && msg.type !== Discord.MessageType.ThreadCreated) {
            await this.elevate(msg)
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
			let elevationTitle = "Special Delivery"
			if (config.news_channel_ids.includes(msg.channelId)) {
				elevate = true
			} else if (config.content_channel_ids.includes(msg.channelId)) {
				elevate = true
				elevationTitle = "Special Delivery"
			}

			if (elevate) {
				const embed = new Discord.EmbedBuilder()
					.setColor('#0099ff')
					.setAuthor({ name: `${msg.author.username} in  #${msg.channel.name}` })
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