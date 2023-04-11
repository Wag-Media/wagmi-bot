const axios = require("axios")
const Valuation = require("./model/valuation")
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

const now = Math.floor(Date.now() / 1000) - (30 * 24 * 60 * 60)

async function main() {
    const valuations = await Valuation.getAll({})
    const filtered = valuations.filter(e => e.timestamp > now)
    const valuationCount = filtered.length
    
    let i = 1
    for (let valuation of filtered) {
        console.log(`Processing valuation (${i}/${valuationCount})`)
        const channelId = valuation.messageLink.split('/')[5]

        try {
            const message = await axios.get(`https://discord.com/api/channels/${channelId}/messages/${valuation.messageId}`, {
                headers: {
                    "User-Agent": "DiscordBot (wagmi, 1.0)",
                    "Authorization": `Bot ${process.env.BOT_TOKEN}`
                }
            });

            await checkRateLimit(message.headers)

            if (message.data) {

                let content = message.data.content
                if (content === null || content === '') {
                    if (message.data.embeds.length > 0) {
                        content = message.data.embeds[0].data.description
                    }
                }

                await sql.execute("REPLACE INTO valuation_content (messageId, content, timestamp) VALUES (?, ?, ?)", [
                    valuation.messageId,
                    content,
                    valuation.timestamp
                ])

                /*if (!valuation.awarderId) {
                    const reactionEmoji = cachedEmojis.find(e => e.id == valuation.discordEmojiId)
                    const emojiEncoded = encodeURI(`:${reactionEmoji.name}:${reactionEmoji.id}`)
                    
                    const reaction = await axios.get(`https://discord.com/api/channels/${channelId}/messages/${valuation.messageId}/reactions/${emojiEncoded}`, {
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
                }*/
            }
        } catch(e) {}

        i++
    }

    process.exit();
}

main()
