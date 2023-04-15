const Valuation = require("../model/valuation.js")
const User = require("../model/user.js")
const logger = require("../lib/logger")
const Validation = require("../lib/validation")
const csvWriter = require("csv-writer")

/**
 * Insert message valuation
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
exports.insert = async (req, res) => {
	if (!req.body) {
		res.status(400).send({
			message: "Invalid payload"
		})
	}

	const valuation = new Valuation(req.body)

	try {
		logger.debug("Inserting valuation: %O", valuation)
		let result = await Valuation.insert(valuation)
		logger.info("Valuation inserted")

		result.message = null

		/** Try to get user and check if needed address for payout has been submitted */
		let userData = await User.getById(valuation.userId)

		if (req.body.treasuryType === 'substrate' && (!userData.id || userData.substrateAddress === null || userData.substrateAddress === "")) {
			result.message = `One of your messages has been valuated. Please provide a Substrate address to The Concierge to receive your payout. Type !__BOTPREFIX__ and click on the "Substrate Address" button.`
		} else if (req.body.treasuryType === 'evm' && (!userData.id || userData.evmAddress === null || userData.evmAddress === "")) {
			result.message = `One of your messages has been valuated. Please provide an EVM address to The Concierge to receive your payout. Type !__BOTPREFIX__ and click on the "EVM Address" button.`
		}

		res.send(result)
	} catch (err) {
		logger.error("Error on inserting valuation: %O", err)
		res.status(500).send({
			message: `Error on inserting valuation`
		})
	}
}

