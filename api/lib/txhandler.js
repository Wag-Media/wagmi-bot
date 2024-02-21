const sql = require("./sql.js")
const botIo = require("./io").getIO()
const Web3 = require('web3')
const { ApiPromise, Keyring, WsProvider } = require('@polkadot/api')
const polkadotUtil = require("@polkadot/util-crypto")
const crypto = require("./crypto")
const logger = require("./logger")

/**
 * Transaction Handler which submits transactions based on valuated messages and royalties
 * 
 * Status Values:
 * 1 - Pending
 * 2 - Transaction submitted
 * 3 - Insufficient Balance in payout wallet
 * 4 - General Transaction Error
 * 5 - No receiver address specified
 * 6 - Insufficient Asset Balance (Statemine/Statemint)
 * 7 - Invalid encryption key
 */
class TransactionHandler {
    isRunning = false
    currentIo = null
    currentTransactionIndex = 0
    currentTransactionTotal = 0
    encryptionKey = null
    config = {}
    failedTreasuries = []
    erc20Abi = [
        {
            "inputs": [
                {
                    "name": "to",
                    "type": "address"
                },
                {
                    "name": "amount",
                    "type": "uint256"
                }
            ],
            "name": "transfer",
            "outputs": [
                {
                    "name": "",
                    "type": "bool"
                }
            ],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "constant": true,
            "inputs": [
                {
                    "name": "_owner",
                    "type": "address"
                }
            ],
            "name": "balanceOf",
            "outputs": [
                {
                    "name": "balance",
                    "type": "uint256"
                }
            ],
            "type": "function"
        }
    ]

    /**
     *  Start the processing transactions
     * 
     * @param io - client socket receiving status updates
     * @param encryptionKey - encryptionKey sent by client for decrypting mnemonics/private keys
     */
    async run(io, encryptionKey, treasuryId) {
        this.isRunning = true
        this.currentIo = io
        this.currentTransactionIndex = 1
        this.encryptionKey = encryptionKey
        this.treasuryId = treasuryId
        this.failedTreasuries = []

        /** Get all valuated messages and royalties to process **/
        let [valuatedMessages] = await sql.query(`
            SELECT valuation.*, user.evmAddress, user.substrateAddress, treasury.coinName, treasury.name, treasury.type, treasury.rpcUrl, treasury.chainPrefix, treasury.mnemonic, treasury.isNative, treasury.parachainType, treasury.tokenAddress, treasury.tokenDecimals, treasury.chainOptions, treasury.privateKey, treasury.royaltyEnabled, treasury.royaltyAddress, treasury.royaltyPercentage, treasury.assetId, treasury.sendMinBalance, treasury.sendExistentialDeposit 
            FROM valuation 
            LEFT JOIN treasury ON (treasury.id = valuation.treasuryId) 
            LEFT JOIN user ON (user.id = valuation.userId) 
            WHERE valuation.transactionHash IS NULL AND valuation.treasuryId = ? ORDER BY valuation.timestamp ASC`, [this.treasuryId]);
    
        let [royalties] = await sql.query(`
            SELECT valuation.*, treasury.coinName, treasury.name, treasury.type, treasury.rpcUrl, treasury.chainPrefix, treasury.mnemonic, treasury.isNative, treasury.parachainType, treasury.tokenAddress, treasury.tokenDecimals, treasury.chainOptions, treasury.privateKey, treasury.royaltyEnabled, treasury.royaltyAddress, treasury.royaltyPercentage, treasury.assetId, treasury.sendMinBalance, treasury.sendExistentialDeposit 
            FROM valuation 
            LEFT JOIN treasury ON (treasury.id = valuation.treasuryId) 
            WHERE valuation.royaltyValue IS NOT NULL AND valuation.royaltyTransactionHash IS NULL AND valuation.treasuryId = ? ORDER BY valuation.timestamp ASC`, [this.treasuryId]);
    
        // Aggregate valuated messages by user and treasury ID
        let aggregatedMessages = this.aggregateValuatedMessages(valuatedMessages);
    
        // Aggregate royalties by treasury ID
        //let aggregatedRoyalties = this.aggregateRoyalties(royalties);
    
        // Process aggregated valuated messages
        await this.processAggregatedMessages(aggregatedMessages);
    
        // Process aggregated royalties
        //await this.processAggregatedRoyalties(aggregatedRoyalties);
    
        // Assuming currentTransactionTotal reflects the number of transactions to process
        this.currentTransactionTotal = Object.keys(aggregatedMessages).length;
    
        /** Emit processing status update **/
        this.currentIo.emit('processing', { current: this.currentTransactionIndex, total: this.currentTransactionTotal });
    
        this.isRunning = false;
        this.encryptionKey = null;
        this.currentIo.emit('processed');
    }

