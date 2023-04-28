# ONLY USE THIS SCRIPT IF THERE IS NO DATA IN THE DATABASE AS THIS SCRIPT WILL REMOVE THE VOLUME FOLDER WHICH CONTAINS THE DATABASE
# COMMENT OUT THE FOLLOWING LINE ON 160 IF YOU WANT TO KEEP THE DATABASE
# rm -rf $__START_DIR__/{api,client}/cache $__START_DIR__/volumes

FIRST_RUN=0

# YOU WILL NEED TO POPULATE ${__START_DIR__}/.cloudflare.ini

## Need to fill this out
__2FANAME__=""
__FQDN__="example.com" # The full-qualified domain name.
__BOTPREFIX__='toolme' # Don't include bang (!) in prefix
__CLOUDFLARE_EMAIL__=""
__ADMINPORT__=""
__REPORTPORT__=""
__GUILDID__="" # Guild ID
__BOTTOKEN__="" # Discord Bot Token
__DISCORDCLIENTID__="" # Discord Application Client ID
__DISCORDCLIENTSECRET__="" # Discord Application Client Secret
__AUTHORIZEDDISCORDIDS__="" # Comma separated list of Discord IDs

# Leave these alone
__SHORTNAME__="${__FQDN__%%.*}" # This isolates the first part of the FQDN (everything to the right of the first dot is dropped)
__START_DIR__="${PWD}"

# Copy .env.TEMPLATE to .env
cp ${__START_DIR__}/.env.TEMPLATE ${__START_DIR__}/.env
cp ${__START_DIR__}/docker-compose.yaml.TEMPLATE ${__START_DIR__}/docker-compose.yaml

# Fixes bot prefix (!wagmi) in valuation.js messages
sed -i "s/__BOTPREFIX__/${__BOTPREFIX__}/g" ${__START_DIR__}/api/controller/valuation.js

# Fixes FQDN in .env and docker-compose.yaml
sed -i "s/__FQDN__/${__FQDN__}/g" ${__START_DIR__}/.env ${__START_DIR__}/docker-compose.yaml ${__START_DIR__}/client/nginx/default.conf ${__START_DIR__}/report/conf/nginx/conf.d/default.conf

# Replace TEMPLATE with __SHORTNAME__ in docker-compose.yaml
sed -iE "s/TEMPLATE/${__SHORTNAME__}/g;" $__START_DIR__/docker-compose.yaml

# Script that only runs on first execution
if [ $FIRST_RUN -eq "0" ]; then

    export NVM_DIR=$HOME/.nvm;
    source $NVM_DIR/nvm.sh;

    nvm install 16.15.1
    nvm use 16.15.1

    # Delete any residual cache data on first run
    find * -name 'package-lock.json' -o -name node_modules|xargs rm -rf

    if [ ! -f ${__START_DIR__}/certbot_etc/dhparam.pem ]; then
        if [ ! -d ${__START_DIR__}/certbot_etc ]; then 
            mkdir ${__START_DIR__}/certbot_etc
        fi
        openssl dhparam -out ${__START_DIR__}/certbot_etc/dhparam.pem 2048
    fi


    # Replace these with your own values
    api_token="$(cat .cloudflare.ini |cut -d ' ' -f3)"
    ip_address="$(curl -s https://api.ipify.org)"

    # List of domain names
    domain_names=("${__FQDN__}" "admin.${__FQDN__}")
    root_domain_name=$(echo $__FQDN__|sed -E 's/\w+\.//')
    # Function to get zone_id for a domain
    get_zone_id() {
        local domain="$1"
        local zones_url="https://api.cloudflare.com/client/v4/zones?name=${domain}"
        local response=$(curl -s -X GET "$zones_url" \
            -H "Authorization: Bearer $api_token" \
            -H "Content-Type: application/json")
        echo "$response" | grep -Eo '"id":"[a-z0-9]{32}'|sed 's/"id":"//'|head -n 1
    }
    # Get zone_id for the domain
    zone_id=$(get_zone_id "$root_domain_name")
    
    for domain_name in "${domain_names[@]}"; do
    # Set API URL
    api_url="https://api.cloudflare.com/client/v4/zones/${zone_id}/dns_records"

    # Set DNS record data
    data=$(printf '{"type":"A","name":"%s","content":"%s","ttl":120,"proxied":false}' "$domain_name" "$ip_address")
    
    # Send POST request to create the A record
    response=$(curl -s -X POST "$api_url" \
        -H "Authorization: Bearer $api_token" \
        -H "Content-Type: application/json" \
        --data "$data")

    success=$(echo "$response" | grep -Eo '"success":(true|false)' | cut -d: -f2)

    if [ "$success" == "true" ]; then
        echo "DNS A record created successfully for $domain_name"
    else
        echo "Error creating DNS A record for $domain_name"
        echo "Response: $response"
    fi
    done

    sed -i 's/FIRST_RUN=0/FIRST_RUN=1/' ${__START_DIR__}/deploy.sh