/**
 * Find message valuation based on conditions
 * Payload example:
 * {
 *		messageId: MESSAGEID,
 *		discordEmojiId: DISCORDEMOJIID
 *	}
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
exports.findOne = async (req, res) => {
	if (!req.body) {
		res.status(400).send({
			message: "Invalid payload"
		})
	}

	try {
		logger.debug("Finding a valuation: %O", req.body)
		const result = await Valuation.findOne(req.body)
		res.send(result)
	} catch (err) {
		logger.error("Error on finding a valuation: %O", err)
		res.status(500).send({
			message: "Error on finding a valuation"
		})
	}
}

/**
 * Query all message valuations
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
exports.getAll = async (req, res) => {
	let options = {}

	let errors = []

	if (req.query.searchFilter) {
		try {
			options.searchFilter = JSON.parse(req.query.searchFilter)

			if (options.searchFilter.dateStart && !Validation.isNumber(options.searchFilter.dateStart)) {
				errors.push({
					key: 'searchFilter.dateStart',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.dateEnd && !Validation.isNumber(options.searchFilter.dateEnd)) {
				errors.push({
					key: 'searchFilter.dateEnd',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.treasuryId && !Validation.isNumber(options.searchFilter.treasuryId)) {
				errors.push({
					key: 'searchFilter.treasuryId',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.status && (options.searchFilter.status < 1 || options.searchFilter.status > 3)) {
				errors.push({
					key: 'searchFilter.status',
					message: 'Not a valid status filter'
				})
			}
		} catch(e) {
			errors.push({
				key: 'searchFilter',
				message: 'Invalid JSON'
			})
		}
	}

	if (req.query.paginated) {
		options.paginated = true
		options.sortField = req.query.sortField
		options.sortOrder = req.query.sortOrder
		options.pageSize = parseInt(req.query.pageSize)
		options.pageNo = parseInt(req.query.pageNo)

		let validSortFields = ['valuation.timestamp', 'valuation.source', 'valuation.status', 'valuation.username', 'treasury.name', 'valuation.value', 'valuation.awarderUsername']
		if (!validSortFields.includes(options.sortField)) {
			errors.push({
				key: 'sortField',
				message: 'Not a valid sort field'
			})
		}

		if (options.sortOrder !== "ASC" && options.sortOrder !== "DESC") {
			errors.push({
				key: 'sortOrder',
				message: 'Not a valid sort order'
			})
		}

		if (!Validation.isNumber(options.pageSize)) {
			errors.push({
				key: 'pageSize',
				message: 'Not a valid page size'
			})			
		}

		if (!Validation.isNumber(options.pageNo)) {
			errors.push({
				key: 'pageNo',
				message: 'Not a valid page number'
			})			
		}
	}

	if (errors.length) {
		res.status(422).send({
			message: 'Validation failed',
			errors
		})
		return
	}

	try {
		logger.debug("Getting all valuations: %O", options)
		const result = await Valuation.getAll(options)
		res.send(result)
	} catch (err) {
		logger.error(`Error on retrieving valuations: %O`, err)
		res.status(500).send({
			message: "Error on retrieving valuations"
		})
	}
}

/**
 * Delete valuation
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
 exports.delete = async (req, res) => {
	if (!req.body) {
		res.status(400).send({
			message: "Invalid payload"
		})
	}

	let errors = []
	if (!Validation.isNumber(req.params.id)) {
		errors.push({
			key: 'id',
			message: 'Not a number'
		})
	}

	if (errors.length) {
		res.status(422).send({
			message: 'Validation failed',
			errors
		})
		return
	}

	try {
		logger.debug("Deleting valuation Id: %d", req.params.id)
		const result = await Valuation.delete(req.params.id)
		logger.info("Valuation Id %d deleted", req.params.id)
		res.send(result)
	} catch (err) {
		logger.error(`Error on deleting valuation Id %d: %O`, req.params.id, err)
		res.status(500).send({
			message: `Error on deleting valuation`
		})
	}
}

/**
 * Query all message valuations without sensitive data
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
exports.getAllPublic = async (req, res) => {
	let options = {}

	let errors = []

	if (req.query.searchFilter) {
		try {
			options.searchFilter = JSON.parse(req.query.searchFilter)

			if (options.searchFilter.dateStart && !Validation.isNumber(options.searchFilter.dateStart)) {
				errors.push({
					key: 'searchFilter.dateStart',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.dateEnd && !Validation.isNumber(options.searchFilter.dateEnd)) {
				errors.push({
					key: 'searchFilter.dateEnd',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.treasuryId && !Validation.isNumber(options.searchFilter.treasuryId)) {
				errors.push({
					key: 'searchFilter.treasuryId',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.status && (options.searchFilter.status < 1 || options.searchFilter.status > 3)) {
				errors.push({
					key: 'searchFilter.status',
					message: 'Not a valid status filter'
				})
			}
		} catch(e) {
			errors.push({
				key: 'searchFilter',
				message: 'Invalid JSON'
			})
		}
	}

	if (req.query.paginated) {
		options.paginated = true
		options.sortField = req.query.sortField
		options.sortOrder = req.query.sortOrder
		options.pageSize = parseInt(req.query.pageSize)
		options.pageNo = parseInt(req.query.pageNo)

		let validSortFields = ['valuation.timestamp', 'valuation.source', 'valuation.status', 'treasury.name', 'valuation.value', 'valuation.awarderUsername']
		if (!validSortFields.includes(options.sortField)) {
			errors.push({
				key: 'sortField',
				message: 'Not a valid sort field'
			})
		}

		if (options.sortOrder !== "ASC" && options.sortOrder !== "DESC") {
			errors.push({
				key: 'sortOrder',
				message: 'Not a valid sort order'
			})
		}

		if (!Validation.isNumber(options.pageSize)) {
			errors.push({
				key: 'pageSize',
				message: 'Not a valid page size'
			})			
		}

		if (!Validation.isNumber(options.pageNo)) {
			errors.push({
				key: 'pageNo',
				message: 'Not a valid page number'
			})			
		}
	}

	if (errors.length) {
		res.status(422).send({
			message: 'Validation failed',
			errors
		})
		return
	}

	try {
		logger.debug("Getting all valuations (public): %O", options)
		const result = await Valuation.getAllPublic(options)
		res.send(result)
	} catch (err) {
		logger.error("Error on retrieving valuations (public): %O", err)
		res.status(500).send({
			message: "Error on retrieving valuations (public)"
		})
	}
}

/**
 * Query all message valuations and return a blob
 * 
 * @param {*} req - Request
 * @param {*} res - Response
 */
 exports.export = async (req, res) => {
	let options = {}

	let errors = []

	if (req.query.searchFilter) {
		try {
			options.searchFilter = JSON.parse(req.query.searchFilter)

			if (options.searchFilter.dateStart && !Validation.isNumber(options.searchFilter.dateStart)) {
				errors.push({
					key: 'searchFilter.dateStart',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.dateEnd && !Validation.isNumber(options.searchFilter.dateEnd)) {
				errors.push({
					key: 'searchFilter.dateEnd',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.treasuryId && !Validation.isNumber(options.searchFilter.treasuryId)) {
				errors.push({
					key: 'searchFilter.treasuryId',
					message: 'Not a number'
				})
			}
	
			if (options.searchFilter.status && (options.searchFilter.status < 1 || options.searchFilter.status > 3)) {
				errors.push({
					key: 'searchFilter.status',
					message: 'Not a valid status filter'
				})
			}
		} catch(e) {
			errors.push({
				key: 'searchFilter',
				message: 'Invalid JSON'
			})
		}
	}

	options.sortField = req.query.sortField
	options.sortOrder = req.query.sortOrder
	options.export = true

	let validSortFields = ['valuation.timestamp', 'valuation.source', 'valuation.status', 'valuation.username', 'treasury.name', 'valuation.value', 'valuation.awarderUsername']
	if (!validSortFields.includes(options.sortField)) {
		errors.push({
			key: 'sortField',
			message: 'Not a valid sort field'
		})
	}

	if (options.sortOrder !== "ASC" && options.sortOrder !== "DESC") {
		errors.push({
			key: 'sortOrder',
			message: 'Not a valid sort order'
		})
	}

	if (errors.length) {
		res.status(422).send({
			message: 'Validation failed',
			errors
		})
		return
	}

	try {
		logger.debug("Getting all valuations - export: %O", options)
		let result = await Valuation.getAll(options)
		result.map(e => {
			if (e.timestamp) {
				e.timestamp = (new Date(e.timestamp * 1000)).toLocaleString("en-US", { timeZone: "UTC", hour12: false })
			}
			
			if (e.transactionTimestamp) {
				e.transactionTimestamp = (new Date(e.transactionTimestamp * 1000)).toLocaleString("en-US", { timeZone: "UTC", hour12: false })
			}
			
			if (e.royaltyTransactionTimestamp) {
				e.royaltyTransactionTimestamp = (new Date(e.royaltyTransactionTimestamp * 1000)).toLocaleString("en-US", { timeZone: "UTC", hour12: false })
			}

			if (e.explorerUrl && e.explorerUrl !== "") {
				if (e.transactionHash) {
					e.transactionHash = e.explorerUrl.replace('%s', e.transactionHash)
				}

				if (e.royaltyTransactionHash) {
					e.royaltyTransactionHash = e.explorerUrl.replace('%s', e.royaltyTransactionHash)
				}
			}

			delete e.explorerUrl

			return e;
		})

		const csvStringifier = csvWriter.createObjectCsvStringifier({
			header: Object.keys(result[0]).map(e => { return { id: e, title: e }})
		});
	
		res.send(csvStringifier.getHeaderString() + csvStringifier.stringifyRecords(result))
	} catch (err) {
		logger.error(`Error on retrieving valuations - export: %O`, err)
		res.status(500).send({
			message: "Error on retrieving valuations on export"
		})
	}
}