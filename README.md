# homebridge-telldus 💡
Homebridge plugin for Telldus Live!

<a target='_blank' rel='nofollow' href='https://app.codesponsor.io/link/a3DabSrJLUgh3DWQzN9s8KRM/jchnlemon/homebridge-telldus'>
  <img alt='Sponsor' width='888' height='68' src='https://app.codesponsor.io/embed/a3DabSrJLUgh3DWQzN9s8KRM/jchnlemon/homebridge-telldus.svg' />
</a>

Works as a bridge between Apple's HomeKit and the Telldus live platform.

Supports various devices that Telldus support, like wireless switches, dimmers, temperature sensors, so you can control them from your iPhone, iPad & Apple TV.

![](https://mifi.no/uploads/IMG_2777-512.jpg)

# Installation
Follow the instruction in [homebridge](https://www.npmjs.com/package/homebridge) for the homebridge server installation and how to run.

This plugin is published through [npm](https://www.npmjs.com/package/homebridge-telldus) and should be installed "globally" by typing:

`npm i -g homebridge-telldus`

(And if you haven't already: `npm i -g homebridge`)

**⚠️ As of v1.0.0, homebridge-telldus requires node 8.3 or greater**

For older versions of node, install an old version: `npm install -g homebridge-telldus@0`

## Configuration

For a sample homebridge config file, see [config.json](https://github.com/jchnlemon/homebridge-telldus/blob/master/config.json).

See [homebridge](https://github.com/nfarina/homebridge) for where `config.json` is stored. Typically in `~/.homebridge/config.json`

### Live configuration

You need to configure your telldus live integration by creating API secrets/tokens in the telldus live web admin. Log in to your Live account, go to http://api.telldus.com/ and `Generate a private token for my user only`.

Put these generated values in homebridge `config.json`:

```
...
"platforms": [
    {
        "platform" : "Telldus",
        "name" : "Telldus Liv!e",

        "public_key" : "telldus public key",
        "private_key" : "telldus private key",
        "token" : "telldus token",
        "token_secret" : "telldus token secret",

        ...
    }
...
```

### Local configuration

As an alternative to Telldus Live, it is also possible to run towards your Telldus device directly via HTTP on your local network, if you have a TellStick ZNet Lite, without going through Telldus Live cloud. [For more info see this link](https://developer.telldus.com/blog/2016/05/24/local-api-for-tellstick-znet-lite-beta-now-in-public-beta).

#### Local setup instructions
1. Find the LAN IP address of your TellStick device
- Install [telldus-local-auth](https://github.com/mifi/telldus-local-auth): `npm i -g telldus-local-auth`
- Run in a terminal `telldus-local-auth <IP OF YOUR DEVICE> homebridge-telldus`. This will open a browser window. **See further instructions in the terminal.**
- Note the returned token.
- Instead of `public_key`, `private_key`, `token`, and `token_secret` in `config.json`, add a `local` section like this:

```
...
"platforms": [
    {
        "platform" : "Telldus",
        "name" : "Telldus Liv!e",

        "local": {
            "ip_address": "device ip address",
            "access_token": "Token returned from telldus-local-auth tool"
        },

        ...
    }
...
```

When running against local, your devices get new IDs. IDs will now start with 1 instead of a large number as in Live. Use "local_id" instead of "id" in `unknown_accessories` for local. You will see IDs printed when starting up homebridge the first time


## Device configuration

`homebridge-telldus` tries to auto-detect devices from telldus. However some devices do not have the correct type or other parameters set. You can override/set these parameters from the homebridge config file. This is what the `unknown_accessories` property in `config.json` is for.

### unknown_accessories parameters
All these are optional, except for `id`, which is required. (For local API configuration, use `local_id` instead.)

Example device configuration:
```
"id": 123,
"model": "temperaturehumidity",
"manufacturer": "Oregon",
"name": "My Custom Name",
"disabled": true,
```


## Device models
model (`unknown_accessories`) | Description
--- | ---
`selflearning-switch` | ◻️ Self learning (pairing) switch
`selflearning-dimmer` | 🎛 Self learning (pairing) dimmers
`codeswitch` | ◻️ Old type fixed code switch
`temperature`, `EA4C` | 🌡 Temperature sensor
`temperaturehumidity`, `1A2D` | 🌡💦 Combined temperature and humidity sensor
`window-covering` | 🚪↕️ Window covering
See also:
[Telldus Compatibility](http://old.telldus.com/products/compability) (note: not all of these are yet supported.)

# Auto startup
To auto startup `homebridge` on boot and auto-restart on crash, I recommend using [PM2](https://nodejs.org/dist/v8.7.0/node-v8.7.0-linux-x64.tar.xz). It allows auto setup of init scripts for popular operating systems.

```
npm i -g homebridge homebridge-telldus pm2
pm2 startup
# Follow instructions...
pm2 start homebridge
pm2 save
```
If all went good, homebridge will now run automatically on boot

# Common problems / FAQ
- `Cannot add a bridged Accessory with the same UUID as another bridged Accessory` - See [#41](https://github.com/jchnlemon/homebridge-telldus/issues/41)
- `Error: listen EADDRINUSE :::51826` - This means that homebridge is already running on the same address. See [#48](https://github.com/jchnlemon/homebridge-telldus/issues/48)

# Reprting issues
If you are having an issue or wondering about new features, please run homebridge in debug mode and share the log in the issue.
Run homebridge from the command line as follows:

```$ DEBUG=homebridge-telldus,telldus-api homebridge```

# Links
- https://github.com/nfarina/homebridge
- https://github.com/mifi/telldus-api
- https://github.com/mifi/telldus-local-auth
- https://blog.mifi.no/2017/10/22/Use-Apple-HomeKit-to-control-cheap-Telldus-devices/
- https://developer.telldus.com/blog/2016/05/24/local-api-for-tellstick-znet-lite-beta-now-in-public-beta