fi

# Renames 2FA token
sed -i "s/WAG Media Bot/${__2FANAME__}/" ${__START_DIR__}/api/2fa.js

# Recursive grep research for the keyword TEMPLATE in all directories excluding this file and node_modules and only print the filename
if [ "$(grep -r TEMPLATE * --exclude-dir=node_modules --exclude=deploy.sh -l)" ]; then

    # Find all affected file names and replace all instances of TEMPLATE with the shortname for each file
    grep -r TEMPLATE * --exclude-dir=node_modules --exclude=deploy.sh -l | sort -u | xargs sed -i "s/TEMPLATE/${__SHORTNAME__}/g"
    # api/server.js:require("./lib/io")("ws://bot-TEMPLATE:8085/")
    # api/lib/sql.js: host: 'db-TEMPLATE',
    # bot/Dockerfile:CMD dockerize -wait tcp://api-TEMPLATE:8081 -timeout 60m npm start
    # bot/actions/normal_elevation.js:            API.request("http://api-TEMPLATE:8081/api/elevation/find", [
    # bot/actions/normal_elevation.js:                    await API.request("http://api-TEMPLATE:8081/api/elevation/insert", {
    # bot/actions/verification.js:            API.request(`http://api-TEMPLATE:8081/api/user/${button.user.id}`).then(async apiUser => {
    # bot/actions/verification.js:                                            API.request('http://api-TEMPLATE:8081/api/user/insertOrUpdate', data, 'POST').then(response => {
    # bot/actions/valuation.js:                            API.request("http://api-TEMPLATE:8081/api/elevation/findOne", {
    # bot/actions/valuation.js:                                API.request("http://api-TEMPLATE:8081/api/valuation/findOne", {
    # bot/actions/valuation.js:                                        API.request("http://api-TEMPLATE:8081/api/valuation/insert", insertValuationData, "POST").then(async response => {
    # bot/actions/valuation.js:                            API.request("http://api-TEMPLATE:8081/api/elevation/findOne", {
    # bot/actions/valuation.js:                                API.request("http://api-TEMPLATE:8081/api/valuation/findOne", {
    # bot/actions/valuation.js:                                        API.request(`http://api-TEMPLATE:8081/api/valuation/delete/${valuatedMessage.id}`, null, 'DELETE').then(async response => {
    # bot/actions/director_elevation.js:                              API.request("http://api-TEMPLATE:8081/api/elevation/findOne", {
    # bot/actions/director_elevation.js:                                              await API.request("http://api-TEMPLATE:8081/api/elevation/insert", {
    # bot/lib/api.js:         baseURL: 'http://api-TEMPLATE:8081/api/',
    # client/nginx/default.conf:    server api-TEMPLATE:8081;
    # client/nginx/default.conf:    server api-TEMPLATE:8086;
    # client/nginx/default.conf:#    server_name TEMPLATE.wagmedia.xyz admin.TEMPLATE.wagmedia.xyz;
    # client/nginx/default.conf:    server_name admin.TEMPLATE.wagmedia.xyz;
    # client/nginx/default.conf:    ssl_certificate   /etc/letsencrypt/live/TEMPLATE.wagmedia.xyz/fullchain.pem;
    # client/nginx/default.conf:    ssl_certificate_key       /etc/letsencrypt/live/TEMPLATE.wagmedia.xyz/privkey.pem;
    # client/.env:VUE_APP_API_URL=https://admin.TEMPLATE.wagmedia.xyz:6083/api/
    # client/.env:VUE_APP_API_REPORT_URL=https://TEMPLATE.wagmedia.xyz:8443/api/
    # client/.env:VUE_APP_WEBSOCKET_URL=https://admin.TEMPLATE.wagmedia.xyz:6083/
    # client/.env:VUE_APP_DISCORD_OAUTH_URL=https://discord.com/api/oauth2/authorize?client_id=1092261079998009354&redirect_uri=https%3A%2F%2Fadmin.TEMPLATE.wagmedia.xyz%3A6083%2Fapi%2Fdiscord%2Flogin&response_type=code&scope=identify
    # report/.env:VUE_APP_API_REPORT_URL=https://TEMPLATE.wagmedia.xyz:8443/api/
    # report/conf/nginx/conf.d/default.conf:    server api-TEMPLATE:8081;
    # report/conf/nginx/conf.d/default.conf:    server_name TEMPLATE.wagmedia.xyz;
    # report/conf/nginx/conf.d/default.conf:    ssl_certificate     /etc/letsencrypt/live/TEMPLATE.wagmedia.xyz/fullchain.pem;
    # report/conf/nginx/conf.d/default.conf:    ssl_certificate_key /etc/letsencrypt/live/TEMPLATE.wagmedia.xyz/privkey.pem;
