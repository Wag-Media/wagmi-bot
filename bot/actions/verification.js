const polkadotUtil = require("@polkadot/util-crypto")
const API = require("../lib/api")
const Discord = require("discord.js")
const logger = require("../lib/logger")

class VerificationAction {
	constructor(client) {
		this.client = client

		this.components = new Discord.ActionRowBuilder().addComponents(
			new Discord.ButtonBuilder()
				.setCustomId('verify_evm')
				.setLabel('EVM Address')
				.setStyle(Discord.ButtonStyle.Primary),
			new Discord.ButtonBuilder()
				.setCustomId('verify_substrate')
				.setLabel('Substrate Address')
				.setStyle(Discord.ButtonStyle.Secondary),
			new Discord.ButtonBuilder()
				.setCustomId('verify_twitter')
				.setLabel('Twitter')
				.setStyle(Discord.ButtonStyle.Primary),
		)
	}

    /**
     * Register event handlers
     */
	register() {
		return {
			"messageCreate": async (msg) => await this.handleMessageCreate(msg),
			"interactionCreate": async (interaction) => await this.handleInteractionCreate(interaction),
			"messageReactionRemove": async (messageReaction, user) => await this.handleMessageReactionRemove(messageReaction, user),
			"messageReactionAdd": async (messageReaction, user) => await this.handleMessageReactionAdd(messageReaction, user),
			"guildMemberAdd": async (member) => await this.handleGuildMemberAdd(member)
		 }
	}

    /**
     * Handle interaction created; Used for button selection
     * 
     * @param {Discord.Interaction} interaction - interaction data
     */
	async handleInteractionCreate(interaction) {
		if (interaction.type == Discord.InteractionType.MessageComponent) {
			if (interaction.customId === 'verify_evm' || interaction.customId === 'verify_substrate' || interaction.customId === 'verify_twitter') {
				await this.handleVerification(interaction)
			}
		}
	}

	/**
	 * Handle sent message; Check if bot prefix is used and reply with button selection to verify/update credentials
	 * 
	 * @param {Discord.Message} msg - message data
	 */
	async handleMessageCreate(msg) {
		if (msg.author.bot) return

		if (msg.content.indexOf(process.env.BOT_PREFIX) !== -1) {
			if (msg.channel.type == Discord.ChannelType.DM) {
				msg.reply({ content: 'Please select an option which data you want to verify or update!', components: [this.components] }).catch(err => {
					logger.error("Verification: Error replying to user %s (ID: %s): %O", msg.author.tag, msg.author.id, err)
				})
			}
		}
	}

	/**
	 * Send input dialog to user, await incoming message and validate it.
	 * 
	 * @param {Discord.Interaction} button - interaction data
	 */
	async handleVerification(button) {
		await button.deferReply()

		/** Get current user data **/
		API.request(`http://api-TEMPLATE:8081/api/user/${button.user.id}`).then(async apiUser => {
			/** Build input dialog message based on current data **/
			let type = 'EVM address'
			let currentValue = apiUser.data.evmAddress
			if (button.customId === 'verify_substrate') {
				type = 'Substrate address'
				currentValue = apiUser.data.substrateAddress
			} else if (button.customId === 'verify_twitter') {
				type = 'Twitter handle'
				currentValue = apiUser.data.twitterHandle
			}

			let text = []
			if (currentValue === null) {
				text.push(`You didn't submit a ${type} yet.`)
				if (button.customId === 'verify_twitter') {
					text.push(`Please enter your Twitter handle without the @`)
				} else {
					text.push(`Please enter your ${type}`)
				}
			} else {
				text.push(`Your current ${type} is: ${currentValue}`)
				if (button.customId === 'verify_twitter') {
					text.push(`Please enter your new Twitter handle without the @`)
				} else {
					text.push(`Please enter your new ${type}`)
				}
			}

			await button.editReply({ content: text.join("\n") })

			/** Await incoming messages, validate and save them **/
			button.message.channel.awaitMessages({ filter: collected => collected.author.id === button.user.id || collected.author.bot, max: 1, time: 30000 }).then(collected => {
				const msg = collected.first()
				if (msg.author.id === button.user.id) {
					let data = {
						id: button.user.id
					}

					let isValid = true

					if (button.customId === 'verify_substrate') {
						data.substrateAddress = msg.content
						try {
							polkadotUtil.decodeAddress(data.substrateAddress)
						} catch (e) {
							isValid = false
						}
					} else if (button.customId === 'verify_evm') {
						data.evmAddress = msg.content
						if (/^0x0+$/.test(data.evmAddress)) {
							isValid = false
						} else {
							isValid = polkadotUtil.isEthereumAddress(data.evmAddress)
						}
					} else if (button.customId === 'verify_twitter') {
						data.twitterHandle = msg.content
					}

					if (isValid) {
						API.request('http://api-TEMPLATE:8081/api/user/insertOrUpdate', data, 'POST').then(response => {
							msg.reply(`Your ${type} has been changed to: ${msg.content}`)

							let { config } = API.getConfiguration()

							this.client.guilds.fetch(process.env.BOT_GUILD_ID).then(guild => {
								guild.members.fetch(button.user.id).then(member => {
									/** Remove Unverified Role and add Newcomer Role */
									if (member.roles.cache.has(config.unverified_role_id)) {
										member.roles.remove(config.unverified_role_id)
											.then(() => logger.info(`Verification: Unverified Role has been removed from %s`, msg.author.tag))
											.catch(err => {
												logger.error("Verification: Error removing Unverified Role from user %s (ID: %s): %O", msg.author.tag, msg.author.id, err)
											})

										member.roles.add(config.newcomer_role_id)
											.then(() => member.send(config.verification_dm_success_text))
											.catch(err => {
												logger.error("Verification: Error adding Newcomer Role to user %s (ID: %s): %O", msg.author.tag, msg.author.id, err)
											})
									}
								}).catch(err => {
									logger.error("Verification: Error fetching user %s (ID: %s): %O", msg.author.tag, msg.author.id, err)
									msg.reply("An error occured! Please try again!")
								})
							}).catch(err => {
								logger.error("Verification: Error fetching guild: %O", err)
								msg.reply("An error occured! Please try again!")
							})
						}).catch(err => {
							msg.reply("An error occured! Please try again!")
						})
					} else {
						msg.reply({ content: `The ${type} you entered is not valid.`, components: [this.components] })
					}
				}
			}).catch(async err => {
				await button.followUp({ content: "Input timeout, please select an option which data you want to verify or update!", components: [this.components] })
				logger.info('Verification: Timeout awaiting messages for user: %d', button.user.id)
			})
		}).catch(async err => {
			await button.editReply({ content: "An error occured! Please try again!", components: [this.components] })
		})
	}

