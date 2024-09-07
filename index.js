'use strict';

const bluebird = require('bluebird');
const debug = require('debug')('homebridge-telldus-pn');
const { LocalApi, LiveApi } = require('telldus-api');
const util = require('./util');
const fs = require("fs");
const { stringify } = require('querystring');

const commands = {
	on: 0x0001, // 1
	off: 0x0002, // 2
	bell: 0x0004, // 4
	toggle: 0x0008, // 8
	dim: 0x0010, // 16
	learn: 0x0020, // 32
	execute: 0x0040, // 64
	up: 0x0080, // 128
	down: 0x0100, // 256
	stop: 0x0200, // 512
	rgb: 0x0400, // 1024
	thermostat: 0x800, // 2048
};

// mask for device matching without dimming
const noDimmerMask = Object.values(commands).reduce((memo, num) => memo + num, 0) - commands.dim;  // all but dimmer

const deviceTypes = {
	unknown: '00000000-0001-1000-2005-ACCA54000000', 
	alarmSensor: '00000001-0001-1000-2005-ACCA54000000',
	container: '00000002-0001-1000-2005-ACCA54000000',
	controller: '00000003-0001-1000-2005-ACCA54000000',
	doorWindow: '00000004-0001-1000-2005-ACCA54000000',
	light: '00000005-0001-1000-2005-ACCA54000000',
	lock: '00000006-0001-1000-2005-ACCA54000000',
	media: '00000007-0001-1000-2005-ACCA54000000',
	meter: '00000008-0001-1000-2005-ACCA54000000',
	motion: '00000009-0001-1000-2005-ACCA54000000',
	onOffSensor: '0000000A-0001-1000-2005-ACCA54000000',
	person: '0000000B-0001-1000-2005-ACCA54000000',
	remoteControl: '0000000C-0001-1000-2005-ACCA54000000',
	sensor: '0000000D-0001-1000-2005-ACCA54000000',
	smokeSensor: '0000000E-0001-1000-2005-ACCA54000000',
	speaker: '0000000F-0001-1000-2005-ACCA54000000',
	switchOutlet: '00000010-0001-1000-2005-ACCA54000000',
	thermostat: '00000011-0001-1000-2005-ACCA54000000',
	virtual: '00000012-0001-1000-2005-ACCA54000000',
	windowCovering: '00000013-0001-1000-2005-ACCA54000000',
	projectorScreen: '00000014-0001-1000-2005-ACCA54000000',
};