fi

# Replace all environment variables in .env file
sed -i -E "
s/__2FA_KEY__/${__2FA_KEY__}/;
s/__ADMINPORT__/${__ADMINPORT__}/;
s/__APIKEY__/$(openssl rand -hex 14)/;
s/__APISESSION__/$(openssl rand -hex 14)/;
s/__AUTHORIZEDDISCORDIDS__/${__AUTHORIZEDDISCORDIDS__}/;
s/__BOTPREFIX__/${__BOTPREFIX__}/
s/__BOTTOKEN__/${__BOTTOKEN__}/;
s/__CLOUDFLARE_EMAIL__/${__CLOUDFLARE_EMAIL__}/;
s/__DBROOTPASSWD__/$(openssl rand -hex 16)/;
s/__DBUSERPASSWD__/$(openssl rand -hex 16)/;
s/__DISCORDCLIENTID__/${__DISCORDCLIENTID__}/;
s/__DISCORDCLIENTSECRET__/${__DISCORDCLIENTSECRET__}/;
s/__GUILDID__/${__GUILDID__}/;
s/__REPORTPORT__/${__REPORTPORT__}/;
s/TEMPLATE/${__SHORTNAME__}/g;
" $__START_DIR__/.env


cd $__START_DIR__/api;
if [ ! -d "node_modules" ]; then
    npm i
fi
# Generate 2FA key and write to 2fa.tmp in the root directory of the stack
node ./2fa.js| grep -E '(qr|secret):'|sed -E "s/\s+(qr|secret): '//; s/',?//" > $__START_DIR__/2fa.tmp

__2FA_KEY__="$(grep -v 'https' $__START_DIR__/2fa.tmp)" # Launch ./api/2fa.js first

if [ -n "$__2FA_KEY__" ]; then
    sed -iE "s/__2FA_KEY__/${__2FA_KEY__}/;" $__START_DIR__/.env
    echo "The qr code is:" $(grep 'https' $__START_DIR__/2fa.tmp)
else
    echo "2FA Key not found."
fi


# cd to the bot directory and check if node_modules exists, if not install the modules
cd $__START_DIR__/bot;

if [ ! -d "node_modules" ]; then
    npm i
fi

# cd to the client directory and check if node_modules exists, if not install the modules
cd $__START_DIR__/client

if [ ! -d "node_modules" ]; then
    npm i
fi
# build the client
npm run build --omit=dev

# cd to the report directory and check if node_modules exists, if not install the modules
cd $__START_DIR__/report

if [ ! -d "node_modules" ]; then
    npm i
fi
# build the report
npm run build --omit=dev

# Remove any residual cache files or Volumes
rm -rf $__START_DIR__/{api,client}/cache $__START_DIR__/volumes
mkdir $__START_DIR__/{api,client}/cache

# Build all docker-compose images
cd $__START_DIR__;
docker-compose build 

## You may need to delete ./volumes if the maria-db doesn't initially start. Use: `docker-compose logs` to investigate
## You may also need to reload the stack once after the certificates are generated. This is achieved with `docker-compose down && docker-compose up -d``