    /**
     * Aggregates valuated messages by user and treasury ID.
     * 
     * @param valuatedMessages - Array of valuated message objects to be aggregated.
     * @returns {Object} - Aggregated messages keyed by a unique combination of userId and treasuryId.
     */
    aggregateValuatedMessages(valuatedMessages) {
        let aggregated = {};

        // Iterate over each valuated message to aggregate them
        valuatedMessages.forEach(msg => {
            // Create a unique key for each combination of user and treasury
            const key = `${msg.userId}-${msg.treasuryId}`;

            // If this is the first message for the key, initialize the aggregation entry
            if (!aggregated[key]) {
                aggregated[key] = {
                    userId: msg.userId,
                    treasuryId: msg.treasuryId,
                    messages: [msg.id], // Start with the current message ID
                    value: msg.value, // Initial total value
                    // Copy other relevant details from the message
                    coinName: msg.coinName,
                    type: msg.type,
                    substrateAddress: msg.substrateAddress,
                    evmAddress: msg.evmAddress,
                    chainOptions: msg.chainOptions ? (typeof msg.chainOptions === 'string' ? JSON.parse(msg.chainOptions) : msg.chainOptions) : {},
                    mnemonic: msg.mnemonic,
                    isNative: msg.isNative,
                    parachainType: msg.parachainType,
                    tokenAddress: msg.tokenAddress,
                    tokenDecimals: msg.tokenDecimals,
                    rpcUrl: msg.rpcUrl,
                    chainPrefix: msg.chainPrefix,
                    privateKey: msg.privateKey,
                    royaltyEnabled: msg.royaltyEnabled,
                    royaltyAddress: msg.royaltyAddress,
                    royaltyPercentage: msg.royaltyPercentage,
                    assetId: msg.assetId,
                    sendMinBalance: msg.sendMinBalance,
                    sendExistentialDeposit: msg.sendExistentialDeposit
                };
            } else {
                // For existing keys, update totalValue and append message ID
                aggregated[key].value += msg.value;
                aggregated[key].messages.push(msg.id);
            }
            // Log the aggregation process for debugging
            logger.debug(`Aggregating message for key ${key}: `, aggregated[key]);
        });

        return aggregated;
    }


