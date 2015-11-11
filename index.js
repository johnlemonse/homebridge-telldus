var TellduAPI = require("telldus-live");

var Service,
    Characteristic,
    TelldusLive;

function TelldusPlatform(log, config) {

    this.log = log;
    this.isLoggedIn = false;

    // The config
    this.publicKey = config["public_key"];
    this.privateKey = config["private_key"];
    this.token = config["token"];
    this.tokenSecret = config["token_secret"];

    TelldusLive = new TellduAPI.TelldusAPI({publicKey: this.publicKey, privateKey: this.privateKey});
}

function TelldusAccessory(log, device) {

    this.log = log;
    this.device = device;
    this.name = device.name;
    this.id = device.id;

    // Split manufacturer and model
    var m = device.model ? device.model.split(':') : ['unknown', 'unknown'];
    this.device.model = m[0];
    this.device.manufacturer = m[1];
}

TelldusPlatform.prototype = {

    accessories: function(callback) {
        var that = this;

        that.log("Loading devices...");

        if (!that.isLoggedIn) {
            TelldusLive.login(that.token, that.tokenSecret, function(err, user) {

                if (!!err)
                    throw "Error while trying to login, " + err.message;

                that.log("Logged in with user: " + user.email);

                getDevices();
            })
        } else {
            getDevices();
        }

        function getDevices() {

            var foundAccessories = [];

            TelldusLive.getDevices(function(err, devices) {

                if (!!err)
                    throw "Error while fetching devices, " + err.message;

                that.log("Found " + devices.length + " devices. (will only load supported once)");

                // Only supporting type 'device'
                // Removing others
                for (var i = 0; i < devices.length; i++) {
                    if (devices[i].type != 'device') {
                        devices.splice(i, i);
                    }
                }

                for (var i = 0; i < devices.length; i++) {

                    TelldusLive.getDeviceInfo(devices[i], function (err, device) {

                        if (!!err)
                            throw "Error while fetching device info, " + err.message;

                        var accessory = new TelldusAccessory(that.log, device);
                        foundAccessories.push(accessory);

                        // Callback
                        if (foundAccessories.length >= devices.length) {
                            that.log("Loaded " + foundAccessories.length + " devices.");
                            callback(foundAccessories);
                        }

                    });
                }
            });
        }
    }
};

TelldusAccessory.prototype = {

    getServices: function() {
        var that = this;

        // Basic stuff
        var accessoryInformation = new Service.AccessoryInformation();

        accessoryInformation
            .setCharacteristic(Characteristic.Manufacturer, "Not Implemented - Manufacturer")
            .setCharacteristic(Characteristic.Model, "Not Implemented - Model")
            .setCharacteristic(Characteristic.SerialNumber, "Not Implemented - SerialNumber");

        // Accessory specific
        var service = new Service.Lightbulb();

        service.getCharacteristic(Characteristic.On)
            .on('get', function() { that.log("Light, On, get"); })
            .on('set', function() { that.log("Light, On, set"); });

        return [accessoryInformation, service];
    }
};

module.exports = function (homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-telldus", "Telldus", TelldusPlatform);
};




/*

function TelldusAccessory(device, log) {

    this.log = log;
    this.device = device;

    var m = device.model ? device.model.split(':') : ['unknown', 'unknown'];

    device.model = m[0];
    device.manufacturer = m[1];

    //
    this.name = "Name - Not implemented";

    var id = uuid.generate('telldus.' + device.id);
    Accessory.call(this, "Unknown - Not implemented", id);
    this.uuid_base = id;

    this.getService(Service.AccessoryInformation)
        .setCharacteristic(Characteristic.Manufacturer, "Manufacturer - Not implemented")
        .setCharacteristic(Characteristic.Model, "Model - Not implemented")
        .setCharacteristic(Characteristic.SerialNumber, "Serial number - Not implemented");

    // Device specific
    this.addService(Service.Lightbulb, "Unknown 2 - Not Implemented");
}

TelldusAccessory.prototype.getServices = function() {
    return this.services;
}

 */