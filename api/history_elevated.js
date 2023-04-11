const axios = require("axios")
const Valuation = require("./model/valuation")
const Elevation = require("./model/elevation")
const cache = require("./lib/cache")
const sql = require("./lib/sql.js")

const cachedEmojis = cache.read('emojis', 180000000000)

const delay = ms => new Promise(resolve => setTimeout(resolve, ms))

const checkRateLimit = async headers => {
    let delayTime = 0
    if (parseInt(headers['x-ratelimit-remaining']) <= 0) {
        delayTime = parseInt(headers['x-ratelimit-reset-after']) * 1000
	console.log('waiting')
    }

    await delay(delayTime)
}

async function main() {
    let valuations = await Valuation.getAll({})
    valuations = valuations.filter(e => e.awarderId === null)
    const valuationCount = valuations.length

    let i = 1
    for (let valuation of valuations) {
        console.log(`Processing valuation (${i}/${valuationCount})`)

        if (!valuation.awarderId) {
            const elevations = await Elevation.find([{ oldMessageId: valuation.messageId }])
            for (let elevated of elevations) {
                try {
                    const messageId = elevated.newMessageId
                    const channelId = elevated.newChannelId
                    const reactionEmoji = cachedEmojis.find(e => e.id == valuation.discordEmojiId)
                    const emojiEncoded = encodeURI(`:${reactionEmoji.name}:${reactionEmoji.id}`)

                    const reaction = await axios.get(`https://discord.com/api/channels/${channelId}/messages/${messageId}/reactions/${emojiEncoded}`, {
                        headers: {
                            "User-Agent": "DiscordBot (wagmi, 1.0)",
                            "Authorization": `Bot ${process.env.BOT_TOKEN}`
                        }
                    });

                    if (reaction.data.length) {
                        const reactor = reaction.data[0]
                        await sql.execute("UPDATE valuation SET awarderId = ?, awarderUsername = ? WHERE id = ?", [
                            reactor.id,
                            reactor.username,
                            valuation.id
                        ])
                    }

                    await checkRateLimit(reaction.headers)
                } catch (e) { }
            }
        } else {
            console.log(`skipping, already set`)
        }

        i++
    }

    process.exit();
}

main()

