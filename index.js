var TellduAPI = require("telldus-live");

var Service,
    Characteristic,
    TelldusLive,
    UnknowAccessories,
    TelldusDeviceToHomeKitDeviceMap =  function(model) {
        var map = {
            "unknown-switch": {
                controllerService: new Service.Lightbulb(),
                characteristics: [Characteristic.On]
            },
            "unknown-dimmer": {
                controllerService: new Service.Lightbulb(),
                characteristics: [Characteristic.On, Characteristic.Brightness]
            },
            "selflearning-switch": {
                controllerService: new Service.Lightbulb(),
                characteristics: [Characteristic.On]
            },
            "codeswitch": {
                controllerService: new Service.Lightbulb(),
                characteristics: [Characteristic.On]
            },
            "selflearning-dimmer": {
                controllerService: new Service.Lightbulb(),
                characteristics: [Characteristic.On, Characteristic.Brightness]
            }
        };

        return map[model];
    };


module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-telldus", "Telldus", TelldusPlatform);
};

function TelldusPlatform(log, config) {
    this.log = log;

    // The config
    this.publicKey = config["public_key"];
    this.privateKey = config["private_key"];
    this.token = config["token"];
    this.tokenSecret = config["token_secret"];

    UnknowAccessories = config["unknown_accessories"];
    TelldusLive = new TellduAPI.TelldusAPI({publicKey: this.publicKey, privateKey: this.privateKey});
}

function TelldusAccessory(log, device) {

    this.device = device;
    this.name = device.name;
    this.id = device.id;

    // Split manufacturer and model
    var m = device.model ? device.model.split(':') : ["unknown", "unknown"];
    this.model = m[0];
    this.manufacturer = m[1];

    // Check if device is defined as unknown accessory
    if (UnknowAccessories != null && isDefinedAsUnknownAccessory(this.id)) {
        this.model = getDefinedUnknownAccessory(this.id)["model"];
    }

    // Device log
    this.log = function(string) {
        log("[" + this.name + "] " + string);
    };
}

TelldusPlatform.prototype = {

    accessories: function(callback) {
        var that = this;

        that.log("Loading devices...");

        TelldusLive.login(that.token, that.tokenSecret, function(err, user) {

            if (!!err) throw "Error while trying to login, " + err.data;

            that.log("Logged in with user: " + user.email);

            that.getDevices(callback);
        })
    },

    getDevices: function(callback) {
        var that = this;

        var foundAccessories = [];

        TelldusLive.getDevices(function(err, devices) {

            if (!!err) throw "Error while fetching devices, " + err.data;

            that.log("Found " + devices.length + " devices.");

            // Only supporting type 'device'
            for (var a = 0; a < devices.length; a++) {
                if (devices[a].type != 'device') {
                    devices.splice(a, 1);
                }
            }

            var foundDevicesLength = devices.length;

            for (var i = 0; i < devices.length; i++) {

                TelldusLive.getDeviceInfo(devices[i], function (err, device) {

                    if (!!err) throw "Error while fetching device info, " + err.data;

                    var accessory = new TelldusAccessory(that.log, device);

                    if (TelldusDeviceToHomeKitDeviceMap(accessory.model)) {
                        foundAccessories.push(accessory);
                    } else {
                        that.log("Device \"" + accessory.name + "\" could not be mapped to homebridge-telldus. Device information:\n" + JSON.stringify(accessory));
                        --foundDevicesLength;
                    }

                    // Callback
                    if (foundAccessories.length >= foundDevicesLength) {
                        that.log("Loaded " + foundAccessories.length + " devices.");
                        callback(foundAccessories);
                    }

                });
            }
        });
    }
};

TelldusAccessory.prototype = {

    // Convert 0-255 to 0-100
    bitsToPercentage: function(value) {
        value = value/255;
        value = value*100;
        value = Math.round(value);
        return value;
    },

    // Convert 0-100 to 0-255
    percentageToBits: function(value) {
        value = value*255;
        value = value/100;
        value = Math.round(value);
        return value;
    },

    getState: function(characteristic, callback) {
        var that = this;

        TelldusLive.getDeviceInfo(that.device, function(err, device) {

            if (!!err) throw "Error while getting " + characteristic + " state;" + err.message;

            that.device = device;
            var newState;

            switch (characteristic) {
                case Characteristic.Formats.BOOL:
                    newState = that.device.state;
                    break;

                case Characteristic.Formats.INT:
                    newState = that.bitsToPercentage(that.device.state);
                    break;

            }

            that.log("Updated state " + characteristic + " : " + newState);
            callback(newState);
        })
    },

    executeCommand: function(characteristic, newValue, callback) {
        var that = this;

        that.log("Executing command " + characteristic + " : " + newValue);


        switch (characteristic) {
            case Characteristic.Formats.BOOL:
                TelldusLive.onOffDevice(that.device, newValue, function (err, result) {
                    if (!!err) callback(err, null);
                    callback(null, newValue);
                });
                break;

            case Characteristic.Formats.INT:
                TelldusLive.dimDevice(that.device, that.percentageToBits(newValue), function (err, result) {
                    if (!!err) callback(err, null);
                    callback(null, that.bitsToPercentage(newValue));
                });
                break;
        }
    },

    // Respond to identify request
    identify: function(callback) {
        var that = this;
        that.log("Hi!");
        callback();
    },

    getServices: function() {
        var that = this;

        var services = [];

        // Accessory information
        var accessoryInformation = that.getAccessoryInformationService();
        services.push(accessoryInformation);

        // Service and characteristics
        var controllerService = that.getControllerService();
        services.push(controllerService);

        return services;
    },

    getAccessoryInformationService: function() {
        var accessoryInformation = new Service.AccessoryInformation();

        accessoryInformation
            .setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
            .setCharacteristic(Characteristic.Model, this.model)
            .setCharacteristic(Characteristic.SerialNumber, this.id);

        return accessoryInformation;
    },

    getControllerService: function() {
        var that = this;

        // TODO: Read only - read from device

        var controllerService = TelldusDeviceToHomeKitDeviceMap(this.model).controllerService;
        var characteristics = TelldusDeviceToHomeKitDeviceMap(this.model).characteristics;

        for (var i = 0; i < characteristics.length; i++) {
            var characteristic = controllerService.getCharacteristic(characteristics[i]);

            that.getState(characteristic.props.format, function() {});

            characteristic
                .on('get', function (callback, context) {
                    that.getState(characteristic.props.format, callback);
                });

            characteristic
                .on('set', function (newValue, callback, context) {
                    that.executeCommand(characteristic.props.format, newValue, callback);
                });

        }

        return controllerService;
    }
};

function isDefinedAsUnknownAccessory(deviceId) {

    for (var i = 0; i < UnknowAccessories.length; i++) {
        if (UnknowAccessories[i]["id"] == deviceId) {
            return true;
        }
    }

    return false;
}

function getDefinedUnknownAccessory(deviceId) {
    for (var i = 0; i < UnknowAccessories.length; i++) {
        if (UnknowAccessories[i]["id"] == deviceId) {
            return UnknowAccessories[i];
        }
    }
    return null;
}