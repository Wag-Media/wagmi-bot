# CHANGELOG

## 1.2.3

### Changes
* API: Add history scripts for analytics backend
* Client/Report: Modified nginx configuration
* Gobal: Templatize application stack
* API: Added more logging information around transaction handling
* Report: Added Modsecurity configurations

### Bugfixes
* Bot: Version lock node build to 18.15.0
* API: Version lock node build to 18.15.0
* API: Committed previous hotfix for handling an integer as fixed point


## 1.2.2

### Changes
* Bot: Director and normal elevations for threads added
### Bugfixes
* API: Creation of treasuries fixed

## 1.2.1.3 Hotfix
### Bugfixes
* API: TransactionHandler handling decimals values
* Bot: Thread handling for valuations

## 1.2.1.2 Hotfix
### Bugfixes
* Bot: Condition for removing valuated messages fixed
* Bot: Tier and restriction system does now check for the parent channel data if valuated in a thread

## 1.2.1.1 Hotfix
### Bugfixes
* Bot: Tiered awards are now based on old channel if it is an elevated message

## 1.2.1
### Changes
* API/Bot/Client: Added channel criteria for tier system 

## 1.2.0.1 Hotfix
### Bugfixes
* API: Misplaced routing options
* API: Transaction Handler exception fixed because of BN not able to convert large strings
## 1.2.0
### Changes
* API: Explorer URL is not mandatory anymore for treasuries
* API/Bot/Client: Director restrictions for treasuries added
* API/Bot/Client: Treasury tiers added
* API/Client: Verified user overview page refactored and export functionality added
* Bot: Valuation reactions by non-directors will be removed immediately

### Bugfixes
* API: Valuation content pruning logic fixed
* API: Rate limits for Discord API requests are now respected
* Bot: Removing a valuation emoji only deletes the valuation now if the valuation has not been rewarded yet
* Client: Pagination fix for emoji and treasury overview page

## 1.1.8
### Changes
* API/Bot: Added content tracking that will be pruned after 30 days
* API/Bot/Client/Report: Added director tracking for valuations
* API/Client: Replaced some data tables with vuetify component
* API/Client: Added export for valuated messages
* API/Client/Report: Added explorerUrl to treasuries for generating transaction urls
* API: Cache expiration timeframe can be set individually, upped timeframe for user data
* API: Enhanced Discord Rate Limit Checker

## 1.1.7
### Changes
* Report: config files are now mounted and not copied into the container
* Report: Little adjustments to the config files
### Bugfixes
* Report: API Request triggered twice when navigating

## 1.1.6
### Changes
* API/Bot: Container changed to node:current-alpine3.16
* API: Added valuation value as valid sort field
* Bot: Refactored action handlers to prevent race conditions
* Client/Report: Sorting by valuation value now possible
* Client/Report: Added X-Frame-Options Header to nginx configuration
* Client/Report: Added server_tokens off in in nginx configuration
* Client/Report: Disabled js source map files
* Report: Refactored nginx-alpine image 1.23 including modsecurity

### Bugfixes
* API: Fixed validation logic for status sort field in data table controller methods

## 1.1.5
### Changes
* API: Validation added for data table controller methods
* API: Existential deposit transactions are only triggered once per user per substrate chain
### Bugfixes
* Bot: messageReaction count from MessageReaction object sometimes is too high, fetching it on our own now
## 1.1.4
### Changes
* API: Deleting valuation added
* Client: Added a bot section for logging setting
* Bot: Logging into a channel for normal elevations, director elevations and adding/removing message valuations

### Bugfixes
* API: Transaction status "retracted" in the TransactionHandler was treated as an error, but is a warning
* Bot: Valuating an elevated message did message the bot and not the actual author of the message

## 1.1.3
### Changes
* API: Bumped @polkadot/api to 8.11.3
* API: Added RPC Timeouts and extended error logging to TransactionHandler

## 1.1.2
### Changes
* API: Added secure comparison for API key
* API: TransactionHandler now skips only known issues
* API: Added session cookie settings
* API: Use session middleware only for requests without Bearer token
* API: Removed X-Powered-By Header
* Client/Report: API Requests sending credentials to accomodate cookie settings
* DB: Bumped version to 10.5.16

### Bugfixes
* API: Fixed TransactionHandler exception when sending payout DMs

## 1.1.1
### Changes
* Report: Default sort by timestamp in descending order
### Bugfixes
* Report: Graphs not rendering
* Bot: Dockerfile fix for dockerize

## 1.1.0
### Changes
* All: Bumped image versions
* API: TransactionHandler now will send only one message per user with aggregated payout data
* API: If a transaction fails it will skip the next ones for that specific treasury (likely caused by insufficient balances)
* Report: Report page refactored

## 1.0.8
### Bugfixes
* API: Successful transactions throwing an exception because of logging the transactionHash out of scope
* Bot: Missed async declaration for reaction handling method

## Changes
* API/Client: Added a treasury selection for processing only one treasury at a time
* API: Removed valuation details from notification message sent to a member when a valuation has been submitted and the user did not submit the specific address yet
* Bot: Stripping characters from Discord categories

## 1.0.7
### Changes
* API/Bot: Valuation message has been changed to be more clear how to verify your address if it is missing
* Bot: Load data of partial messages for role elevation (Verification)

## 1.0.6
### Changes
* API: Added further validation for encryption key and RPC url inputs
* API/Bot/Client: Added a verification DM success text field
* Client: mnemonics, private key and encryption key are now password fields with visibility toggle

## 1.0.5
### Bugfixes
* API: Fixed sending result of an inserted valuation

### Changes
* Global: Added ENVIRONMENT variable to .env (production|development) for logging purposes
* API/Bot: Log functionality added
* API/Bot: dotenv package removed since the enviroment variables get injected by docker-compose
* API/Bot: Started adding simple documentation to API/Bot
* API: Removed unused controller and model implementations
* API: TransactionHandler now waits for a status for each substrate transaction
* Bot: Refactored code and abstracting separate features into "actions" loaded by the bot
* Client/Report: Relabeled "Paid" status for transactions to "Transaction submitted"

### Breaking Changes
* API: Typo fix royalities/royality -> royalties/royalty in database schemas and application logic
* API: Renamed chainTypes to chainOptions and modified functionality to implement transaction options. Now represents an optional JSON object like this:
```
{
    types: {}, # Defined API types for the chain
    options: {} # Optional transaction options (ex. tip)
}
```

## 1.0.4
### Breaking Changes
* Splitted public reportings page from admin dashboard, now living in a seperate container

## 1.0.3
### Breaking Changes
* Refactored environment variables for easier configuration and deployment

## 1.0.2
### Bugfixes
* API: Validation fixed
* Client: Fixed missing input fields for processing transaction modal
* API/Bot: Prevent EVM null addresses to be submitted

### Changes
* Client: NGINX logs are now mounted to client/logs

## 1.0.1
### Bugfixes
* API: Fixed Discord Emoji Endpoint

### Changes
* API: ENCRYPTION_KEY removed. Encryption Key needs to be provided when adding/updating treasuries
* API/Client: 2FA added for processing transactions
* API/Client: Validation added
* Client: Valuation Settings removed, TransactionHandler pulls existential deposit constants from the chain instead 
* API: TransactionHandler refactored