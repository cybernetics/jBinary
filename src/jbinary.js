(function (global) {

'use strict';

// https://github.com/davidchambers/Base64.js (modified)
if (!('atob' in global) || !('btoa' in global)) {
// jshint:skipline
(function(){var t=global,r="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n=function(){try{document.createElement("$")}catch(t){return t}}();t.btoa||(t.btoa=function(t){for(var o,e,a=0,c=r,f="";t.charAt(0|a)||(c="=",a%1);f+=c.charAt(63&o>>8-8*(a%1))){if(e=t.charCodeAt(a+=.75),e>255)throw n;o=o<<8|e}return f}),t.atob||(t.atob=function(t){if(t=t.replace(/=+$/,""),1==t.length%4)throw n;for(var o,e,a=0,c=0,f="";e=t.charAt(c++);~e&&(o=a%4?64*o+e:e,a++%4)?f+=String.fromCharCode(255&o>>(6&-2*a)):0)e=r.indexOf(e);return f})})();
}

var hasRequire = typeof require === 'function';

var jDataView;

function extend(obj) {
	for (var i = 1, length = arguments.length; i < length; ++i) {
		var source = arguments[i];
		for (var prop in source) {
			if (source[prop] !== undefined) {
				obj[prop] = source[prop];
			}
		}
	}
	return obj;
}

var _inherit = Object.create || function (obj) {
	var ClonedObject = function () {};
	ClonedObject.prototype = obj;
	return new ClonedObject();
};

function inherit(obj) {
	arguments[0] = _inherit(obj);
	return extend.apply(null, arguments);
}

function jBinary(view, structure) {
	/* jshint validthis:true */
	if (!(view instanceof jDataView)) {
		view = new jDataView(view);
	}
	if (!(this instanceof jBinary)) {
		return new jBinary(view, structure);
	}
	this.view = view;
	this.view.seek(0);
	this._bitShift = 0;
	this.contexts = [];
	this.structure = inherit(proto.structure, structure);
	if (structure) {
		this.cacheKey = this._getCached(structure, function () { return proto.cacheKey + '.' + (++proto.id) }, true);
	}
}

var proto = jBinary.prototype;

proto.cacheKey = 'jBinary.Cache';
proto.id = 0;

var defineProperty = Object.defineProperty;
// this is needed to detect broken Object.defineProperty in IE8:
try {
	defineProperty({}, 'x', {});
} catch (e) {
	defineProperty = null;
}

proto._getCached = function (obj, valueAccessor, allowVisible) {
	var value;
	if (!obj.hasOwnProperty(this.cacheKey)) {
		value = valueAccessor.call(this, obj);
		if (defineProperty) {
			defineProperty(obj, this.cacheKey, {value: value});
		} else
		if (allowVisible) {
			obj[this.cacheKey] = value;
		}
	} else {
		value = obj[this.cacheKey];
	}
	return value;
};

proto.getContext = function (filter) {
	switch (typeof filter) {
		case 'function':
			for (var i = 0, length = this.contexts.length; i < length; i++) {
				var context = this.contexts[i];
				if (filter.call(this, context)) {
					return context;
				}
			}
			return;

		case 'string':
			return this.getContext(function (context) { return filter in context });

		case 'number':
			return this.contexts[filter];

		case 'undefined':
			return this.contexts[0];
	}
};

proto.inContext = function (newContext, callback) {
	this.contexts.unshift(newContext);
	var result = callback.call(this);
	this.contexts.shift();
	return result;
};

jBinary.Type = function (config) {
	return inherit(jBinary.Type.prototype, config);
};

jBinary.Type.prototype = {
	withArgs: function (args) {
		if (!this.init && (!this.params || args.length === 0)) {
			return this;
		}

		var type = inherit(this);
		if (this.params) {
			for (var i = 0, length = Math.min(this.params.length, args.length); i < length; i++) {
				type[this.params[i]] = args[i];
			}
			type.params = null;
		}
		if (this.init) {
			this.init.apply(type, args);
			type.init = null;
		}
		return type;
	},
	createProperty: function (binary) {
		var property = inherit(this, {binary: binary});
		if (this.initProperty) {
			property.initProperty(binary.contexts[0]);
		}
		return property;
	}
};

jBinary.Template = function (config) {
	return inherit(jBinary.Template.prototype, config, {
		initProperty: function (context) {
			if (config.initProperty) {
				config.initProperty.call(this);
			}
			if (this.getBaseType) {
				this.baseType = this.getBaseType(context);
			}
			if (this.baseType) {
				this.baseType = this.binary.getType(this.baseType);
			}
		}
	});
};

jBinary.Template.prototype = inherit(jBinary.Type.prototype, {
	baseRead: function (context) {
		return this.binary.read(this.baseType);
	},
	baseWrite: function (value, context) {
		this.binary.write(this.baseType, value);
	}
});
jBinary.Template.prototype.read = jBinary.Template.prototype.baseRead;
jBinary.Template.prototype.write = jBinary.Template.prototype.baseWrite;

function toValue(prop, val) {
	return val instanceof Function ? val.call(prop, prop.binary.contexts[0]) : val;
}

proto.structure = {
	'extend': jBinary.Type({
		init: function () {
			this.parts = arguments;
		},
		initProperty: function () {
			var parts = this.parts, length = parts.length, partTypes = new Array(length);
			for (var i = 0; i < length; i++) {
				partTypes[i] = this.binary.getType(parts[i]);
			}
			this.parts = partTypes;
		},
		read: function () {
			var parts = this.parts, obj = this.binary.read(parts[0]);
			this.binary.inContext(obj, function () {
				for (var i = 1, length = parts.length; i < length; i++) {
					extend(obj, this.read(parts[i]));
				}
			});
			return obj;
		},
		write: function (obj) {
			var parts = this.parts;
			this.binary.inContext(obj, function () {
				for (var i = 0, length = parts.length; i < length; i++) {
					this.write(parts[i], obj);
				}
			});
		}
	}),
	'enum': jBinary.Template({
		params: ['baseType', 'matches'],
		init: function (baseType, matches) {
			this.backMatches = {};
			for (var key in matches) {
				this.backMatches[matches[key]] = key;
			}
		},
		read: function () {
			var value = this.baseRead();
			return value in this.matches ? this.matches[value] : value;
		},
		write: function (value) {
			this.baseWrite(value in this.backMatches ? this.backMatches[value] : value);
		}
	}),
	'string': jBinary.Template({
		params: ['length', 'encoding'],
		init: function (length, encoding) {
			if (length === undefined) {
				this.baseType = ['string0', undefined, encoding];
				this.read = this.baseRead;
				this.write = this.baseWrite;
			}
		},
		read: function () {
			return this.binary.view.getString(toValue(this, this.length), undefined, this.encoding);
		},
		write: function (value) {
			this.binary.view.writeString(value, undefined, this.encoding);
		}
	}),
	'string0': jBinary.Type({
		params: ['length', 'encoding'],
		read: function () {
			var view = this.binary.view, maxLength = this.length;
			if (maxLength === undefined) {
				var startPos = view.tell(), length = 0, code;
				maxLength = view.byteLength - startPos;
				while (length < maxLength && (code = view.getUint8())) {
					length++;
				}
				return view.getString(length, undefined, this.encoding);
			} else {
				return view.getString(maxLength, undefined, this.encoding).replace(/\0.*$/, '');
			}
		},
		write: function (value) {
			var view = this.binary.view, zeroLength = this.length === undefined ? 1 : this.length - value.length;
			view.writeString(value, undefined, this.encoding);
			if (zeroLength > 0) {
				view.writeUint8(0);
				view.skip(zeroLength - 1);
			}
		}
	}),
	'array': jBinary.Template({
		params: ['baseType', 'length'],
		read: function (context) {
			var length = toValue(this, this.length);
			if (this.baseType === proto.structure.uint8) {
				return this.binary.view.getBytes(length, undefined, true, true);
			}
			var results;
			if (length !== undefined) {
				results = new Array(length);
				for (var i = 0; i < length; i++) {
					results[i] = this.baseRead(context);
				}
			} else {
				var end = this.binary.view.byteLength;
				results = [];
				while (this.binary.tell() < end) {
					results.push(this.baseRead(context));
				}
			}
			return results;
		},
		write: function (values, context) {
			if (this.baseType === proto.structure.uint8) {
				return this.binary.view.writeBytes(values);
			}
			for (var i = 0, length = values.length; i < length; i++) {
				this.baseWrite(values[i], context);
			}
		}
	}),
	'object': jBinary.Type({
		params: ['structure'],
		initProperty: function () {
			var structure = {};
			for (var key in this.structure) {
				structure[key] =
					!(this.structure[key] instanceof Function)
					? this.binary.getType(this.structure[key])
					: this.structure[key];
			}
			this.structure = structure;
		},
		read: function () {
			var self = this, structure = this.structure, output = {};
			this.binary.inContext(output, function () {
				for (var key in structure) {
					var value = !(structure[key] instanceof Function)
								? structure[key].createProperty(this).read(output)
								: structure[key].call(self, this.contexts[0]);
					// skipping undefined call results (useful for 'if' statement)
					if (value !== undefined) {
						output[key] = value;
					}
				}
			});
			return output;
		},
		write: function (data) {
			var self = this, structure = this.structure;
			this.binary.inContext(data, function () {
				for (var key in structure) {
					if (!(structure[key] instanceof Function)) {
						structure[key].createProperty(this).write(data[key], data);
					} else {
						data[key] = structure[key].call(self, this.contexts[0]);
					}
				}
			});
		}
	}),
	'bitfield': jBinary.Type({
		params: ['bitSize'],
		read: function () {
			var bitSize = this.bitSize,
				binary = this.binary,
				fieldValue = 0;

			if (binary._bitShift < 0 || binary._bitShift >= 8) {
				var byteShift = binary._bitShift >> 3; // Math.floor(_bitShift / 8)
				binary.skip(byteShift);
				binary._bitShift &= 7; // _bitShift + 8 * Math.floor(_bitShift / 8)
			}
			if (binary._bitShift > 0 && bitSize >= 8 - binary._bitShift) {
				fieldValue = binary.view.getUint8() & ~(-1 << (8 - binary._bitShift));
				bitSize -= 8 - binary._bitShift;
				binary._bitShift = 0;
			}
			while (bitSize >= 8) {
				fieldValue = binary.view.getUint8() | (fieldValue << 8);
				bitSize -= 8;
			}
			if (bitSize > 0) {
				fieldValue = ((binary.view.getUint8() >>> (8 - (binary._bitShift + bitSize))) & ~(-1 << bitSize)) | (fieldValue << bitSize);
				binary._bitShift += bitSize - 8; // passing negative value for next pass
			}

			return fieldValue;
		},
		write: function (value) {
			var bitSize = this.bitSize,
				binary = this.binary,
				pos,
				curByte;

			if (binary._bitShift < 0 || binary._bitShift >= 8) {
				var byteShift = binary._bitShift >> 3; // Math.floor(_bitShift / 8)
				binary.skip(byteShift);
				binary._bitShift &= 7; // _bitShift + 8 * Math.floor(_bitShift / 8)
			}
			if (binary._bitShift > 0 && bitSize >= 8 - binary._bitShift) {
				pos = binary.tell();
				curByte = binary.view.getUint8(pos) & (-1 << (8 - binary._bitShift));
				curByte |= value >>> (bitSize - (8 - binary._bitShift));
				binary.view.setUint8(pos, curByte);
				bitSize -= 8 - binary._bitShift;
				binary._bitShift = 0;
			}
			while (bitSize >= 8) {
				binary.view.writeUint8((value >>> (bitSize - 8)) & 0xff);
				bitSize -= 8;
			}
			if (bitSize > 0) {
				pos = binary.tell();
				curByte = binary.view.getUint8(pos) & ~(~(-1 << bitSize) << (8 - (binary._bitShift + bitSize)));
				curByte |= (value & ~(-1 << bitSize)) << (8 - (binary._bitShift + bitSize));
				binary.view.setUint8(pos, curByte);
				binary._bitShift += bitSize - 8; // passing negative value for next pass
			}
		}
	}),
	'if': jBinary.Template({
		init: function (condition, trueType, falseType) {
			if (typeof condition === 'string') {
				condition = [condition, condition];
			}

			if (condition instanceof Array) {
				this.condition = function () {
					return this.binary.getContext(condition[1])[condition[0]];
				};
			} else {
				this.condition = condition;
			}

			this.trueType = trueType;
			this.falseType = falseType;
		},
		getBaseType: function (context) {
			return this.condition(context) ? this.trueType : this.falseType;
		}
	}),
	'if_not': jBinary.Template({
		init: function (condition, falseType, trueType) {
			this.baseType = ['if', condition, trueType, falseType];
		}
	}),
	'const': jBinary.Template({
		params: ['baseType', 'value', 'strict'],
		read: function () {
			var value = this.baseRead();
			if (this.strict && value !== this.value) {
				throw new TypeError('Unexpected value.');
			}
			return value;
		}
	}),
	'skip': jBinary.Type({
		init: function (length) {
			this.read = this.write = function () {
				this.binary.skip(toValue(this, length));
			};
		}
	}),
	'blob': jBinary.Type({
		params: ['length'],
		read: function () {
			return this.binary.view.getBytes(toValue(this, this.length));
		},
		write: function (bytes) {
			this.binary.view.writeBytes(bytes, true);
		}
	})
};

var dataTypes = [
	'Uint8',
	'Uint16',
	'Uint32',
	'Uint64',
	'Int8',
	'Int16',
	'Int32',
	'Int64',
	'Float32',
	'Float64',
	'Char'
];

var simpleType = jBinary.Type({
	params: ['littleEndian'],
	read: function () {
		return this.binary.view['get' + this.dataType](this.littleEndian);
	},
	write: function (value) {
		this.binary.view['write' + this.dataType](value, this.littleEndian);
	}
});

for (var i = 0, length = dataTypes.length; i < length; i++) {
	var dataType = dataTypes[i];
	proto.structure[dataType.toLowerCase()] = inherit(simpleType, {dataType: dataType});
}

proto.seek = function (position, block) {
	position = toValue(this, position);
	if (block instanceof Function) {
		var oldPos = this.view.tell();
		this.view.seek(position);
		var result = block.call(this);
		this.view.seek(oldPos);
		return result;
	} else {
		return this.view.seek(position);
	}
};

proto.tell = function () {
	return this.view.tell();
};

proto.skip = function (offset, block) {
	return this.seek(this.tell() + toValue(this, offset), block);
};

proto.getType = function (structure, args) {
	switch (typeof structure) {
		case 'string':
			return this.getType(this.structure[structure], args);

		case 'number':
			return this.getType(proto.structure.bitfield, [structure]);

		case 'object':
			if (structure instanceof jBinary.Type) {
				return structure.withArgs(args || []);
			} else {
				return structure instanceof Array
					   ? this._getCached(structure, function (structure) { return this.getType(structure[0], structure.slice(1)) }, true)
					   : this._getCached(structure, function (structure) { return this.getType(proto.structure.object, [structure]) }, false)
				;
			}
	}
};

proto.createProperty = function (structure) {
	return this.getType(structure).createProperty(this);
};

proto.read = function (structure, offset) {
	if (structure === undefined) {
		return;
	}
	var read = function () { return this.createProperty(structure).read(this.contexts[0]) };
	return offset !== undefined ? this.seek(offset, read) : read.call(this);
};

proto.write = function (structure, data, offset) {
	if (structure === undefined) {
		return;
	}
	var write = function () { this.createProperty(structure).write(data, this.contexts[0]) };
	return offset !== undefined ? this.seek(offset, write) : write.call(this);
};

proto.toURI = function (type) {
	type = type || 'application/octet-stream';
	if ('URL' in global && 'createObjectURL' in URL) {
		var data = this.seek(0, function () { return this.view.getBytes() });
		return URL.createObjectURL(new Blob([data], {type: type}));
	} else {
		var string = this.seek(0, function () { return this.view.getString(undefined, undefined, this.view._isNodeBuffer ? 'base64' : 'binary') });
		return 'data:' + type + ';base64,' + (this.view._isNodeBuffer ? string : btoa(string));
	}
};

proto.slice = function (start, end, forceCopy) {
	return new jBinary(this.view.slice(start, end, forceCopy), this.structure);
};

jBinary.loadData = function (source, callback) {
	if ('File' in global && source instanceof File) {
		var reader = new FileReader();
		reader.onload = reader.onerror = function() { callback(this.error, this.result) };
		reader.readAsArrayBuffer(source);
	} else {
		if (typeof source === 'object') {
			if (hasRequire && source instanceof require('stream').Readable) {
				var buffers = [];

				source
				.on('readable', function () { buffers.push(this.read()) })
				.on('end', function () { callback(null, Buffer.concat(buffers)) })
				.on('error', callback);
			}
			return;
		}

		if (typeof source !== 'string') {
			return callback(new TypeError('Unsupported source type.'));
		}

		var dataParts = source.match(/^data:(.+?)(;base64)?,(.*)$/);
		if (dataParts) {
			var isBase64 = dataParts[2] !== undefined,
				content = dataParts[3];

			try {
				callback(
					null,
					(isBase64 && jDataView.prototype.compatibility.NodeBuffer)
						? new Buffer(content, 'base64')
						: (isBase64 ? atob : decodeURIComponent)(content)
				);
			} catch (e) {
				callback(e);
			}
		} else
		if ('XMLHttpRequest' in global) {
			var xhr = new XMLHttpRequest();
			xhr.open('GET', source, true);

			// new browsers (XMLHttpRequest2-compliant)
			if ('responseType' in xhr) {
				xhr.responseType = 'arraybuffer';
			}
			// old browsers (XMLHttpRequest-compliant)
			else if ('overrideMimeType' in xhr) {
				xhr.overrideMimeType('text/plain; charset=x-user-defined');
			}
			// IE9 (Microsoft.XMLHTTP-compliant)
			else {
				xhr.setRequestHeader('Accept-Charset', 'x-user-defined');
			}

			// shim for onload for old IE
			if (!('onload' in xhr)) {
				xhr.onreadystatechange = function () {
					if (this.readyState === 4) {
						this.onload();
					}
				};
			}

			xhr.onload = function() {
				if (this.status !== 200) {
					return callback(new Error('HTTP Error #' + this.status + ': ' + this.statusText));
				}

				// emulating response field for IE9
				if (!('response' in this)) {
					this.response = new VBArray(this.responseBody).toArray();
				}

				callback(null, this.response);
			};

			xhr.send();
		} else
		if (hasRequire) {
			var protocol = source.match(/^(https?):\/\//);
			if (protocol) {
				require(protocol).get(source, function (res) {
					if (res.statusCode !== 200) {
						return callback(new Error('HTTP Error #' + res.statusCode));
					}
					jBinary.loadData(res, callback);
				}).on('error', callback);
			} else {
				require('fs').readFile(source, callback);
			}
		}
	}
};

if (typeof module === 'object' && module && typeof module.exports === 'object') {
	jDataView = require('jDataView');
	module.exports = jBinary;
} else
if (typeof define === 'function' && define.amd) {
	define('jBinary', ['jDataView'], function (_jDataView) {
		jDataView = _jDataView;
		return jBinary;
	});
} else {
	jDataView = global.jDataView;
	global.jBinary = jBinary;
}

jDataView.prototype.toBinary = function (structure) {
	return new jBinary(this, structure);
};

})((function () { /* jshint strict: false */ return this })());