    /**
     * Processes aggregated messages for payouts, handling both Substrate and EVM transactions.
     * @param {Object} aggregatedMessages - Aggregated messages by user and treasury ID.
     */
    async processAggregatedMessages(aggregatedMessages) {
        // Iterate over each aggregated message group
        for (const [key, aggMsg] of Object.entries(aggregatedMessages)) {
            let address;

            // Determine address based on transaction type
            if (aggMsg.type === 'substrate') {
                address = aggMsg.substrateAddress;
                // Skip if substrate address is missing
                if (!address || address === '') {
                    logger.warn(`Skipping payout for aggregated group ${key} due to missing Substrate address.`);
                    await Promise.all(aggMsg.messages.map(msgId => 
                        sql.execute('UPDATE valuation SET status = 5 WHERE id = ?', [msgId])
                    ));
                    continue;
                }
            } else if (aggMsg.type === 'evm') {
                address = aggMsg.evmAddress;
                // Skip if EVM address is missing
                if (!address || address === '') {
                    logger.warn(`Skipping payout for aggregated group ${key} due to missing EVM address.`);
                    await Promise.all(aggMsg.messages.map(msgId => 
                        sql.execute('UPDATE valuation SET status = 5 WHERE id = ?', [msgId])
                    ));
                    continue;
                }
            }

            try {
                let transactionHash, minBalanceBumped, sentExistentialDeposit;

                // Process substrate transactions
                if (aggMsg.type === 'substrate') {
                    ({ transactionHash, minBalanceBumped, sentExistentialDeposit } = await this.submitSubstrateTransaction(aggMsg));
                    // Update database for substrate transactions
                    await Promise.all(aggMsg.messages.map(msgId => 
                        sql.execute('UPDATE valuation SET status = ?, transactionHash = ?, transactionTimestamp = ?, minBalanceBumped = ?, sentExistentialDeposit = ? WHERE id = ?', 
                                    [2, transactionHash, Math.floor(Date.now() / 1000), minBalanceBumped, sentExistentialDeposit, msgId])
                    ));
                } else {
                    // Process EVM transactions
                    transactionHash = await this.submitEVMTransaction(aggMsg);
                    // Update database for EVM transactions
                    await Promise.all(aggMsg.messages.map(async (msgId) => {
                        logger.info(`Updating valuation record for msgId: ${msgId} with transactionHash: ${transactionHash}`);

                        await sql.execute('UPDATE valuation SET status = ?, transactionHash = ?, transactionTimestamp = ? WHERE id = ?', 
                                        [2, transactionHash, Math.floor(Date.now() / 1000), msgId]);
                    }));
                }

                logger.info(`Transactions for aggregated messages (${key}) submitted: ${transactionHash}`);
            } catch (error) {
                // Handle errors and update status accordingly
                let status = this.determineErrorStatus(error.message);
                await Promise.all(aggMsg.messages.map(msgId => 
                    sql.execute('UPDATE valuation SET status = ? WHERE id = ?', [status, msgId])
                ));

                if (status != 4) {
                    logger.error(`Skipping next transactions for treasury '${aggMsg.treasuryId}' due to error: ${error.message}`);
                    this.failedTreasuries.push(aggMsg.treasuryId);
                }

                logger.error(`Error processing aggregated messages (${key}): ${error}`);
            }

            // Update processing status
            this.currentTransactionIndex += aggMsg.messages.length;
            this.currentIo.emit('processing', { current: this.currentTransactionIndex, total: this.currentTransactionTotal });
        }
    }



