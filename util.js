'use strict';

module.exports.bitsToPercentage = function(value) {
  value = value / 255;
  value = value * 100;
  value = Math.round(value);
  return value;
};

// Convert 0-100 to 0-255
module.exports.percentageToBits = function(value) {
  value = value * 255;
  value = value / 100;
  value = Math.round(value);
  return value;
};
