const Discord = require("discord.js")
const API = require("../lib/api")
const logger = require("../lib/logger")

class DirectorElevationAction {
	constructor(client) {
		this.client = client
	}

    /**
     * Register event handlers
     */
	register() {
		return {
			"messageReactionAdd": async (messageReaction, user) => await this.handleReactionAdd(messageReaction, user)
		}
	}

	/**
	 * Handle added reaction
	 * 
     * @param {Discord.MessageReaction} messageReaction - reaction data
     * @param {Discord.User} user - user data
	 */
	async handleReactionAdd(messageReaction, user) {
		if (user.bot) return

		if (messageReaction.message.channel.type !== Discord.ChannelType.DM) {
			await this.elevate(messageReaction, user)
		}
	}

	/**
	 * Elevate message to director channel tied to reacted emoji
	 * 
     * @param {Discord.MessageReaction} messageReaction - reaction data
     * @param {Discord.User} user - user data
	 */
	async elevate(messageReaction, user) {
		const { config, treasuryElevations } = API.getConfiguration()

		/** Only elevate from news or content channels **/
		let channelId = messageReaction.message.channelId

		if (messageReaction.message.channel.type === Discord.ChannelType.GuildPublicThread || messageReaction.message.channel.type === Discord.ChannelType.GuildPrivateThread) {
			channelId = (await this.client.channels.fetch(messageReaction.message.channel.parentId))?.id;
		}

		let elevate = config.news_channel_ids.includes(channelId) || config.content_channel_ids.includes(channelId)

		if (!elevate) {
			return
		}

		let isContent = !config.news_channel_ids.includes(channelId)

		messageReaction.message.react(config.elevation_emoji_id)

		/** Check if reacted emoji is tied to a treasury and if required amount for elevation is reached **/
		if (messageReaction._emoji.id in treasuryElevations) {
			const message = await messageReaction.message.channel.messages.fetch(messageReaction.message.id)
			const reactionCount = message.reactions.cache.get(messageReaction._emoji.id).count

			var elevationInfo = treasuryElevations[messageReaction._emoji.id]
			if (reactionCount >= elevationInfo.amount) {
				let emoji = await this.client.emojis.cache.get(messageReaction._emoji.id)
	
				/** Check if message has already been elevated, if already elevated do nothing **/
				API.request("http://api-TEMPLATE:8081/api/elevation/findOne", {
					oldMessageId: messageReaction.message.id,
					newChannelId: elevationInfo.channelId
				}, "POST").then(async response => {
					const elevatedMessage = response.data
	
					if (!elevatedMessage.newMessageId) {
						const embed = new Discord.EmbedBuilder()
							.setColor('#0099ff')
							.setAuthor({ name: `${messageReaction.message.author.username} in  #${messageReaction.message.channel.name}` })
							.setURL(messageReaction.message.url)
							.setTitle((isContent ? 'Special Delivery' : 'Special Delivery') + ' <:' + emoji.identifier + '>')
							.setDescription(messageReaction.message.content)
							.setTimestamp()
	
						let attachments = []
						if (messageReaction.message.attachments.size > 0) {
							messageReaction.message.attachments.each(a => {
								attachments.push(a.proxyURL)
							})
						}
	
						/** Send embedded messages and attachments **/
						let newMessage = await this.client.channels.cache.get(elevationInfo.channelId).send({ embeds: [embed, ...messageReaction.message.embeds] })
						if (attachments.length) {
							await this.client.channels.cache.get(elevationInfo.channelId).send({ files: attachments })
						}
	
						/** Submit elevation to API **/
						await API.request("http://api-TEMPLATE:8081/api/elevation/insert", {
							oldMessageId: messageReaction.message.id,
							oldChannelId: messageReaction.message.channelId,
							newChannelId: elevationInfo.channelId,
							newMessageId: newMessage.id,
							userId: messageReaction.message.author.id,
							username: messageReaction.message.author.username
						}, "POST").then(() => {

							this.client.log(`Director Elevation: Message elevated to <#${elevationInfo.channelId}> with ${reactionCount} emojis
${messageReaction.message.url}`)
							logger.info(`Director Elevation: Message %s elevated to <#%s> with %d emojis`, messageReaction.message.id, elevationInfo.channelId, reactionCount)
						}).catch(err => {
							logger.error("Director Elevation: API Error on inserting elevation")
						})
					}
				}).catch(err => {
					logger.error("Director Elevation: Error elevating messageReaction: %O", messageReaction)
				})
			}
		}
	}
}

module.exports = DirectorElevationAction