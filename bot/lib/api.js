const axios = require("axios")
const logger = require("../lib/logger")

axios.defaults.headers.common = { 'Authorization': `Bearer ${process.env.API_KEY}` }

const API = function () {
	this.config = {}
	this.treasuryElevations = {}
	this.treasuryValuations = {}
	this.treasuryRestrictions = {}
	this.treasuryTiers = {}

	this.client = axios.create({
		baseURL: 'http://api-TEMPLATE:8081/api/',
	})

	this.request = async (endpoint, data = {}, method = 'GET') => {
		try {
			return await this.client({
				url: endpoint,
				method: method,
				data: data
			})
		} catch (err) {
			logger.error("API Error: Request failed: %O", err)
			return Promise.reject(err)
		}
	}

	this.loadConfiguration = async () => {
		await this.request("config/all").then((response => {
			this.config = response.data
		}).bind(this))

		await this.request("treasury/all").then((response => {
			this.treasuryElevations = {}

			const treasuries = response.data
			for (let treasury of treasuries) {
				if (treasury.elevationActive) {
					this.treasuryElevations[treasury.elevationEmojiId] = {
						channelId: treasury.elevationChannelId,
						amount: treasury.elevationAmount
					}
				}
			}
		}).bind(this))

		await this.request("treasury/restrictions").then((response => {
			this.treasuryRestrictions = {}

			const restrictions = response.data
			for (let restriction of restrictions) {
				if (!(restriction.treasuryId in this.treasuryRestrictions)) {
					this.treasuryRestrictions[restriction.treasuryId] = {}
				}

				this.treasuryRestrictions[restriction.treasuryId][restriction.roleId] = restriction.channelIds.split(",").filter(e => e !== '')
			}
		}).bind(this))

		await this.request("treasury/tiers").then((response => {
			this.treasuryTiers = {}

			const tiers = response.data
			for (let tier of tiers) {
				if (!(tier.treasuryId in this.treasuryTiers)) {
					this.treasuryTiers[tier.treasuryId] = {}
				}

				if (!(tier.roleId in this.treasuryTiers[tier.treasuryId])) {
					this.treasuryTiers[tier.treasuryId][tier.roleId] = {}
				}

				tier.channelIds.split(",").filter(e => e !== '').map(channelId => {
					this.treasuryTiers[tier.treasuryId][tier.roleId][channelId] = tier.percentage
				})
			}
		}).bind(this))

		await request("emoji/all").then((response => {
			this.treasuryValuations = {}

			const treasuries = response.data
			for (let treasury of treasuries) {
				this.treasuryValuations[treasury.emojiId] = {
					value: treasury.amount,
					treasuryName: treasury.name,
					treasuryId: treasury.treasuryId,
					coinName: treasury.coinName,
					treasuryType: treasury.type,
					royaltyPercentage: treasury.royaltyPercentage,
					royaltyEnabled: treasury.royaltyEnabled
				}
			}
		}).bind(this))

		return { config, treasuryElevations, treasuryValuations, treasuryRestrictions, treasuryTiers }
	}

	this.getConfiguration = () => {
		const config = this.config
		const treasuryElevations = this.treasuryElevations
		const treasuryValuations = this.treasuryValuations
		const treasuryRestrictions = this.treasuryRestrictions
		const treasuryTiers = this.treasuryTiers

		return { config, treasuryElevations, treasuryValuations, treasuryRestrictions, treasuryTiers }
	}

	return this
}

module.exports = API()