'use strict';

const TellduAPI = require('telldus-live');
const bluebird = require('bluebird');
const debug = require('debug')('homebridge-telldus');

const util = require('./util');


module.exports = function(homebridge) {
	const Service = homebridge.hap.Service;
	const Characteristic = homebridge.hap.Characteristic;
	let TelldusLive;

	const modelDefinitions = [
		{
			model: 'selflearning-switch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'codeswitch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'selflearning-dimmer',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On, Characteristic.Brightness ] }],
		},
		{
			model: 'temperature',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
		// oregon protocol temperature sensor model
		{
			model: 'EA4C',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
		{
			model: 'temperaturehumidity',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		}
	];

	homebridge.registerPlatform("homebridge-telldus", "Telldus", TelldusPlatform);

	function TelldusPlatform(log, config) {
		this.log = log;

		// The config
		const publicKey = config["public_key"];
		const privateKey = config["private_key"];
		this.token = config["token"];
		this.tokenSecret = config["token_secret"];
		this.unknownAccessories = config["unknown_accessories"] || [];

		TelldusLive = new TellduAPI.TelldusAPI({ publicKey, privateKey });
		bluebird.promisifyAll(TelldusLive);
	}

	function TelldusDevice(log, unknownAccessories, device) {
		this.device = device;
		this.name = device.name;
		this.id = device.id;

		// Telldus api doesn't give model of some accessories,
		// So fetch them from config file
		const foundUnknownAccessory = unknownAccessories.find(a => a.id == device.id);
		if (foundUnknownAccessory) {
			log('Unknown accessory match found ' + foundUnknownAccessory.model);
			this.model = foundUnknownAccessory.model;
			this.manufacturer = foundUnknownAccessory.manufacturer || 'unknown';
		}
		else {
			// Split manufacturer and model
			const modelSplit = (device.model || '').split(':');
			const m = modelSplit.length === 2 ? modelSplit: [ 'unknown', 'unknown' ];
			this.model = m[0];
			this.manufacturer = m[1];
		}

		// Device log
		this.log = function(string) {
			log("[" + this.name + "] " + string);
		};
	}

	TelldusPlatform.prototype = {
		accessories: function(callback) {
			this.log("Loading accessories...");

			TelldusLive.loginAsync(this.token, this.tokenSecret)
				.then(user => {
					this.log("Logged in with user: " + user.email);
					return this.getAccessories();
				})
				.then(accessories => {
					callback(accessories);
				})
				.catch(err => {
					this.log(err.message);
					throw err;
				});
		},
		getAccessories: function() {
			return TelldusLive.getSensorsAsync()
        .then(sensors => {
					debug('getSensors response', sensors);
          this.log("Found " + sensors.length + " sensors in telldus live.");
          const fSensors = sensors.filter(s => s.name !== null);
          this.log("Filtered out " + (sensors.length - fSensors.length) + " sensor due to empty name.");
          return fSensors;
        })
        .then(sensors => sensors.map(sensor => new TelldusDevice(this.log, this.unknownAccessories, sensor)))
				.then(sensors => {
					return TelldusLive.getDevicesAsync()
						.then(devices => {
							debug('getDevices response', devices);
							this.log("Found " + devices.length + " devices in telldus live.");

							// Only supporting type 'device'
							const filtered = devices.filter(s => s.type === 'device');

							return bluebird.mapSeries(filtered, device => TelldusLive.getDeviceInfoAsync(device));
						})
						.then(devices => devices.map(device => {
							debug('getDeviceInfo response', device)
							return new TelldusDevice(this.log, this.unknownAccessories, device);
						}))
						.then(devices => sensors.concat(devices));
				});
		}
	};

	TelldusDevice.prototype = {
		// Respond to identify request
		identify: function(callback) {
			this.log("Hi!");
			callback();
		},

		getServices: function() {
			// Accessory information
			const accessoryInformation = new Service.AccessoryInformation();

			accessoryInformation
				.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
				.setCharacteristic(Characteristic.Model, this.model)
				.setCharacteristic(Characteristic.SerialNumber, this.id);

			const modelDefinition = modelDefinitions.find(d => d.model === this.model);

			let services = [];

			if (modelDefinition) {
				services = modelDefinition.definitions.map(this.configureServiceCharacteristics.bind(this));
			}
			else {
				this.log(
					`Your device (model ${this.device.model}, id ${this.id}) is not auto detected from telldus live. Please add the following to your config, under telldus platform (replace MODEL with a valid type, and optionally set manufacturer):\n` +
					`"unknown_accessories": [{ "id": ${this.id}, "model": "MODEL", "manufacturer": "unknown" }]\n` +
					`Valid models are: ${modelDefinitions.map(d => d.model).join(', ')}`
				);
			}

			return [accessoryInformation].concat(services);
		},

		configureServiceCharacteristics: function(definition) {
			const service = new definition.service();
			const characteristics = definition.characteristics;

			characteristics.forEach(characteristic => {
				const cx = service.getCharacteristic(characteristic);

				if (cx instanceof Characteristic.SecuritySystemCurrentState) {
					cx.getValueFromDev = dev => {
						if (dev.state == 2) return 3;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue);
						return 2;
					};

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting current state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarmed" : "armed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (state, callback) => {
						TelldusLive.dimDevice(this.device, state, (err, result) => {
							callback(err);
						});
					});
				}

				if (cx instanceof Characteristic.SecuritySystemTargetState) {
					cx.getValueFromDev = dev => {
						if (dev.state == 2) return 3;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue);
						return 2;
					};

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting current state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarmed" : "armed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (state, callback) => {
						TelldusLive.dimDevice(this.device, state, (err, result) => {
							callback(err);
						});
					});
				}

				if (cx instanceof Characteristic.ContactSensorState) {
					cx.getValueFromDev = dev => dev.state == 1 ? 1 : 0;

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 1 ? "open" : "closed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof Characteristic.CurrentPosition) {
					cx.getValueFromDev = dev => dev.state == 1 ? 100 : 0;
					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting current position for door " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 100 ? "open" : "closed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof Characteristic.PositionState) {
					cx.getValueFromDev = dev => 2;

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for door " + cdevice.name + " [stopped]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof Characteristic.TargetPosition) {
					cx.getValueFromDev = dev => 0;

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting target position for door " + cdevice.name + " [closed]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof Characteristic.CurrentTemperature) {
					cx.getValueFromDev = dev => parseFloat(dev.data[0].value);

					cx.on('get', (callback, context) => {
						TelldusLive.getSensorInfo(this.device, (err, device) => {
							if (err) return callback(err);
							this.log("Getting temp for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
							callback(false, cx.getValueFromDev(device));
						});
					});

					cx.setProps({
						minValue: -40,
						maxValue: 999
					});
				}

				if (cx instanceof Characteristic.CurrentRelativeHumidity) {
					cx.getValueFromDev = dev => parseFloat(dev.data[1].value);

					cx.on('get', (callback, context) => {
						TelldusLive.getSensorInfo(this.device, (err, device) => {
							if (err) return callback(err);
							this.log("Getting humidity for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
							callback(false, cx.getValueFromDev(device));
						});
					});

					cx.setProps({
						minValue: 0,
						maxValue: 100
					});
				}

				if (cx instanceof Characteristic.On) {
					cx.getValueFromDev = dev => dev.state != 2;

					cx.value = cx.getValueFromDev(this.device);

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) ? "on" : "off") + "]");

							switch (cx.props.format) {
							case Characteristic.Formats.INT:
								callback(false, cx.getValueFromDev(cdevice) ? 1 : 0);
								break;
							case Characteristic.Formats.BOOL:
								callback(false, cx.getValueFromDev(cdevice));
								break;
							}
						});
					});

					cx.on('set', (powerOn, callback) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);

							// Don't turn on if already on for dimmer (prevents problems when dimming)
							// Because homekit sends both Brightness command and On command at the same time.
							const isDimmer = characteristics.indexOf(Characteristic.Brightness) > -1;
							if (powerOn && isDimmer && cx.getValueFromDev(cdevice)) return callback();

							TelldusLive.onOffDevice(this.device, powerOn, (err, result) => {
								callback(err);
							});
						});
					});
				}

				if (cx instanceof Characteristic.Brightness) {
					cx.getValueFromDev = dev => {
						if (dev.state == 1) return 100;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue * 100 / 255);
						return 0;
					};

					cx.value = cx.getValueFromDev(this.device);

					cx.on('get', (callback, context) => {
						TelldusLive.getDeviceInfo(this.device, (err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting value for dimmer " + cdevice.name + " [" + cx.getValueFromDev(cdevice) + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (level, callback) => {
						TelldusLive.dimDeviceAsync(this.device, util.percentageToBits(level))
							.then(() => bluebird.delay(1000)) // Try to prevent massive queuing of commands on the server
							.then(() => callback(), err => callback(err));
					});
				}
			});

			return service;
		}
	};
};