    /**
     * Submit a substrate transaction
     * 
     * @param data - entity data for valuated messages/royalty fee
     * @param royalty - is a royalty transaction
     * @returns 
     */
    async submitSubstrateTransaction(data, royalty = false) {
        /** Define provder details for node connection, without retrying on error **/
        const wsProvider = new WsProvider(data.rpcUrl, 0, null, 90000)
        try {
            const keyRing = new Keyring({ type: 'sr25519' })

            let options = {}
            let chainOptions = {};

            /** Options need to be specified for specific chains **/
            if (data.chainOptions) {
                if (typeof data.chainOptions === "string" && data.chainOptions !== "null" && data.chainOptions !== "undefined") {
                    try {
                        chainOptions = JSON.parse(data.chainOptions);
                    } catch (e) {
                        logger.error(`Error processing chain options (${key}): ${e.message || JSON.stringify(e)}`);

                        // Optionally set chainOptions to a default value or keep it as {}
                    }
                } else if (typeof data.chainOptions === "object") {
                    chainOptions = data.chainOptions; // Assuming it's already a properly formatted object
                }
            }

            if (!chainOptions.types) {
                chainOptions.types = {}
            }

            if (!chainOptions.options) {
                chainOptions.options = { tip: 0 }
            }

            options.provider = wsProvider
            options.throwOnConnect = true
            options.types = chainOptions.types

            const tip = Web3.utils.toBN(chainOptions.options?.tip ?? 0)

            let api = new ApiPromise(options)

            /** Connect to provider **/
            wsProvider.connect()

            /** Wait for connection to establish or throw an error **/
            await api.isReadyOrError

            /** Get chain properties **/
            const chainProperties = await api.rpc.system.properties()

            /** Get tokenDecimals **/
            const tokenDecimals = chainProperties.tokenDecimals
                .unwrapOrDefault()
                .toArray()
                .map((i) => i.toNumber())

            /** Set wallet account decrypting mnemonic saved in database with the encryption key provided by the client **/
            const treasuryAccount = keyRing.addFromUri(crypto.decrypt(data.mnemonic, this.encryptionKey))

            /** Set SS58 chain prefix **/
            keyRing.setSS58Format(data.chainPrefix)

            let value = data.value
            if (royalty) {
                /** If it is royalty transaction, use the royaltyValue **/
                value = data.royaltyValue
            } else {
                /** Otherwise use the normal value and substract the royaltyValue if specified **/
                if (data.royaltyValue) value -= data.royaltyValue
            }

            /** reeiverAddress defaults to treasury royaltyAddress **/
            let receiverAddress = data.royaltyAddress
            if (!royalty) {
                /** If not a royalty transaction, receiverAddress is any substrate address submitted by the user **/
                receiverAddress = data.substrateAddress
            }

            /** Flags if minBalance has been bumped and if existential depost has been sent **/
            let minBalanceBumped = 0
            let sentExistentialDeposit = 0
            let transactionPromiseResolve = null
            let transactionPromiseReject = null

            /** Treasury setting, send existential deposit to receiver **/
            if (data.sendExistentialDeposit === 1) {
                /** Check if this user has already received existential deposit for this substrate chain **/
                let [existentialDeposits] = await sql.query(`SELECT * FROM existential_deposit WHERE userId = ? AND chainPrefix = ? LIMIT 1`, [data.userId, data.chainPrefix])

                if (existentialDeposits.length == 0) {
                    /** Get existential deposit constant **/
                    const existentialDeposit = api.consts.balances.existentialDeposit.toBn()

                    /** Get receiver balance and payout wallet balance **/
                    const receiverBalance = (await api.query.system.account(receiverAddress)).data.free.toBn()
                    const accountBalance = (await api.query.system.account(treasuryAccount.address)).data.free.toBn()

                    /** Receiver has not enough existential deposit balance, set flag for existential deposit being sent **/
                    if (existentialDeposit.gt(receiverBalance)) {
                        sentExistentialDeposit = 1
                        /** Payout wallet has not enough balance for transaction **/
                        if (existentialDeposit.gte(accountBalance.sub(tip))) {
                            throw new Error('Insufficient Balance')
                        }

                        let existentialTransactionPromise = new Promise(function (resolve, reject) {
                            transactionPromiseResolve = resolve;
                            transactionPromiseReject = reject;
                        });

                        /** Send existential deposit to receiver **/
                        api.tx.balances.transferKeepAlive(polkadotUtil.encodeAddress(receiverAddress, data.chainPrefix), existentialDeposit).signAndSend(treasuryAccount, { ...chainOptions.options, nonce: -1 }, ({ status, txHash, dispatchError }) => {
                            if (status.isInBlock || status.isFinalized) {
                                if (!dispatchError) {
                                    transactionPromiseResolve(txHash.toHex())
                                } else {
                                    if (dispatchError.isModule) {
                                        const decoded = api.registry.findMetaError(dispatchError.asModule)
                                        const { docs, name, section } = decoded
                                        
                                        transactionPromiseReject(new Error(`Transaction Handler:  Substrate Existential Deposit Transaction failed:  ${section}.${name}: ${docs.join(' ')}`))
                                    } else {
                                        transactionPromiseReject(new Error("Transaction Handler: Substrate Existential Deposit Transaction failed: " + dispatchError.toString()))
                                    }
                                }
                            } else if (status.isInvalid || status.isUsurped || status.isDropped || status.isFinalityTimeout) {
                                let txStatus = 'invalid'
                                if (status.isUsurped) {
                                    txStatus = 'usurped'
                                } else if (status.isDropped) {
                                    txStatus = 'dropped'
                                } else if (status.isFinalityTimeout) {
                                    txStatus = 'timeout'
                                }

                                transactionPromiseReject(new Error(`Transaction Handler: Substrate Existential Deposit Transaction failed: transaction ${txStatus}`))
                            }
                        })

                        let existentialDepositTxHash = await existentialTransactionPromise

                        await sql.execute("INSERT INTO existential_deposit (userId, chainPrefix, transactionHash) VALUES (?, ?, ?)", [
                            data.userId,
                            data.chainPrefix,
                            existentialDepositTxHash
                        ])

                        logger.info("Transaction Handler: Substrate Existential Deposit Transaction submiited: %s", existentialDepositTxHash)
                    }
                }
            }

            if (data.parachainType === 0) {
                /** Native Token **/

                /** Calculate valuation amount to send to receiver **/
                const fullAmount = this.convertAmount(value, tokenDecimals[0])

                /** Check if payout wallet has enough balance to send the transaction **/
                const accountBalance = (await api.query.system.account(treasuryAccount.address)).data.free.toBn()
                if (fullAmount.gte(accountBalance.sub(tip))) {
                    throw new Error(`Insufficient Balance`)
                }

                /** Send valuation amount to receiver **/
                let transactionPromise = new Promise(function (resolve, reject) {
                    transactionPromiseResolve = resolve;
                    transactionPromiseReject = reject;
                });

                api.tx.balances.transferKeepAlive(polkadotUtil.encodeAddress(receiverAddress, data.chainPrefix), fullAmount).signAndSend(treasuryAccount, { ...chainOptions.options, nonce: -1 }, ({ status, txHash, dispatchError }) => {
                    if (status.isInBlock || status.isFinalized) {
                        if (!dispatchError) {
                            transactionPromiseResolve(txHash.toHex())
                        } else {
                            if (dispatchError.isModule) {
                                  const decoded = api.registry.findMetaError(dispatchError.asModule);
                                  const { docs, name, section } = decoded;
                                  
                                  transactionPromiseReject(new Error(`Transaction Handler: Substrate Transaction failed:  ${section}.${name}: ${docs.join(' ')}`))
                            } else {
                                transactionPromiseReject(new Error("Transaction Handler: Substrate Transaction failed: " + dispatchError.toString()))
                            }
                        }
                    } else if (status.isInvalid || status.isUsurped || status.isDropped || status.isFinalityTimeout) {
                        let txStatus = 'invalid'
                        if (status.isUsurped) {
                            txStatus = 'usurped'
                        } else if (status.isDropped) {
                            txStatus = 'dropped'
                        } else if (status.isFinalityTimeout) {
                            txStatus = 'timeout'
                        }

                        transactionPromiseReject(new Error(`Transaction Handler: Substrate Transaction failed: transaction ${txStatus}`))
                    }
                })

                let transactionHash = await transactionPromise

                await wsProvider.disconnect()

                /** Return transaction hash and flags **/
                return { transactionHash, minBalanceBumped, sentExistentialDeposit }
            } else {
                /** Asset */

                /** Get asset decimals **/
                const assetDecimals = (await api.query.assets.metadata(data.assetId)).decimals

                /** Calculate asset amount to send to receiver **/
                const assetAmount = this.convertAmount(value, assetDecimals);

                /**  */
                let assetAmountToSend = assetAmount

                /** Query receiver asset balance, payout wallet asset balance and asset min balance needed  **/
                const receiverAssetBalanceQuery = await api.query.assets.account(data.assetId, polkadotUtil.encodeAddress(receiverAddress, data.chainPrefix))
                const receiverAssetBalance = receiverAssetBalanceQuery.isSome ? receiverAssetBalanceQuery.unwrap().balance : Web3.utils.toBN(0)
                const accountAssetBalanceQuery = await api.query.assets.account(data.assetId, treasuryAccount.address)
                const accountAssetBalance = accountAssetBalanceQuery.isSome ? accountAssetBalanceQuery.unwrap().balance : Web3.utils.toBN(0)
                const assetMinBalance = (await api.query.assets.asset(data.assetId)).unwrap().minBalance

                /** if treasury setting enabled to send min balance if receiver asset balance is not sufficient **/
                if (data.sendMinBalance === 1 && assetMinBalance.gt(receiverAssetBalance)) {
                    /** No need to bump the amount if the valuation amount is already bigger than the asset min balance, otherwise set flag and bump amount to send to asset min balance **/
                    if (assetAmount.lte(assetMinBalance)) {
                        minBalanceBumped = 1
                        assetAmountToSend = assetMinBalance
                    }
                }

                /** Payout wallet has not enough balance for transaction **/
                if (assetAmountToSend.gte(accountAssetBalance)) {
                    throw new Error(`Insufficient Asset Balance`)
                }

                let transactionPromise = new Promise(function (resolve, reject) {
                    transactionPromiseResolve = resolve;
                    transactionPromiseReject = reject;
                });

                /** Send amount to receiver **/
                api.tx.assets.transferKeepAlive(data.assetId, polkadotUtil.encodeAddress(receiverAddress, data.chainPrefix), assetAmountToSend).signAndSend(treasuryAccount, { ...chainOptions.options, nonce: -1 }, ({ status, txHash, dispatchError }) => {
                    if (status.isInBlock || status.isFinalized) {
                        if (!dispatchError) {
                            transactionPromiseResolve(txHash.toHex())
                        } else {
                            if (dispatchError.isModule) {
                                const decoded = api.registry.findMetaError(dispatchError.asModule);
                                const { docs, name, section } = decoded;
                                
                                transactionPromiseReject(new Error(`Transaction Handler: Substrate Asset Transaction failed:  ${section}.${name}: ${docs.join(' ')}`))
                            } else {
                                transactionPromiseReject(new Error("Transaction Handler: Substrate Asset Transaction failed: " + dispatchError.toString()))
                            }
                        }
                    } else if (status.isInvalid || status.isUsurped || status.isDropped || status.isFinalityTimeout) {
                        let txStatus = 'invalid'
                        if (status.isUsurped) {
                            txStatus = 'usurped'
                        } else if (status.isDropped) {
                            txStatus = 'dropped'
                        } else if (status.isFinalityTimeout) {
                            txStatus = 'timeout'
                        }

                        transactionPromiseReject(new Error(`Transaction Handler: Substrate Asset Transaction failed: transaction ${txStatus}`))
                    }
                })

                let transactionHash = await transactionPromise

                await wsProvider.disconnect()

                /** Return transaction hash and flags **/
                return { transactionHash, minBalanceBumped, sentExistentialDeposit }
            }
        } catch (e) {
            await wsProvider.disconnect()
            throw e
        }
    }