	/**
	 * Handle removed reaction; Remove Newcomer Role from user when removing his reaction from verification post
	 * @param {Discord.MessageReaction} messageReaction - reaction data
	 * @param {Discord.User} user - user data
	 * @returns 
	 */
	async handleMessageReactionRemove(messageReaction, user) {
		if (user.bot) return

		let { config } = API.getConfiguration()

		if (messageReaction.message.channelId == config.verification_channel_id) {
			this.client.guilds.fetch(process.env.BOT_GUILD_ID).then(guild => {
				guild.members.fetch(user.id).then(member => {
					member.roles.remove(config.newcomer_role_id)
						.then(() => logger.info(`Verification: Newcomer Role has been removed from %s`, member.user.tag))
						.catch(err => logger.error("Verification: Error on removing Newcomer Role from user %s (ID: %s): %O", member.user.tag, member.user.id, err))
				}).catch(err => {
					logger.error("Verification: Error fetching user id %s: %O", user.id, err)
				})
			}).catch(err => {
				logger.error("Verification: Error fetching guild: %O", err)
			})
		}
	}

	/**
	 * Handle new members; Add Unverified Role when joining guild
	 * 
	 * @param {Discord.GuildMember} member - member data
	 */
	async handleGuildMemberAdd(member) {
		let { config } = API.getConfiguration()

		member.roles.add(config.unverified_role_id).catch(err => {
			logger.error("Verification: Error on adding Unverified Role to user %s (ID: %s): %O", member.user.tag, member.user.id, err)
		})
	}

	/**
	 * Handle added reaction; Send verification message to user when reaction to verification post or add role tied to reacted emoji when reacted by a director in introduction channel
	 * 
	 * @param {Discord.MessageReaction} messageReaction - reaction data
	 * @param {Discord.User} user - user data
	 */
	async handleMessageReactionAdd(messageReaction, user) {
		let { config } = API.getConfiguration()

		if (messageReaction.message.channelId != config.verification_channel_id && messageReaction.message.channelId != config.introduction_channel_id) {
			return
		}

		this.client.guilds.fetch(process.env.BOT_GUILD_ID).then(guild => {
			if (messageReaction.message.channelId == config.verification_channel_id) {
				const embed = new Discord.EmbedBuilder()
				embed.addFields({ name: `Verification for ${guild.name}`, value: config.verification_dm_text })
				user.send({ embeds: [embed] }).then(() => {
					logger.info(`Verification message sent to ${user.tag}`)
				}).catch(err => {
					logger.error("Verification: Error sending message to user %s (ID: %s): %O", user.tag, user.id, err)
				})
			} else if (messageReaction.message.channelId == config.introduction_channel_id) {
				var new_role_id = false
				var new_role_name = ''
				switch (messageReaction.emoji.id) {
					case config.finder_emoji_id:
						new_role_id = config.finder_role_id
						new_role_name = 'Finder'
						break
					case config.lurker_emoji_id:
						new_role_id = config.lurker_role_id
						new_role_name = 'Lurker'
						break
					case config.creator_emoji_id:
						new_role_id = config.creator_role_id
						new_role_name = 'Creator'
						break
				}

				guild.members.fetch(user.id).then(reactor => {
					/** Check if user emoting is a director or role is set */
					if (new_role_id == false || !reactor.roles.cache.has(config.director_role_id)) {
						return
					}

					guild.members.fetch(messageReaction.message.author.id).then(member => {
						if (member.roles.cache.has(new_role_id)) {
							return
						}

						member.roles.set([new_role_id]).then(() => {
							logger.info(`Verification: %s Role has been granted to %s`, new_role_name, member.user.tag)
						}).catch(err => {
							logger.error("Verification: Error on setting roles for user %s (ID: %s): %O", member.user.tag, member.user.id, err)
						})
					}).catch(err => {
						logger.error("Verification: Error fetching user id %s: %O", user.id, err)
					})
				})
			}
		}).catch(err => {
			logger.error("Verification: Error fetching guild: %O", err)
		})
	}
}

module.exports = VerificationAction