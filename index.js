'use strict';

const bluebird = require('bluebird');
const debug = require('debug')('homebridge-telldus');

const { LocalApi, LiveApi } = require('telldus-api');

const util = require('./util');


module.exports = function(homebridge) {
	const Service = homebridge.hap.Service;
	const Characteristic = homebridge.hap.Characteristic;
	let api;
	let isLocal;

	const modelDefinitions = [
		{
			model: 'lightbulb-switch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'selflearning-switch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'codeswitch',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'lightbulb-dimmer',
			definitions: [{ service: Service.Lightbulb, characteristics: [ Characteristic.On, Characteristic.Brightness ] }],
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
		},
		{
			model: '1A2D',
			definitions: [
				{ service: Service.TemperatureSensor, characteristics: [ Characteristic.CurrentTemperature ] },
				{ service: Service.HumiditySensor, characteristics: [ Characteristic.CurrentRelativeHumidity ] }
			]
		},
		{
			model: 'window-covering',
			definitions: [{ service: Service.WindowCovering, characteristics: [ Characteristic.CurrentPosition, Characteristic.TargetPosition, Characteristic.PositionState ] }],
		},
		{
			model: 'switch',
			definitions: [{ service: Service.Switch, characteristics: [ Characteristic.On ] }],
		},
		{
			model: 'outlet',
			definitions: [{ service: Service.Outlet, characteristics: [ Characteristic.On, Characteristic.OutletInUse ] }],
		},
		{
			model: 'motion-sensor',
			definitions: [{ service: Service.MotionSensor, characteristics: [ Characteristic.MotionDetected ] }],
		},
	];

	homebridge.registerPlatform("homebridge-telldus", "Telldus", TelldusPlatform);

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
		}
		else {
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
			});
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
					throw err; // TODO callback?
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

					return sensors.map(sensor => createDevice(sensor)).filter(sensor => sensor);
        })
				.then(sensors => {
					return api.listDevices()
						.then(devices => {
							debug('getDevices response', devices);
							this.log(`Found ${devices.length} devices in telldus live.`);

							// Only supporting type 'device'
							const filtered = devices.filter(s => s.type === 'device');

							return bluebird.mapSeries(filtered, device => api.getDeviceInfo(device.id));
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
			const service = new definition.service(this.name);
			const characteristics = definition.characteristics;

			characteristics.forEach(characteristic => {
				const cx = service.getCharacteristic(characteristic);

				if (cx instanceof Characteristic.SecuritySystemCurrentState) {
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

				if (cx instanceof Characteristic.SecuritySystemTargetState) {
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

				if (cx instanceof Characteristic.ContactSensorState) {
					cx.getValueFromDev = dev => dev.state == 1 ? 1 : 0;

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting state for contact sensor " + cdevice.name + " [" + (cx.getValueFromDev(cdevice) == 1 ? "open" : "closed") + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});
				}

				if (cx instanceof Characteristic.CurrentTemperature) {
					cx.getValueFromDev = dev => parseFloat(((dev.data || [])[0] || {}).value);

					cx.on('get', (callback) => {
						bluebird.resolve(api.getSensorInfo(this.device.id)).asCallback((err, device) => {
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
					cx.getValueFromDev = dev => parseFloat(((dev.data || [])[1] || {}).value);

					cx.on('get', (callback) => {
						bluebird.resolve(api.getSensorInfo(this.device.id)).asCallback((err, device) => {
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

				const getValueFromDev = dev => dev.state != 2;

				const parseOnOffValue = (cdevice) => {
					const value = getValueFromDev(cdevice);
					this.log("Getting state for on-off " + cdevice.name + " [" + (value ? "on" : "off") + "]");

					switch (cx.props.format) {
						case Characteristic.Formats.INT:
							return value ? 1 : 0;
						case Characteristic.Formats.BOOL:
							return value;
					}
				}

				const onCharacteristicGetter = callback =>
					bluebird.resolve(api.getDeviceInfo(this.device.id))
						.then(parseOnOffValue)
						.asCallback(callback);

				if (cx instanceof Characteristic.MotionDetected) {
					cx.on('get', onCharacteristicGetter);
				}

				if (cx instanceof Characteristic.On) {
					cx.on('get', onCharacteristicGetter);

					cx.on('set', (powerOn, callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);

							// Don't turn on if already on for dimmer (prevents problems when dimming)
							// Because homekit sends both Brightness command and On command at the same time.
							const isDimmer = characteristics.indexOf(Characteristic.Brightness) > -1;
							if (powerOn && isDimmer && getValueFromDev(cdevice)) return callback();

							bluebird.resolve(api.onOffDevice(this.device.id, powerOn)).asCallback(err => {
								callback(err);
							});
						});
					});
				}

				if (cx instanceof Characteristic.OutletInUse) {
					cx.on('get', callback => callback(null, true)); // TODO?
				}

				if (cx instanceof Characteristic.Brightness) {
					cx.getValueFromDev = dev => {
						if (dev.state == 1) return 100;
						if (dev.state == 16 && dev.statevalue !== "unde") return parseInt(dev.statevalue * 100 / 255);
						return 0;
					};

					cx.on('get', (callback) => {
						bluebird.resolve(api.getDeviceInfo(this.device.id)).asCallback((err, cdevice) => {
							if (err) return callback(err);
							this.log("Getting value for dimmer " + cdevice.name + " [" + cx.getValueFromDev(cdevice) + "]");
							callback(false, cx.getValueFromDev(cdevice));
						});
					});

					cx.on('set', (level, callback) => {
						api.dimDevice(this.device.id, util.percentageToBits(level))
							.then(() => bluebird.delay(1000)) // Try to prevent massive queuing of commands on the server
							.then(() => callback(), err => callback(err));
					});
				}

				if (cx instanceof Characteristic.CurrentPosition) {
					cx.on('get', callback => bluebird.try(() => {
						const resp = this.cachedValue || 0;
						this.log(`Get CurrentPosition ${resp}`);
						return resp;
					}).asCallback(callback));
				}

				if (cx instanceof Characteristic.PositionState) {
					cx.on('get', callback => bluebird.try(() => {
						this.log(`Get PositionState`);
						return 2;
					}).asCallback(callback));
				}

				if (cx instanceof Characteristic.TargetPosition) {
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
							.asCallback(callback);
					});
				}
			});

			return service;
		}
	};
};
