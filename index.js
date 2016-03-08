var TellduAPI = require("telldus-live");

module.exports = function(homebridge) {
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

	TelldusLive = new TellduAPI.TelldusAPI({
		publicKey : this.publicKey,
		privateKey : this.privateKey
	});
}

function TelldusDevice(log, device) {

	this.device = device;
	this.name = device.name;
	this.id = device.id;

	// Split manufacturer and model
	var m = device.model ? device.model.split(':') : [ 'unknown', 'unknown' ];
	this.model = m[0];
	this.manufacturer = m[1];

	// Device log
	this.log = function(string) {
		log("[" + this.name + "] " + string);
	};
}

TelldusPlatform.prototype = {

	accessories : function(callback) {
		var that = this;

		that.log("Loading accessories...");

		TelldusLive.login(that.token, that.tokenSecret, function(err, user) {

			if (!!err)
				throw "Error while trying to login, " + err.message;

			that.log("Logged in with user: " + user.email);

			var foundAccessories = [];
			var noAccessoryTypes = 0;
			that.getAccessories(function(err, accessories, type) {
				that.log("Adding " + accessories.length + " " + type);
				foundAccessories = foundAccessories.concat(accessories);
				if (++noAccessoryTypes == 2) {
					that.log("Loading " + foundAccessories.length + " accessories");
					callback(foundAccessories);
				}
			});
		});
	},
	getAccessories : function(callback) {
		var that = this;

		TelldusLive.getSensors(function(err, sensors) {

			var foundAccessories = [];
			var foundSensorsLength = 0;

			if (!!err)
				throw "Error while fetching sensors, " + err.message;

			that.log("Found " + sensors.length + " sensors.");
			foundSensorsLength = sensors.length;

			for (var i = 0; i < sensors.length; i++) {
				var accessory = new TelldusDevice(that.log, sensors[i]);
				foundAccessories.push(accessory);
				if (foundAccessories.length >= foundSensorsLength) {
					// that.log("Loaded " + foundAccessories.length + "
					// sensors.");
					callback(err, foundAccessories, "sensors");
				}
			}
		});
		TelldusLive.getDevices(function(err, devices) {

			var foundAccessories = [];
			var foundDevicesLength = 0;

			if (!!err)
				throw "Error while fetching devices, " + err.message;

			that.log("Found " + devices.length + " devices.");

			// Only supporting type 'device'
			for(var i = devices.length - 1; i >= 0; i--) {
				if (devices[i].type != 'device') {
					devices.splice(i, 1);
				}
			}

			foundDevicesLength = devices.length;

			for (var i = 0; i < devices.length; i++) {
				TelldusLive.getDeviceInfo(devices[i], function(err, device) {
					if (!!err)
						throw "Error while fetching device info, " + err.message;

					var accessory = new TelldusDevice(that.log, device);
					foundAccessories.push(accessory);
					if (foundAccessories.length >= foundDevicesLength) {
						// that.log("Loaded " + foundAccessories.length + "
						// devices.");
						callback(err, foundAccessories, "devices");
					}
				});
			}
		});
	}
};

