require('dotenv').config();
const OAuth = require('oauth');
const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const discord = require('discord.js');

// bit of code reuse here but meh

// discord API not configured
if(typeof(process.env.DISCORD_BOT_TOKEN) == 'undefined'){
    console.log("Discord API Access has not been configured properly. Visit https://discordapp.com/developers/, create an application, and add your Bot Token to the .env file.");
    process.exit();
}

// ESI not configured
if(typeof(process.env.ESI_CLIENT_ID) == 'undefined'
|| typeof(process.env.ESI_SECRET_KEY) == 'undefined'
|| typeof(process.env.ESI_CALLBACK_URL) == 'undefined'){
    console.log("ESI Access has not been configured properly. Visit https://developers.eveonline.com/ to create an application, and add the proper settings in the .env file.");
    process.exit();
}

// configure character to pull notifications from
console.log('Performing first time setup...');
let timestamp = Date.now();

console.log('Please visit https://login.eveonline.com/v2/oauth/authorize/?response_type=code' +
'&redirect_uri=' + process.env.ESI_CALLBACK_URL +
'&client_id=' + process.env.ESI_CLIENT_ID + 
'&scope=esi-characters.read_notifications.v1' +
'&state=' + timestamp + ' and log in with the character which will get structure notifications for your alliance.');

// listen for the authorization request coming back from ESI
const server = http.createServer((req, res) => {
    res.writeHead(200, {'Content-Type': 'text/html'});
    let q = url.parse(req.url, true).query;

    let OAuth2 = OAuth.OAuth2;
    let esi = new OAuth2(
        process.env.ESI_CLIENT_ID,
        process.env.ESI_SECRET_KEY,
        'https://login.eveonline.com/v2/',
        null,
        'oauth/token',
        null);
    // use the authorization code we got from ESI to get an access token
    esi.getOAuthAccessToken(
        q.code,
        {'grant_type': 'authorization_code'},
        (e, access_token, refresh_token, results) => {
            let config = {
                'User-Agent': 'Discord Notification Bot (github.com/nearlyepic)',
                'Authorization': 'Bearer ' + access_token,
            };
            // verify the access token we got is working, and grab the character ID while we're at it
            let req = https.get('https://esi.evetech.net/verify', {
                'headers': config
            }, (res) => {
                let data = '';

                res.on('data', (chunk) => {
                    data += (chunk);
                });

                res.on('end', () => {
                    let verifyResponse = JSON.parse(data);
                    let characterConf = {
                        'character_id': verifyResponse.CharacterID,
                        'access_token': access_token,
                        'refresh_token': refresh_token
                    };
                    // write character configuration to file
                    try{
                        fs.writeFileSync('./character.json', JSON.stringify(characterConf));
                        console.log("First time setup complete!");
                        process.exit();
                    } catch(error) {
                        console.log('Error writing character configuration to disk: ' + error);
                    }
                });

                res.on('error', (e) => {
                    console.log('Error in verifying token: ' + e);
                });

            }).end();
        }
    );
    res.end("Authorization code accepted. You are safe to close this browser tab.");
}).listen(8080);