module.exports = function(homebridge) {
	// Compatibility with both Homebridge 1.x and 2.x
	const api = homebridge ? (homebridge.hap ? homebridge.hap : homebridge.api.hap) : undefined;
	
	const Service = api ? api.Service : homebridge.hap.Service;
	const Characteristic = api ? api.Characteristic : homebridge.hap.Characteristic;
	
	let isLocal;

	const modelDefinitions = [
		{
			deviceType: deviceTypes.light,
			model: 'selflearning-switch',
			definitions: [{ service: Service.Switch, characteristics: [ Characteristic.On ] }],
		},
		{
			deviceType: deviceTypes.light,
			model: 'codeswitch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			commandMask: commands.dim,
			deviceType: deviceTypes.light,
			model: 'selflearning-dimmer',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On, Characteristic.Brightness ] }],
		},
		{
			deviceType: deviceTypes.doorWindow,
			model: 'selflearning-switch',  // nexa
			definitions: [{ service: Service.Window, characteristics: [ Characteristic.CurrentPosition, Characteristic.TargetPosition, Characteristic.PositionState ] }],
		},
		{
			deviceType: deviceTypes.windowCovering,
			model: 'window-covering',
			definitions: [{ service: Service.WindowCovering, characteristics: [ Characteristic.CurrentPosition, Characteristic.TargetPosition, Characteristic.PositionState ] }],
		},
		{
			deviceType: deviceTypes.smokeSensor,
			model: 'smokesensor',
			definitions: [{ service: Service.SmokeSensor, characteristics: [ Characteristic.SmokeDetected ] }],
		},
		{
			deviceType: deviceTypes.switchOutlet,
			model: 'switch',
			definitions: [{ service: Service.Switch, characteristics: [ Characteristic.On ] }],
		},
		{
			deviceType: deviceTypes.switchOutlet,
			model: '0154-0003-000a',
			definitions: [{ service: Service.Switch, characteristics: [ Characteristic.On ] }],
		},		
		{	// Sensors starts here
			model: 'temperature',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
		// oregon protocol temperature sensor model
		{
			model: 'EA4C',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
		{	// special case with yr.no plugin in telldus
			model: 'n\/a',
			protocol: 'YR',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		},
		{
			model: 'temperaturehumidity',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		},
		{
			model: '1A2D',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		},
		{
			model: '010f-0c02-1003',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
		{
			model: '019a-0003-000a',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		},
		{
			model: '0060-0015-0001',
			definitions: [{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] }],
		},
	];
	
	module.exports = (homebridge) => {
		homebridge.registerPlatform('homebridge-telldus-pn', "Telldus", TelldusPlatform);
	};

	function TelldusPlatform(log, config) {
		this.log = log;

		isLocal = !!config.local;

		log(`isLocal: ${isLocal}`);

		// The config
		if (isLocal) {
			const ipAddress = config.local.ip_address;
			const accessToken = config.local.access_token;
			if (!ipAddress) throw new Error('Please specify ip_address in config');
			if (!accessToken) throw new Error('Please specify access_token in config');

			api = new LocalApi({ host: ipAddress, accessToken });
		} else {
			const key = config["public_key"];
			const secret = config["private_key"];
			const tokenKey = config["token"];
			const tokenSecret = config["token_secret"];
			if (!key) throw new Error('Please specify public_key in config');
			if (!secret) throw new Error('Please specify private_key in config');
			if (!tokenKey) throw new Error('Please specify token in config');
			if (!tokenSecret) throw new Error('Please specify token_secret in config');

			api = new LiveApi({
				key,
				secret,
				tokenKey,
				tokenSecret,
			}, log);  // pass log object to log inside api
		}

		this.unknownAccessories = config["unknown_accessories"] || [];
	}

	function TelldusDevice(log, device, deviceConfig) {
		this.device = device;
		this.name = device.name;
		this.id = device.id;

		log(`Creating accessory with ID ${this.id}. Name from telldus: ${this.name}`);

		// Split manufacturer and model
		const modelSplit = (device.model || '').split(':');
		this.model = modelSplit[0] || 'unknown';
		this.manufacturer = modelSplit[1] || 'unknown';

		if (deviceConfig) {
			log(`Custom config found for ID ${deviceConfig.id}.`);
			if (deviceConfig.model) {
				log(`Custom model: '${deviceConfig.model}' overrides '${device.model}' from telldus`);
				this.model = deviceConfig.model;
			}
			if (deviceConfig.manufacturer) {
				log(`Custom manufacturer: '${deviceConfig.manufacturer}' overrides '${device.manufacturer}' from telldus`);
				this.manufacturer = deviceConfig.manufacturer;
			}
			if (deviceConfig.name) {
				log(`Custom name: '${deviceConfig.name}' overrides '${device.name}' from telldus`);
				this.name = deviceConfig.name;
			}
		}

		// Device log
		this.log = function(string) {
			log("[" + this.name + "] " + string);
		};
	}

	TelldusPlatform.prototype = {
		accessories: function(callback) {
			this.log("Loading accessories...");

			this.getAccessories()
				.then(accessories => {
					callback(accessories);
				})
				.catch(err => {
					this.log(err.message);
					throw err;
				});
		},
		getAccessories: function() {
			const createDevice = (device) => {
				// If we are running against local API, ID's are different
				const deviceConfig = isLocal
					// https://github.com/jchnlemon/homebridge-telldus/issues/56
					? this.unknownAccessories.find(a => a.local_id == device.id && ((!a.type && !device.type) || a.type === device.type))
					: this.unknownAccessories.find(a => a.id == device.id)

				if ((deviceConfig && deviceConfig.disabled)) {
					this.log(`Device ${device.id} is disabled, ignoring`);
					return;
				}

				if (!device.name) {
					this.log(`Device ${device.id} has no name from telldus, ignoring`);
					return;
				}

				return new TelldusDevice(this.log, device, deviceConfig);
			};

			return api.listSensors()
        .then(sensors => {
					debug('getSensors response', sensors);
			        this.log(`Found ${sensors.length} sensors in telldus live.`);

					// filter out unsupported sensors
					// model = "n/a"
					// exceoption is yr.no plugin
					const filtered = sensors.filter(s => !(s.model == 'n\/a' && s.protocol != 'yr'));

					// this.log(`Filtered sensors ${JSON.stringify(filtered, null, 2)}`);					

					return filtered.map(sensor => createDevice(sensor)).filter(sensor => sensor);
        })
				.then(sensors => {
					return api.listDevices()
						.then(devices => {
							debug('getDevices response', devices);
							this.log(`Found ${devices.length} devices in telldus live.`);

							// Only supporting type 'device' and when methods exists
							// TODO: Smoke detector is ignored here. Telldus does not send correct devicetype
							const filtered = devices.filter(s => s.type === 'device' && s.methods > 0);

							return bluebird.mapSeries(filtered, device => device);  // No need to look up as all info is here
//							return bluebird.mapSeries(filtered, device => api.getDeviceInfo(device.id));
						})
						.then(devices => {
							debug('getDeviceInfo responses', devices);
							return devices.map(device => createDevice(device)).filter(sensor => sensor);
						})
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
			// Check if 'api' and 'hap' are available
			const hap = this.api ? this.api.hap : undefined;
			
			// Access Service and Characteristic either from 'hap' or from the root (old versions)
			const Service = hap ? hap.Service : global.Service;
			const Characteristic = hap ? hap.Characteristic : global.Characteristic;

			// Create accessory information service
			const accessoryInformation = new Service.AccessoryInformation();

			// Set characteristics
			accessoryInformation
				.setCharacteristic(Characteristic.Manufacturer, this.manufacturer)
				.setCharacteristic(Characteristic.Model, this.model)
				.setCharacteristic(Characteristic.SerialNumber, this.id);

			// Model is missing for devices, find by devicetype and command combination (dimmer only for now)
			const modelDeviceDimmer = modelDefinitions.find(d => {

				// upper case devicetype first
				const deviceType = this.device.deviceType ? this.device.deviceType.toUpperCase() : '';
				return	d.deviceType == deviceType && (this.device.methods & d.commandMask) == commands.dim;
			});
			
			const modelDevice = modelDefinitions.find(d => {

				// upper case devicetype first
				const deviceType = this.device.deviceType ? this.device.deviceType.toUpperCase() : '';
				return	d.deviceType == deviceType;
			});

			const modelSensor = modelDefinitions.find(d => {
				// handle protocol if that is used to find correct type
				const protocol = this.device.protocol ? this.device.protocol.toUpperCase() : '';			
				return	d.model === this.model || protocol == d.protocol;
			});

			let services = [];

			// model check first (sensors)
			if (modelSensor) {
				// this.log(`Device ${this.name}, sensor`);
				services = modelSensor.definitions.map(this.configureServiceCharacteristics.bind(this));
			} // dimmer
			else if (modelDeviceDimmer) {
				// this.log(`Device ${this.name}, Dimmer`);
				services = modelDeviceDimmer.definitions.map(this.configureServiceCharacteristics.bind(this));
			} // other devices
			else if (modelDevice) {
				// this.log(`Device ${this.name}, Other device`);
				services = modelDevice.definitions.map(this.configureServiceCharacteristics.bind(this));
			}
			else {
				this.log(
					`Your device (Name ${this.name}, model ${this.model}, id ${this.id}) is not auto detected from telldus live. Please add the following to your config, under telldus platform (replace MODEL with a valid type, and optionally set manufacturer):\n` +
					`"unknown_accessories": [{ "id": ${this.id}, "model": "MODEL", "manufacturer": "unknown" }]\n` +
					`Valid models are: ${modelDefinitions.map(d => d.model).join(', ')}`
				);
			}

			return [accessoryInformation].concat(services);
		},

		configureServiceCharacteristics: function(definition) {
			// Ensure compatibility between Homebridge 1.x and 2.x
			const api = homebridge ? (homebridge.hap ? homebridge.hap : homebridge.api.hap) : undefined;
			
			const service = new definition.service(this.name);
			const characteristics = definition.characteristics;

			characteristics.forEach(characteristic => {
				const cx = service.getCharacteristic(characteristic);

				if (cx instanceof api.SecuritySystemCurrentState) {

					cx.getValueFromDev = dev => {
						if (dev.state == 2) return 3;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue);
						return 2;
					};

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting current state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarmed" : "armed") + "]");
							// bluebird.delay(1000) //API Delay
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (state, callback) => {
						bluebird.resolve(api.dimDevice(this.device.id, state)).asCallback(err => {
							callback(err);
						});
					});
				}

				if (cx instanceof api.SecuritySystemTargetState) {
					cx.getValueFromDev = dev => {
						if (dev.state == 2) return 3;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue);
						return 2;
					};

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting current state for security " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 3 ? "disarmed" : "armed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (state, callback) => {
						bluebird.resolve(api.dimDevice(this.device.id, state)).asCallback(err => {
							callback(err);
						});
					});
				}

				if (cx instanceof api.ContactSensorState) {
					cx.getValueFromDev = dev => dev.state == commands.on ? commands.on : 0;

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 1 ? "open" : "closed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof api.CurrentTemperature) {
					cx.getValueFromDev = dev => parseFloat(((dev.data.filter(a => a.name == 'temp') || [])[0] || {}).value);  // find value by name

					cx.on('get', (callback) => {
						bluebird.resolve(api.getSensorInfo(this.device.id)).asCallback((err, device) => {
							if (err) return callback(err);
							
							if (isNaN(cx.getValueFromDev(device))) {
								this.log("Getting temp for sensor " + device.name + " [0]");
								callback(false, 0);
							} else {
								this.log("Getting temp for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
								callback(false, cx.getValueFromDev(device));
							}
						});
					});

					cx.setProps({
						minValue: -40,
						maxValue: 999
					});
				}

				if (cx instanceof api.CurrentRelativeHumidity) {
					cx.getValueFromDev = dev => parseFloat(((dev.data.filter(a => a.name == 'humidity') || [])[0] || {}).value);  // find value by name
					
					cx.on('get', (callback) => {
						bluebird.resolve(api.getSensorInfo(this.device.id)).asCallback((err, device) => {
							if (err) return callback(err); 

							//ADDED THIS ROW TO BREAK AWAY FROM NaN 
							if (isNaN(cx.getValueFromDev(device))) {
								this.log("Getting humidity for sensor " + device.name + " [0]");
								callback(false, 0);	
							}else {
								this.log("Getting humidity for sensor " + device.name + " [" + cx.getValueFromDev(device) + "]");
								callback(false, cx.getValueFromDev(device));
							}
						});
					});

					cx.setProps({
						minValue: 0,
						maxValue: 100
					});
				}

				if (cx instanceof api.On) {
					cx.getValueFromDev = dev => dev.state != commands.off;  // True/False retur

					cx.value = cx.getValueFromDev(this.device);

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for switch " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) ? "on" : "off") + "]");

							switch (cx.props.format) {
							case api.Formats.INT:
								callback(false, cx.getValueFromDev(cdevice) ? 1 : 0);
								break;
							case api.Formats.BOOL:
								callback(false, cx.getValueFromDev(cdevice));
								break;
							}
						});
					});

					cx.on('set', (powerOn, callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);

							this.log("Set power on " + cdevice.name);
							this.log("Set power on state: " + cdevice.state);
							this.log("Set power on statevalue: " + cdevice.statevalue);

							bluebird.delay(500) //API Delay
							// Don't turn on if already on for dimmer (prevents problems when dimming)
							// Because homekit sends both Brightness command and On command at the same time.
							const isDimmer = characteristics.indexOf(Characteristic.Brightness) > -1;
							// if (powerOn && isDimmer && cx.getValueFromDev(cdevice)) return callback();

							if (powerOn && isDimmer) {  // set dimvalue instead of power on
								bluebird.resolve(api.dimDevice(cdevice.id, cdevice.statevalue)).asCallback(err => {
									callback(err);
								});
							}
							else {  // on off
								bluebird.resolve(api.onOffDevice(cdevice.id, powerOn)).asCallback(err => {
									callback(err);
								});
							}
							// 16 hvis dimmer og < 100%, ellers 2
							// kalle opp dimming i stedet?
							
							// bluebird.resolve(api.onOffDevice(this.device.id, powerOn)).asCallback(err => {
							//	callback(err);
							// });
						});
					});
				}

				if (cx instanceof api.Brightness) {
					cx.getValueFromDev = dev => {

						// this.log(`Getting value for dimmer ${dev.name} state: ${dev.state}, stateValue: ${dev.statevalue}`);

						if (dev.state == 1) return 100; 
						if (dev.state == 16 && dev.statevalue !== "unde")
							{
								const value = util.bitsToPercentage(dev.statevalue)
								return value;
							}
						return 0; // state 0 or 2 = off
					};

					cx.value = cx.getValueFromDev(this.device);

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting value for dimmer " + cdevice.name + " [" + cx.getValueFromDev(cdevice) + "]");
							//bluebird.delay(1000) //API Delay
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (level, callback) => {

						this.log(`Dimmer set value ${this.device.name}, value ${level}`);

						api.dimDevice(this.device.id, util.percentageToBits(level))
							.then(() => bluebird.delay(200)) // Delay to wait for power on to be completed
							.then(() => callback(null), err => callback(err));
					});
				}

				if (cx instanceof api.CurrentPosition) {
					cx.on('get', callback => bluebird.try(() => {
						const resp = this.cachedValue || 0;
						this.log(`Get CurrentPosition ${resp}`);
						return resp;
					}).asCallback(callback));
				}

				if (cx instanceof api.PositionState) {
					cx.on('get', callback => bluebird.try(() => {
						this.log(`Get PositionState`);
						return 2;
					}).asCallback(callback));
				}

				if (cx instanceof api.TargetPosition) {
					cx.on('get', callback => bluebird.try(() => {
						const resp = this.cachedValue || 0;
						this.log(`Get TargetPosition ${resp}`);
						return resp;
					}).asCallback(callback));

					cx.on('set', (value, callback) => {
						this.cachedValue = value;

						const up = value > 0;
						this.log(`Door ${up ? 'up' : 'down'}`);
						bluebird.resolve(api.upDownDevice(this.device.id, up)
							.then(data => debug(data)))
							//.then(() => bluebird.delay(1000)) //API Delay
							.asCallback(callback);
					});
				}
			});
			return service;
		}
	};
};