    async submitEVMTransaction(data, royalty = false) {
        try {
            logger.info(`submitEVMTransaction called with data: ${JSON.stringify(data)} and royalty: ${royalty}`);
    
            /** Connect to node **/
            const web3 = new Web3(data.rpcUrl);
            logger.info(`Web3 initialized with RPC URL: ${data.rpcUrl}`);

            /** Get wallet account decrypting mnemonic saved in database with the encryption key provided by the client **/
            const decryptedPrivateKey = crypto.decrypt(data.privateKey, this.encryptionKey);
            const treasuryAccount = web3.eth.accounts.privateKeyToAccount(decryptedPrivateKey);
            logger.info(`Treasury account loaded: ${treasuryAccount.address}`);

            let value = data.value;
            if (royalty) {
                /** If it is a royalty transaction, use the royaltyValue **/
                value = data.royaltyValue;
                logger.info(`Handling as royalty transaction with value: ${value}`);
            } else {
                /** Otherwise use the normal value and subtract the royaltyValue if specified **/
                if (data.royaltyValue) value -= data.royaltyValue;
                logger.info(`Handling as regular transaction with value: ${value}`);
            }

            /** ReceiverAddress defaults to treasury royaltyAddress **/
            let receiverAddress = royalty ? data.royaltyAddress : data.evmAddress;
            logger.info(`Receiver address determined as: ${receiverAddress}`);

            /** Calculate amount to be sent **/
            const fullAmount = this.convertAmount(value, data.tokenDecimals);
            logger.info(`Full amount to be sent: ${fullAmount.toString()}`);

            if (data.isNative === 1) {
                /** Native Token **/
                const balanceFrom = Web3.utils.toBN(await web3.eth.getBalance(treasuryAccount.address));
                logger.info(`Payout wallet balance: ${balanceFrom.toString()}`);

                if (fullAmount.gte(balanceFrom)) {
                    logger.error(`Insufficient Balance to send ${fullAmount.toString()}`);
                    throw new Error(`Insufficient Balance`);
                }
                logger.info(`Signing tx`);
                /** Create and sign Transaction **/
                
                const createTransaction = await web3.eth.accounts.signTransaction(
                    {
                        gas: 21000,
                        to: receiverAddress,
                        value: fullAmount.toString(),
                    },
                    treasuryAccount.privateKey
                )
                logger.info(`TX signed`);
                /** Send signed transaction **/
                const createReceipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction)
                logger.info(`Receipt: ${createReceipt.transactionHash}`);
                /** Return transactionHash **/
                return createReceipt.transactionHash
            } else {
                /** Contract token (ex ERC20s) **/
                let contract = new web3.eth.Contract(this.erc20Abi, data.tokenAddress)

                /** Get balance of payout wallet **/
                const accountBalance = Web3.utils.toBN(await contract.methods.balanceOf(treasuryAccount.address).call())

                /** Not enough balance **/
                if (fullAmount.gte(accountBalance)) {
                    throw new Error(`Insufficient Balance`)
                }

                /** Calculate data needed for transfer method **/
                const nonce = await web3.eth.getTransactionCount(treasuryAccount.address)

                const tx = contract.methods.transfer(receiverAddress, fullAmount)
                const gas = await tx.estimateGas({ from: treasuryAccount.address })
                const gasPrice = await web3.eth.getGasPrice()
                const encodedData = tx.encodeABI()

		logger.info(`Transaction Details:\naccountBalance:${accountBalance}\nnonce: ${nonce}\ngas: ${gas}\ngasPrice: ${gasPrice}\nencodedData: ${encodedData}`)

                /** Create and sign Transaction **/
                const createTransaction = await web3.eth.accounts.signTransaction(
                    {
                        to: data.tokenAddress,
                        data: encodedData,
                        gasLimit: gas,
                        gasPrice: gasPrice,
                        value: 0,
                        nonce: nonce,
                    },
                    treasuryAccount.privateKey
                )
		logger.info(`createTransaction: %s`, createTransaction)
                /** Send signed transaction **/
                const createReceipt = await web3.eth.sendSignedTransaction(createTransaction.rawTransaction)

                /** Return transactionHash **/
                return createReceipt.transactionHash
            }
        }  catch (e) {
            logger.error(`Error in submitEVMTransaction: ${e.message}`, e);
            throw e; // Re-throw the error for further handling
        }
    }


    /**
     * Handle transactions for royalties of valuated messages
     * 
     * @param rows - entities to be processed
     */
    async handleRoyalties(rows) {
        logger.info(`Transaction Handler: Handling %d royalties`, rows.length)
        for (let row of rows) {
            if (this.failedTreasuries.includes(row.treasuryId)) continue;

            logger.info(`Transaction Handler: Handling royalty for valuation Id %d`, row.id)

            try {
                if (row.type === 'substrate') {
                    /** Process Substrate Transaction */
                    let { transactionHash, minBalanceBumped, sentExistentialDeposit } = await this.submitSubstrateTransaction(row, true).catch(e => { throw e })

                    /** Main Transaction successful; set royalty status = 2, save royalty txHash and royalty timestamp and set royalty flags if the balance has been bumped to minBalance and if existential deposit balance has been sent  **/
                    await sql.execute('UPDATE valuation SET royaltyStatus = ?, royaltyTransactionHash = ?,royaltyTransactionTimestamp = ?, royaltyMinBalanceBumped = ?, royaltySentExistentialDeposit = ? WHERE id = ?', [2, transactionHash, Math.floor(Date.now() / 1000), minBalanceBumped, sentExistentialDeposit, row.id])
                
                    logger.info('Transaction Handler: Royalty transaction for valuation Id %d submitted: %s', row.id, transactionHash)
                } else {
                    /** Process Substrate Transaction */
                    let transactionHash = await this.submitEVMTransaction(row, true).catch(e => { throw e })

                    /** Main Transaction successful; set royalty status = 2, save royalty txHash and royalty timestamp  **/
                    await sql.execute('UPDATE valuation SET royaltyStatus = ?, royaltyTransactionHash = ?,royaltyTransactionTimestamp = ? WHERE id = ?', [2, transactionHash, Math.floor(Date.now() / 1000), row.id])

                    logger.info('Transaction Handler: Royalty transaction for valuation Id %d submitted: %s', row.id, transactionHash)
            }
        } catch (e) {
                logger.error("Transaction Handler: Error on processing royalty for valuation Id %d: %O", row.id, err)

                /** Something went wrong, set royalty status for given error message **/
                let status = 4
                if (e.message) {
                    if (e.message === "Insufficient Balance") {
                        status = 3
                    } else if (e.message === "Insufficient Asset Balance") {
                        status = 6
                    } else if (e.message === "Invalid encryption key") {
                        status = 7
                    }
                }

                if (status != 4) {
                    logger.error("Skipping next transactions for treasury '%s'", row.name)
                    this.failedTreasuries.push(row.treasuryId)
                }

                await sql.execute('UPDATE valuation SET royaltyStatus = ? WHERE id = ?', [status, row.id])
            }

            this.currentTransactionIndex++
            /** Update client transaction process **/
            this.currentIo.emit('processing', { current: this.currentTransactionIndex, total: this.currentTransactionTotal })
        }
    }
    
    /**
     * Determines the error status code based on the given error message.
     * This function maps specific error messages to predefined status codes that
     * represent different types of transaction errors in the system.
     * 
     * @param {string} errorMessage - The error message received from an operation.
     * @returns {number} - The status code corresponding to the type of error.
     */
    determineErrorStatus(errorMessage) {
        switch(errorMessage) {
            case "Insufficient Balance":
                // Status code for insufficient balance in the payout wallet.
                return 3;
            case "Insufficient Asset Balance":
                // Status code for insufficient asset balance (e.g., for tokens in a specific blockchain).
                return 6;
            case "Invalid encryption key":
                // Status code for errors related to decryption or encryption key issues.
                return 7;
            default:
                // A general transaction error status code for all other types of errors.
                return 4;
        }
    }


        
    /**
     * Converts a numeric amount into its smallest unit based on the specified number of decimals.
     * This is useful for converting currency amounts into a format suitable for blockchain transactions,
     * where values are often represented in the smallest unit (e.g., Wei for Ethereum).
     * 
     * @param {number|string} amount - The amount to convert, which can be a number or a string.
     * @param {number} decimals - The number of decimal places to consider for the conversion.
     * @returns {BigNumber} - The amount converted to its smallest unit as a BigNumber.
     */
    convertAmount(amount, decimals) {
        // Convert the amount to a string to ensure accurate representation
        const amountString = amount.toString();
        
        // Split the string into whole and decimal parts
        let [whole, decimal] = amountString.split('.');
        
        // Ensure the decimal part exists. If not, pad it with zeros up to the specified decimals.
        // Then, truncate or pad the decimal part to ensure it matches the specified decimals length.
        decimal = (decimal || '').padEnd(decimals, '0').substring(0, decimals);
        
        // Combine the whole part and the adjusted decimal part back into a single string
        const combined = whole + decimal;
        
        // Convert the combined string to a BigNumber for accurate arithmetic and return.
        // This BigNumber represents the amount in its smallest unit (e.g., Wei for ETH).
        return Web3.utils.toBN(combined);
    }

    
}

module.exports = new TransactionHandler()