TelldusDevice.prototype = {

	// Convert 0-255 to 0-100
	bitsToPercentage : function(value) {
		value = value / 255;
		value = value * 100;
		value = Math.round(value);
		return value;
	},

	// Convert 0-100 to 0-255
	percentageToBits : function(value) {
		value = value * 255;
		value = value / 100;
		value = Math.round(value);
		return value;
	},

	// Respond to identify request
	identify : function(callback) {
		var that = this;
		that.log("Hi!");
		callback();
	},
	getServices : function() {
		var that = this;

		var services = [];

		// Accessory information
		var accessoryInformation = new Service.AccessoryInformation();

		accessoryInformation.setCharacteristic(Characteristic.Manufacturer, this.manufacturer).setCharacteristic(Characteristic.Model, this.model).setCharacteristic(Characteristic.SerialNumber,
				this.id);

		services.push(accessoryInformation);

		that.configureControllerServices(function(service) {
			if (service) {
				services.push(service);
			}
		});

		return services;
	},
	configureControllerServices : function(callback) {
		switch (this.model) {
		case "selflearning-switch":
			if (this.manufacturer.indexOf("magnet") > -1) {
				callback(this.configureServiceCharacteristics(new Service.ContactSensor(), [ Characteristic.ContactSensorState ]));
			} else if(this.name == "Skalskydd"){
				callback(this.configureServiceCharacteristics(new Service.SecuritySystem(), [ Characteristic.SecuritySystemCurrentState, Characteristic.SecuritySystemTargetState ]));
			} else {
				callback(this.configureServiceCharacteristics(new Service.Lightbulb(), [ Characteristic.On ]));
			}
			break;
		case "codeswitch":
			callback(this.configureServiceCharacteristics(new Service.Lightbulb(), [ Characteristic.On ]));
			break;
		case "selflearning-dimmer":
			callback(this.configureServiceCharacteristics(new Service.Lightbulb(), [ Characteristic.On, Characteristic.Brightness ]));
			break;
		case "temperature":
			callback(this.configureServiceCharacteristics(new Service.TemperatureSensor(), [ Characteristic.CurrentTemperature ]));
			break;
		case "temperaturehumidity":
			callback(this.configureServiceCharacteristics(new Service.TemperatureSensor(), [ Characteristic.CurrentTemperature ]));
			callback(this.configureServiceCharacteristics(new Service.HumiditySensor(), [ Characteristic.CurrentRelativeHumidity ]));
			break;
		}
	},
	configureServiceCharacteristics : function(service, characteristics) {
		var that = this;

		for (var i = 0; i < characteristics.length; i++) {
			var cx = service.getCharacteristic(characteristics[i]);
			if (cx instanceof Characteristic.SecuritySystemCurrentState) {
				cx.getValueFromDev = function(dev) {
					return (dev.state == 1 ? 0 : 3);
				};
				cx.on('get', function(callback, context) {
					TelldusLive.getDeviceInfo(that.device, function(err, cdevice) {
						that.log("Getting current state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarmed" : "armed") + "]");
						callback(false, cx.getValueFromDev(cdevice));
					});
				}.bind(this));
				cx.on('set', function(state, callback) {
					TelldusLive.onOffDevice(that.device, state!=3, function(err, result) {
						callback();
					});
				}.bind(this));
			}

			if (cx instanceof Characteristic.SecuritySystemTargetState) {
				cx.getValueFromDev = function(dev) {
					return (dev.state == 1 ? 0 : 3);
				};
				cx.on('get', function(callback, context) {
					TelldusLive.getDeviceInfo(that.device, function(err, cdevice) {
						that.log("Getting target state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarm" : "arm") + "]");
						callback(false, cx.getValueFromDev(cdevice));
					});
				}.bind(this));
				cx.on('set', function(state, callback) {
					TelldusLive.onOffDevice(that.device, state!=3, function(err, result) {
						callback();
					});
				}.bind(this));
			}

			if (cx instanceof Characteristic.ContactSensorState) {
				cx.getValueFromDev = function(dev) {
					return (dev.state == 1 ? 1 : 0);
				};
				cx.on('get', function(callback, context) {
					TelldusLive.getDeviceInfo(that.device, function(err, cdevice) {
						that.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 1 ? "open" : "closed") + "]");
						callback(false, cx.getValueFromDev(cdevice));
					});
				}.bind(this));
			}

			if (cx instanceof Characteristic.CurrentTemperature) {
				cx.getValueFromDev = function(dev) {
					return parseFloat(dev.data[0].value);
				};
				cx.on('get', function(callback, context) {
					TelldusLive.getSensorInfo(that.device, function(err, device) {
						that.log("Getting temp for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
						callback(false, cx.getValueFromDev(device));
					});
				}.bind(this));
				cx.setProps({
					minValue : -40,
					maxValue : 999
				});
			}
			if (cx instanceof Characteristic.CurrentRelativeHumidity) {
				cx.getValueFromDev = function(dev) {
					return parseFloat(dev.data[1].value);
				};
				cx.on('get', function(callback, context) {
					TelldusLive.getSensorInfo(that.device, function(err, device) {
						that.log("Getting humidity for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
						callback(false, cx.getValueFromDev(device));
					});
				}.bind(this));
				cx.setProps({
					minValue : 0,
					maxValue : 100
				});
			}
			if (cx instanceof Characteristic.On) {
				cx.getValueFromDev = function(dev) {
					return dev.state !=2;
				};
				cx.value = cx.getValueFromDev(that.device);
				cx.on('get', function(callback, context) {
					TelldusLive.getDeviceInfo(that.device, function(err, cdevice) {
						that.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) ? "on" : "off") + "]");
						switch(cx.props.format){
						case Characteristic.Formats.INT:
							callback(false, (cx.getValueFromDev(cdevice)?1:0));
							break;
						case Characteristic.Formats.BOOL:
							callback(false, (cx.getValueFromDev(cdevice)));
							break;
						}
					});
				}.bind(this));
				cx.on('set', function(powerOn, callback) {
					TelldusLive.onOffDevice(that.device, powerOn, function(err, result) {
						callback();
					});
				}.bind(this));
			}
			if (cx instanceof Characteristic.Brightness) {
				cx.getValueFromDev = function(dev) {
					if (dev.state == 1) {
						return 100;
					}
					if (dev.state == 16 && dev.statevalue !== "unde") {
						return parseInt(dev.statevalue * 100 / 255);
					}
					return 0;
				};
				cx.value = cx.getValueFromDev(that.device);
				cx.on('get', function(callback, context) {
					TelldusLive.getDeviceInfo(that.device, function(err, cdevice) {
						that.log("Getting value for dimmer " + cdevice.name + " [" + cx.getValueFromDev(cdevice) + "]");
						callback(false, cx.getValueFromDev(cdevice));
					});
				}.bind(this));
				cx.on('set', function(level, callback) {
					TelldusLive.dimDevice(that.device, that.percentageToBits(level), function(err, result) {
						callback();
					});
				}.bind(this));
			}
		}
		return service;
	}
};
