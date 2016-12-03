# homebridge-telldus 💡
Homebridge plugin for Telldus Live!

Works as a bridge between Apple's HomeKit and the telldus live platform.

Supports various devices that Telldus support, like wireless switches, dimmers, temperature sensors, so you can control them from your iPhone, iPad & Apple TV.

# Installation
Follow the instruction in [homebridge](https://www.npmjs.com/package/homebridge) for the homebridge server installation and how to run.

This plugin is published through [NPM](https://www.npmjs.com/package/homebridge-telldus) and should be installed "globally" by typing:

`npm install -g homebridge-telldus`

Requires node v>=4

## Configuration
See homebridge for where `config.json` is stored.

You need to configure your telldus live integration by creating API secrets/tokens in the telldus live web admin.
```
"public_key" : "telldus public key",
"private_key" : "telldus private key",
"token" : "telldus token",
"token_secret" : "telldus token secret",
```

For a sample homebridge config file, see [config.json](https://github.com/jchnlemon/homebridge-telldus/blob/master/config.json).

`homebridge-telldus` tries to auto-detect devices from telldus. However some devices do not have the correct type or other parameters set. You can override/set these parameters from the homebridge config file. This is what the `unknown_accessories` property in `config.json` is for.

### unknown_accessories parameters
All these are optional, except for `id`, which is required.

```
"id": 123,
"model": "temperaturehumidity",
"manufacturer": "Oregon",
"name": "My Custom Name",
"disabled": true,
```

## Device types
model (unknown_accessories) | Info
--- | ---
`selflearning-switch` | ◻️ Self learning (pairing) switch
`selflearning-dimmer` | 🎛 Self learning (pairing) dimmers
`codeswitch` | ◻️ Old type fixed code switch
`temperature`, `EA4C` | 🌡 Temperature sensor
`temperaturehumidity`, `1A2D` | 🌡💦 Combined temperature and humidity sensor

See also:
[Telldus Compatibility](http://old.telldus.com/products/compability) (note: not all of these are yet supported.)
