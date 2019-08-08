require('dotenv').config();
const Swagger = require('swagger-client');
const Discord = require('discord.js');
const DiscordClient = new Discord.Client();
const fs = require('fs');
const OAuth = require('oauth');


// discord API not configured
if(typeof(process.env.DISCORD_BOT_TOKEN) == 'undefined'
|| typeof(process.env.DISCORD_BOT_CHANNEL) == 'undefined'){
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

var config = {};

// character configuration check
// could probably just do a require() here but this makes me feel fancy and saves me from checking all the variables
try{
    let characterFile = fs.readFileSync('./character.json');
    config = JSON.parse(characterFile);
    console.log("Configuration loaded");
} catch(error) {
    if(error.code != 'ENOENT'){
        console.log("Unknown error while trying to read configuration.");
        console.log(error);
        process.exit();
    }
    console.log('No character configuration found. Have you run the setup.js script?');
    process.exit();
}

DiscordClient.on('ready', () => {
    console.log(`Logged in as ${DiscordClient.user.tag}`);

    let channelId;
    DiscordClient.channels.forEach(channel => {
        if(channel.type == 'text' && channel.name == process.env.DISCORD_BOT_CHANNEL){
            channelId = channel.id;
        }
    });
    
    let discordChannel = DiscordClient.channels.get(channelId);

    // main loop
    setInterval(function(){
        getNotificationsFromEsi(config.access_token, config.refresh_token, config.character_id)
            .then(notifications => {
                console.log(notifications);
        
                let testMessage = new Discord.RichEmbed()
                .setTitle("Hello World!")
                .setTimestamp();

                discordChannel.send(testMessage)
                    .then(message => {
                        console.log(`Sent Message: ${message.content}`);
                        process.exit();
                    });
            })
            .catch(err => {
                console.log(err);
            });
    }, 20000);
});

DiscordClient.login(process.env.DISCORD_BOT_TOKEN);


function refreshAuthToken(refreshToken)
{
    return new Promise((resolve, reject) => {
        // refresh our token
        let OAuth2 = OAuth.OAuth2;
        let esi = new OAuth2(
            process.env.ESI_CLIENT_ID,
            process.env.ESI_SECRET_KEY,
            'https://login.eveonline.com/v2/',
            null,
            'oauth/token',
            null
        );

        esi.getOAuthAccessToken(
            refreshToken,
            {'grant_type': 'refresh_token'},
            (e, access_token, refresh_token, results) => {
                console.log("Refreshing Token...");
                if(e === null){
                    resolve(access_token);
                } else {
                    reject(e);
                }
            }
        );
    });

}

function getNotificationsFromEsi(accessToken, refreshToken, characterId)
{
    return new Promise((resolve, reject) => {
        console.log('Getting notifications from ESI...');
        const esi = Swagger(process.env.ESI_SWAGGER_URL, {
            authorizations: {
                evesso: {token: { access_token: accessToken }}
            }
        });
    
        let notifications = [];
        
        esi.then( client => {
            client.apis.Character.get_characters_character_id_notifications({character_id: characterId})
                .then(response => {
                    console.log('Compiling notifications...');
                    response.obj.forEach(element => {
                        if(element.type == 'InsurancePayoutMsg')
                            notifications.push(element);
                    });
                    resolve(notifications);
                })
                .catch(error => {
                    // automagically refresh access tokens when they expire
                    if(error.response.status == 403 && error.response.body.error == 'token is expired'){
                        refreshAuthToken(refreshToken)
                            .then(newAccessToken => {
                                console.log("Token refreshed!");
                                config.accessToken = newAccessToken;
                                // we need to go deeper!
                                getNotificationsFromEsi(newAccessToken, refreshToken, characterId)
                                    .then(notifications => {
                                        resolve(notifications);
                                    })
                                    .catch(err => {
                                        reject(err);
                                    });
                            })
                            .catch(error => {
                                console.log("Error refreshing access token: " + error);
                            });
                    } else {
                        console.log("Unhandled ESI Error: " + error);
                    }
                });
        });
    });
}