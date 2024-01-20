# homebridge-telldus 💡
Homebridge plugin for Telldus Live!

Works as a bridge between Apple's HomeKit and the Telldus live platform.

Supports various devices that Telldus support, like wireless switches, dimmers, temperature sensors, so you can control them from your iPhone, iPad & Apple TV.

![](https://mifi.no/uploads/IMG_2777-512.jpg)

# Installation
Follow the instruction in [homebridge](https://www.npmjs.com/package/homebridge) for the homebridge server installation and how to run.

This plugin is published through [npm](https://www.npmjs.com/package/homebridge-telldus-pn) and should be installed "globally" by typing:

`npm i -g homebridge-telldus-pn`

(And if you haven't already: `npm i -g homebridge`)

**⚠️ As of v1.0.0, homebridge-telldus-pn requires node 8.3 or greater**

For older versions of node, install an old version: `npm install -g homebridge-telldus-pn@0`

## Configuration

For a sample homebridge config file, see [config.json](https://github.com/senilpon/homebridge-telldus/blob/master/config.json).

See [homebridge](https://github.com/nfarina/homebridge) for where `config.json` is stored. Typically in `~/.homebridge/config.json`

### Live configuration

You need to configure your telldus live integration by creating API secrets/tokens in the telldus live web admin. Log in to your Live account, go to http://pa-api.telldus.com/ and `Generate a private token for my user only`.

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
- Run in a terminal `telldus-local-auth <IP OF YOUR DEVICE> homebridge-telldus-pn`. This will open a browser window. **See further instructions in the terminal.**
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

When running against local, your devices get new IDs. IDs will now start with 1 instead of a large number as in Live. Use "local_id" instead of "id" in `unknown_accessories` for local. You will see IDs printed when starting up homebridge the first time.

Also note that devices with a temp sensor attached will be split but they will both have the same ID! Which means that you need to differentiate these by setting `"type": "device"` for all devices, and put no `"type"` definition for the sensor, see examples below. See also [#56].

## Device configuration

`homebridge-telldus-pn` tries to auto-detect devices from telldus. However some devices do not have the correct type or other parameters set. You can override/set these parameters from the homebridge config file. This is what the `unknown_accessories` property in `config.json` is for.

### unknown_accessories parameters
All these are optional, except for `id`, which is required. (For local API configuration, use `local_id` instead.)

Example device configurations:

If Telldus cannot identify your device, override its model. You can also override the name from Telldus:
```
"id": 123,
"model": "temperaturehumidity",
"manufacturer": "Oregon",
"name": "My Custom Name",
```

If a device is causing a crash or is not working you can disable it:
```
"id": 124,
"disabled": true,
```

If you are using the local API, use `local_id` and `type` instead of `id`. For the device:
```
"local_id": 2,
"type": "device",
"model": "switch",
```

And for the attached sensor:
```
"local_id": 2,
"model": "temperaturehumidity",
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
`010f-0c02-1003` | 🌡 Temperature sensor
`0060-0015-0001` | 🌡 Temperature sensor
`019a-0003-000a` | 🌡💦 Combined temperature and humidity sensor
`0154-0003-000a` | ◻️ Self learning (pairing) switch
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

```$ DEBUG=homebridge-telldus-pn,telldus-api homebridge```

# Links
- https://github.com/nfarina/homebridge
- https://github.com/mifi/telldus-api
- https://github.com/mifi/telldus-local-auth
- https://blog.mifi.no/2017/10/22/Use-Apple-HomeKit-to-control-cheap-Telldus-devices/
- https://developer.telldus.com/blog/2016/05/24/local-api-for-tellstick-znet-lite-beta-now-in-public-beta
