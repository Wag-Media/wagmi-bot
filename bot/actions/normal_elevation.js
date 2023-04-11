const Discord = require("discord.js")
const API = require("../lib/api")
const logger = require("../lib/logger")

class NormalElevationAction {
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
            await this.elevate(messageReaction)
        }
    }

	/**
	 * Elevate message to news/content elevation channel
	 * 
     * @param {Discord.MessageReaction} messageReaction - reaction data
     * @param {Discord.User} user - user data
	 */
    async elevate(messageReaction) {
        const { config, treasuryElevations } = API.getConfiguration()

        let elevate = false
        let elevationChannelId = config.news_elevation_channel_id
        let elevationTitle = "Special Delivery"

		/** Only elevate from news or content channels **/
		let channelId = messageReaction.message.channelId

		if (messageReaction.message.channel.type === Discord.ChannelType.GuildPublicThread || messageReaction.message.channel.type === Discord.ChannelType.GuildPrivateThread) {
			channelId = (await this.client.channels.fetch(messageReaction.message.channel.parentId))?.id;
		}

        if (config.news_channel_ids.includes(channelId)) {
            elevate = true
        } else if (config.content_channel_ids.includes(channelId)) {
            elevate = true
            elevationChannelId = config.content_elevation_channel_id
            elevationTitle = "Special Delivery"
        }

        /** Check if message is eligible to be elevated **/
        if (!elevate || messageReaction._emoji.id != config.elevation_emoji_id) {
            return
        }

        messageReaction.message.react(config.elevation_emoji_id)

        const message = await messageReaction.message.channel.messages.fetch(messageReaction.message.id)
        const reactionCount = message.reactions.cache.get(config.elevation_emoji_id).count

        if (reactionCount >= config.elevation_required_emojis) {
            /** Check if message has already been valuated, if already elevated do nothing **/
            API.request("http://api-TEMPLATE:8081/api/elevation/find", [
                {
                    oldMessageId: messageReaction.message.id,
                    newChannelId: elevationChannelId
                },
                {
                    oldMessageId: messageReaction.message.id,
                    newChannelId: '-1'
                }
            ], "POST").then(async response => {
                const elevatedMessages = response.data

                if (!elevatedMessages.length) {
                    const embed = new Discord.EmbedBuilder()
                        .setColor('#0099ff')
                        .setAuthor({ name: `${messageReaction.message.author.username} in  #${messageReaction.message.channel.name}` })
                        .setURL(messageReaction.message.url)
                        .setTitle(elevationTitle)
                        .setDescription(messageReaction.message.content)
                        .setTimestamp()

                    let attachments = []
                    if (messageReaction.message.attachments.size > 0) {
                        messageReaction.message.attachments.each(a => {
                            attachments.push(a.proxyURL)
                        })
                    }

					/** Send embedded messages and attachments **/
                    let newMessage = await this.client.channels.cache.get(elevationChannelId).send({ embeds: [embed, ...messageReaction.message.embeds], })
                    if (attachments.length) {
                        await this.client.channels.cache.get(elevationChannelId).send({ files: attachments })
                    }

					/** Submit elevation to API **/
                    await API.request("http://api-TEMPLATE:8081/api/elevation/insert", {
                        oldChannelId: messageReaction.message.channelId,
                        oldMessageId: messageReaction.message.id,
                        newChannelId: elevationChannelId,
                        newMessageId: newMessage.id,
                        userId: messageReaction.message.author.id,
                        username: messageReaction.message.author.username
                    }, "POST").then(() => {
                        this.client.log(`Normal Elevation: Message elevated to <#${elevationChannelId}> with ${reactionCount} emojis
${messageReaction.message.url}`)
                        logger.info(`Normal Elevation: Message %s elevated to <#%s> with %d emojis`, messageReaction.message.id, elevationChannelId, reactionCount)
                    }).catch(err => {
                        logger.error("Normal Elevation: API Error on inserting elevation")
                    })
                }
            }).catch(err => {
                logger.error("Normal Elevation: Error elevating messageReaction: %O", messageReaction)
            })
        }
    }
}

module.exports = NormalElevationAction