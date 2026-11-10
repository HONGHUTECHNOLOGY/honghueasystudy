!(function (e, t) {
	typeof exports === 'object' && typeof module === 'object'
		? (module.exports = t())
		: typeof define === 'function' && define.amd
		? define([], t)
		: typeof exports === 'object'
		? (exports.websdk = t())
		: (e.websdk = t());
})(window, function () {
	return (function (e) {
		const t = {};
		function r(o) {
			if (t[o]) return t[o].exports;
			const n = (t[o] = { i: o, l: !1, exports: {} });
			return e[o].call(n.exports, n, n.exports, r), (n.l = !0), n.exports;
		}
		return (
			(r.m = e),
			(r.c = t),
			(r.d = function (e, t, o) {
				r.o(e, t) || Object.defineProperty(e, t, { enumerable: !0, get: o });
			}),
			(r.r = function (e) {
				typeof Symbol !== 'undefined' &&
					Symbol.toStringTag &&
					Object.defineProperty(e, Symbol.toStringTag, { value: 'Module' }),
					Object.defineProperty(e, '__esModule', { value: !0 });
			}),
			(r.t = function (e, t) {
				if ((1 & t && (e = r(e)), 8 & t)) return e;
				if (4 & t && typeof e === 'object' && e && e.__esModule) return e;
				const o = Object.create(null);
				if ((r.r(o), Object.defineProperty(o, 'default', { enumerable: !0, value: e }), 2 & t && typeof e !== 'string'))
					for (const n in e)
						r.d(
							o,
							n,
							function (t) {
								return e[t];
							}.bind(null, n)
						);
				return o;
			}),
			(r.n = function (e) {
				const t =
					e && e.__esModule
						? function () {
								return e.default;
						  }
						: function () {
								return e;
						  };
				return r.d(t, 'a', t), t;
			}),
			(r.o = function (e, t) {
				return Object.prototype.hasOwnProperty.call(e, t);
			}),
			(r.p = '/Users/zhangdong/code/kefu-fe/websdk/packages/sdk'),
			r((r.s = 102))
		);
	})([
		function (e, t, r) {
			'use strict';
			typeof Object.create === 'function'
				? (e.exports = function (e, t) {
						(e.super_ = t),
							(e.prototype = Object.create(t.prototype, {
								constructor: { value: e, enumerable: !1, writable: !0, configurable: !0 }
							}));
				  })
				: (e.exports = function (e, t) {
						e.super_ = t;
						const r = function () {};
						(r.prototype = t.prototype), (e.prototype = new r()), (e.prototype.constructor = e);
				  });
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				return e && e.__esModule ? e : { default: e };
			};
		},
		,
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			let n;
			n = (function () {
				return this;
			})();
			try {
				n = n || new Function('return this')();
			} catch (e) {
				(typeof window === 'undefined' ? 'undefined' : o(window)) === 'object' && (n = window);
			}
			e.exports = n;
		},
		function (e, t, r) {
			'use strict';
			let o;
				let n;
				const i = (e.exports = r(13));
				const s = r(82);
			(i.codegen = r(146)),
				(i.fetch = r(147)),
				(i.path = r(148)),
				(i.fs = i.inquire('fs')),
				(i.toArray = function (e) {
					if (e) {
						for (var t = Object.keys(e), r = new Array(t.length), o = 0; o < t.length; ) r[o] = e[t[o++]];
						return r;
					}
					return [];
				}),
				(i.toObject = function (e) {
					for (var t = {}, r = 0; r < e.length; ) {
						const o = e[r++];
							const n = e[r++];
						void 0 !== n && (t[o] = n);
					}
					return t;
				});
			const a = /\\/g;
				const u = /"/g;
			(i.isReserved = function (e) {
				return /^(?:do|if|in|for|let|new|try|var|case|else|enum|eval|false|null|this|true|void|with|break|catch|class|const|super|throw|while|yield|delete|export|import|public|return|static|switch|typeof|default|extends|finally|package|private|continue|debugger|function|arguments|interface|protected|implements|instanceof)$/.test(
					e
				);
			}),
				(i.safeProp = function (e) {
					return !/^[$\w_]+$/.test(e) || i.isReserved(e)
						? '["' + e.replace(a, '\\\\').replace(u, '\\"') + '"]'
						: '.' + e;
				}),
				(i.ucFirst = function (e) {
					return e.charAt(0).toUpperCase() + e.substring(1);
				});
			const c = /_([a-z])/g;
			(i.camelCase = function (e) {
				return (
					e.substring(0, 1) +
					e.substring(1).replace(c, function (e, t) {
						return t.toUpperCase();
					})
				);
			}),
				(i.compareFieldsById = function (e, t) {
					return e.id - t.id;
				}),
				(i.decorateType = function (e, t) {
					if (e.$type)
						return (
							t &&
								e.$type.name !== t &&
								(i.decorateRoot.remove(e.$type), (e.$type.name = t), i.decorateRoot.add(e.$type)),
							e.$type
						);
					o || (o = r(46));
					const n = new o(t || e.name);
					return (
						i.decorateRoot.add(n),
						(n.ctor = e),
						Object.defineProperty(e, '$type', { value: n, enumerable: !1 }),
						Object.defineProperty(e.prototype, '$type', { value: n, enumerable: !1 }),
						n
					);
				});
			let l = 0;
			(i.decorateEnum = function (e) {
				if (e.$type) return e.$type;
				n || (n = r(11));
				const t = new n('Enum' + l++, e);
				return i.decorateRoot.add(t), Object.defineProperty(e, '$type', { value: t, enumerable: !1 }), t;
			}),
				Object.defineProperty(i, 'decorateRoot', {
					get: function () {
						return s.decorated || (s.decorated = new (r(51))());
					}
				});
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(66);
			function i() {
				n.call(this);
			}
			o(i, n),
				(i.prototype.removeAllListeners = function (e) {
					e ? delete this._listeners[e] : (this._listeners = {});
				}),
				(i.prototype.once = function (e, t) {
					const r = this;
						let o = !1;
					this.on(e, function n() {
						r.removeListener(e, n), o || ((o = !0), t.apply(this, arguments));
					});
				}),
				(i.prototype.emit = function () {
					const e = arguments[0];
						const t = this._listeners[e];
					if (t) {
						for (var r = arguments.length, o = new Array(r - 1), n = 1; n < r; n++) o[n - 1] = arguments[n];
						for (let i = 0; i < t.length; i++) t[i].apply(this, o);
					}
				}),
				(i.prototype.on = i.prototype.addListener = n.prototype.addEventListener),
				(i.prototype.removeListener = n.prototype.removeEventListener),
				(e.exports.EventEmitter = i);
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			function n(e) {
				return (n =
					typeof Symbol === 'function' && o(Symbol.iterator) === 'symbol'
						? function (e) {
								return o(e);
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: o(e);
						  })(e);
			}
			function i(t) {
				return (
					typeof Symbol === 'function' && n(Symbol.iterator) === 'symbol'
						? (e.exports = i =
								function (e) {
									return n(e);
								})
						: (e.exports = i =
								function (e) {
									return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
										? 'symbol'
										: n(e);
								}),
					i(t)
				);
			}
			e.exports = i;
		},
		function (e, t, r) {
			'use strict';
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const o = function () {
				return {
					WEBIM_CONNCTION_USER_NOT_ASSIGN_ERROR: 0,
					WEBIM_CONNCTION_OPEN_ERROR: 1,
					WEBIM_CONNCTION_AUTH_ERROR: 2,
					WEBIM_CONNCTION_OPEN_USERGRID_ERROR: 3,
					WEBIM_CONNCTION_ATTACH_ERROR: 4,
					WEBIM_CONNCTION_ATTACH_USERGRID_ERROR: 5,
					WEBIM_CONNCTION_REOPEN_ERROR: 6,
					WEBIM_CONNCTION_SERVER_CLOSE_ERROR: 7,
					WEBIM_CONNCTION_SERVER_ERROR: 8,
					WEBIM_CONNCTION_IQ_ERROR: 9,
					WEBIM_CONNCTION_USER_REMOVED: 207,
					WEBIM_CONNCTION_USER_LOGIN_ANOTHER_DEVICE: 206,
					WEBIM_CONNCTION_USER_KICKED_BY_CHANGE_PASSWORD: 216,
					WEBIM_CONNCTION_USER_KICKED_BY_OTHER_DEVICE: 217,
					WEBIM_CONNCTION_PING_ERROR: 10,
					WEBIM_CONNCTION_NOTIFYVERSION_ERROR: 11,
					WEBIM_CONNCTION_GETROSTER_ERROR: 12,
					WEBIM_CONNCTION_CROSSDOMAIN_ERROR: 13,
					WEBIM_CONNCTION_LISTENING_OUTOF_MAXRETRIES: 14,
					WEBIM_CONNCTION_RECEIVEMSG_CONTENTERROR: 15,
					WEBIM_CONNCTION_DISCONNECTED: 16,
					WEBIM_CONNCTION_AJAX_ERROR: 17,
					WEBIM_CONNCTION_JOINROOM_ERROR: 18,
					WEBIM_CONNCTION_GETROOM_ERROR: 19,
					WEBIM_CONNCTION_GETROOMINFO_ERROR: 20,
					WEBIM_CONNCTION_GETROOMMEMBER_ERROR: 21,
					WEBIM_CONNCTION_GETROOMOCCUPANTS_ERROR: 22,
					WEBIM_CONNCTION_LOAD_CHATROOM_ERROR: 23,
					WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR: 24,
					WEBIM_CONNCTION_JOINCHATROOM_ERROR: 25,
					WEBIM_CONNCTION_QUITCHATROOM_ERROR: 26,
					WEBIM_CONNCTION_APPKEY_NOT_ASSIGN_ERROR: 27,
					WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR: 28,
					WEBIM_CONNCTION_SESSIONID_NOT_ASSIGN_ERROR: 29,
					WEBIM_CONNCTION_RID_NOT_ASSIGN_ERROR: 30,
					WEBIM_CONNCTION_CALLBACK_INNER_ERROR: 31,
					WEBIM_CONNCTION_CLIENT_OFFLINE: 32,
					WEBIM_CONNCTION_CLIENT_LOGOUT: 33,
					WEBIM_CONNCTION_CLIENT_TOO_MUCH_ERROR: 34,
					WEBIM_CONNECTION_ACCEPT_INVITATION_FROM_GROUP: 35,
					WEBIM_CONNECTION_DECLINE_INVITATION_FROM_GROUP: 36,
					WEBIM_CONNECTION_ACCEPT_JOIN_GROUP: 37,
					WEBIM_CONNECTION_DECLINE_JOIN_GROUP: 38,
					WEBIM_CONNECTION_CLOSED: 39,
					WEBIM_UPLOADFILE_BROWSER_ERROR: 100,
					WEBIM_UPLOADFILE_ERROR: 101,
					WEBIM_UPLOADFILE_NO_LOGIN: 102,
					WEBIM_UPLOADFILE_NO_FILE: 103,
					WEBIM_DOWNLOADFILE_ERROR: 200,
					WEBIM_DOWNLOADFILE_NO_LOGIN: 201,
					WEBIM_DOWNLOADFILE_BROWSER_ERROR: 202,
					WEBIM_MESSAGE_REC_TEXT: 300,
					WEBIM_MESSAGE_REC_TEXT_ERROR: 301,
					WEBIM_MESSAGE_REC_EMOTION: 302,
					WEBIM_MESSAGE_REC_PHOTO: 303,
					WEBIM_MESSAGE_REC_AUDIO: 304,
					WEBIM_MESSAGE_REC_AUDIO_FILE: 305,
					WEBIM_MESSAGE_REC_VEDIO: 306,
					WEBIM_MESSAGE_REC_VEDIO_FILE: 307,
					WEBIM_MESSAGE_REC_FILE: 308,
					WEBIM_MESSAGE_SED_TEXT: 309,
					WEBIM_MESSAGE_SED_EMOTION: 310,
					WEBIM_MESSAGE_SED_PHOTO: 311,
					WEBIM_MESSAGE_SED_AUDIO: 312,
					WEBIM_MESSAGE_SED_AUDIO_FILE: 313,
					WEBIM_MESSAGE_SED_VEDIO: 314,
					WEBIM_MESSAGE_SED_VEDIO_FILE: 315,
					WEBIM_MESSAGE_SED_FILE: 316,
					WEBIM_MESSAGE_SED_ERROR: 317,
					STATUS_INIT: 400,
					STATUS_DOLOGIN_USERGRID: 401,
					STATUS_DOLOGIN_IM: 402,
					STATUS_OPENED: 403,
					STATUS_CLOSING: 404,
					STATUS_CLOSED: 405,
					STATUS_ERROR: 406,
					GROUP_NOT_EXIST: 605,
					GROUP_NOT_JOINED: 602,
					MESSAGE_RECALL_TIME_LIMIT: 504,
					SERVICE_NOT_ENABLED: 505,
					SERVICE_NOT_ALLOW_MESSAGING: 506,
					SERVER_UNKNOWN_ERROR: 503,
					MESSAGE_INCLUDE_ILLEGAL_CONTENT: 501,
					PERMISSION_DENIED: 603,
					WEBIM_LOAD_MSG_ERROR: 604
				};
			};
			t.default = o;
		},
		function (e, t, r) {
			'use strict';
			e.exports = n;
			let o = null;
			try {
				o = new WebAssembly.Instance(
					new WebAssembly.Module(
						new Uint8Array([
							0, 97, 115, 109, 1, 0, 0, 0, 1, 13, 2, 96, 0, 1, 127, 96, 4, 127, 127, 127, 127, 1, 127, 3, 7, 6, 0, 1, 1,
							1, 1, 1, 6, 6, 1, 127, 1, 65, 0, 11, 7, 50, 6, 3, 109, 117, 108, 0, 1, 5, 100, 105, 118, 95, 115, 0, 2, 5,
							100, 105, 118, 95, 117, 0, 3, 5, 114, 101, 109, 95, 115, 0, 4, 5, 114, 101, 109, 95, 117, 0, 5, 8, 103,
							101, 116, 95, 104, 105, 103, 104, 0, 0, 10, 191, 1, 6, 4, 0, 35, 0, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1,
							173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 126, 34, 4, 66, 32, 135, 167, 36, 0, 32,
							4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134,
							132, 127, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32,
							134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 128, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11,
							36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132, 32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 129,
							34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11, 36, 1, 1, 126, 32, 0, 173, 32, 1, 173, 66, 32, 134, 132,
							32, 2, 173, 32, 3, 173, 66, 32, 134, 132, 130, 34, 4, 66, 32, 135, 167, 36, 0, 32, 4, 167, 11
						])
					),
					{}
				).exports;
			} catch (e) {}
			function n(e, t, r) {
				(this.low = 0 | e), (this.high = 0 | t), (this.unsigned = !!r);
			}
			function i(e) {
				return !0 === (e && e.__isLong__);
			}
			n.prototype.__isLong__, Object.defineProperty(n.prototype, '__isLong__', { value: !0 }), (n.isLong = i);
			const s = {};
				const a = {};
			function u(e, t) {
				let r, o, n;
				return t
					? (n = (e >>>= 0) >= 0 && e < 256) && (o = a[e])
						? o
						: ((r = l(e, (0 | e) < 0 ? -1 : 0, !0)), n && (a[e] = r), r)
					: (n = (e |= 0) >= -128 && e < 128) && (o = s[e])
					? o
					: ((r = l(e, e < 0 ? -1 : 0, !1)), n && (s[e] = r), r);
			}
			function c(e, t) {
				if (isNaN(e)) return t ? _ : v;
				if (t) {
					if (e < 0) return _;
					if (e >= y) return T;
				} else {
					if (e <= -m) return S;
					if (e + 1 >= m) return N;
				}
				return e < 0 ? c(-e, t).neg() : l(e % d | 0, (e / d) | 0, t);
			}
			function l(e, t, r) {
				return new n(e, t, r);
			}
			(n.fromInt = u), (n.fromNumber = c), (n.fromBits = l);
			const p = Math.pow;
			function f(e, t, r) {
				if (e.length === 0) throw Error('empty string');
				if (e === 'NaN' || e === 'Infinity' || e === '+Infinity' || e === '-Infinity') return v;
				if ((typeof t === 'number' ? ((r = t), (t = !1)) : (t = !!t), (r = r || 10) < 2 || r > 36))
					throw RangeError('radix');
				let o;
				if ((o = e.indexOf('-')) > 0) throw Error('interior hyphen');
				if (o === 0) return f(e.substring(1), t, r).neg();
				for (var n = c(p(r, 8)), i = v, s = 0; s < e.length; s += 8) {
					const a = Math.min(8, e.length - s);
						const u = parseInt(e.substring(s, s + a), r);
					if (a < 8) {
						const l = c(p(r, a));
						i = i.mul(l).add(c(u));
					} else i = (i = i.mul(n)).add(c(u));
				}
				return (i.unsigned = t), i;
			}
			function h(e, t) {
				return typeof e === 'number'
					? c(e, t)
					: typeof e === 'string'
					? f(e, t)
					: l(e.low, e.high, typeof t === 'boolean' ? t : e.unsigned);
			}
			(n.fromString = f), (n.fromValue = h);
			var d = 4294967296;
				var y = d * d;
				var m = y / 2;
				const g = u(1 << 24);
				var v = u(0);
			n.ZERO = v;
			var _ = u(0, !0);
			n.UZERO = _;
			const b = u(1);
			n.ONE = b;
			const E = u(1, !0);
			n.UONE = E;
			const O = u(-1);
			n.NEG_ONE = O;
			var N = l(-1, 2147483647, !1);
			n.MAX_VALUE = N;
			var T = l(-1, -1, !0);
			n.MAX_UNSIGNED_VALUE = T;
			var S = l(0, -2147483648, !1);
			n.MIN_VALUE = S;
			const I = n.prototype;
			(I.toInt = function () {
				return this.unsigned ? this.low >>> 0 : this.low;
			}),
				(I.toNumber = function () {
					return this.unsigned ? (this.high >>> 0) * d + (this.low >>> 0) : this.high * d + (this.low >>> 0);
				}),
				(I.toString = function (e) {
					if ((e = e || 10) < 2 || e > 36) throw RangeError('radix');
					if (this.isZero()) return '0';
					if (this.isNegative()) {
						if (this.eq(S)) {
							const t = c(e);
								const r = this.div(t);
								const o = r.mul(t).sub(this);
							return r.toString(e) + o.toInt().toString(e);
						}
						return '-' + this.neg().toString(e);
					}
					for (let n = c(p(e, 6), this.unsigned), i = this, s = ''; ; ) {
						const a = i.div(n);
							let u = (i.sub(a.mul(n)).toInt() >>> 0).toString(e);
						if ((i = a).isZero()) return u + s;
						for (; u.length < 6; ) u = '0' + u;
						s = '' + u + s;
					}
				}),
				(I.getHighBits = function () {
					return this.high;
				}),
				(I.getHighBitsUnsigned = function () {
					return this.high >>> 0;
				}),
				(I.getLowBits = function () {
					return this.low;
				}),
				(I.getLowBitsUnsigned = function () {
					return this.low >>> 0;
				}),
				(I.getNumBitsAbs = function () {
					if (this.isNegative()) return this.eq(S) ? 64 : this.neg().getNumBitsAbs();
					for (var e = this.high != 0 ? this.high : this.low, t = 31; t > 0 && (e & (1 << t)) == 0; t--);
					return this.high != 0 ? t + 33 : t + 1;
				}),
				(I.isZero = function () {
					return this.high === 0 && this.low === 0;
				}),
				(I.eqz = I.isZero),
				(I.isNegative = function () {
					return !this.unsigned && this.high < 0;
				}),
				(I.isPositive = function () {
					return this.unsigned || this.high >= 0;
				}),
				(I.isOdd = function () {
					return (1 & this.low) == 1;
				}),
				(I.isEven = function () {
					return (1 & this.low) == 0;
				}),
				(I.equals = function (e) {
					return (
						i(e) || (e = h(e)),
						(this.unsigned === e.unsigned || this.high >>> 31 != 1 || e.high >>> 31 != 1) &&
							this.high === e.high &&
							this.low === e.low
					);
				}),
				(I.eq = I.equals),
				(I.notEquals = function (e) {
					return !this.eq(e);
				}),
				(I.neq = I.notEquals),
				(I.ne = I.notEquals),
				(I.lessThan = function (e) {
					return this.comp(e) < 0;
				}),
				(I.lt = I.lessThan),
				(I.lessThanOrEqual = function (e) {
					return this.comp(e) <= 0;
				}),
				(I.lte = I.lessThanOrEqual),
				(I.le = I.lessThanOrEqual),
				(I.greaterThan = function (e) {
					return this.comp(e) > 0;
				}),
				(I.gt = I.greaterThan),
				(I.greaterThanOrEqual = function (e) {
					return this.comp(e) >= 0;
				}),
				(I.gte = I.greaterThanOrEqual),
				(I.ge = I.greaterThanOrEqual),
				(I.compare = function (e) {
					if ((i(e) || (e = h(e)), this.eq(e))) return 0;
					const t = this.isNegative();
						const r = e.isNegative();
					return t && !r
						? -1
						: !t && r
						? 1
						: this.unsigned
						? e.high >>> 0 > this.high >>> 0 || (e.high === this.high && e.low >>> 0 > this.low >>> 0)
							? -1
							: 1
						: this.sub(e).isNegative()
						? -1
						: 1;
				}),
				(I.comp = I.compare),
				(I.negate = function () {
					return !this.unsigned && this.eq(S) ? S : this.not().add(b);
				}),
				(I.neg = I.negate),
				(I.add = function (e) {
					i(e) || (e = h(e));
					const t = this.high >>> 16;
						const r = 65535 & this.high;
						const o = this.low >>> 16;
						const n = 65535 & this.low;
						const s = e.high >>> 16;
						const a = 65535 & e.high;
						const u = e.low >>> 16;
						let c = 0;
						let p = 0;
						let f = 0;
						let d = 0;
					return (
						(f += (d += n + (65535 & e.low)) >>> 16),
						(p += (f += o + u) >>> 16),
						(c += (p += r + a) >>> 16),
						(c += t + s),
						l(((f &= 65535) << 16) | (d &= 65535), ((c &= 65535) << 16) | (p &= 65535), this.unsigned)
					);
				}),
				(I.subtract = function (e) {
					return i(e) || (e = h(e)), this.add(e.neg());
				}),
				(I.sub = I.subtract),
				(I.multiply = function (e) {
					if (this.isZero()) return v;
					if ((i(e) || (e = h(e)), o)) return l(o.mul(this.low, this.high, e.low, e.high), o.get_high(), this.unsigned);
					if (e.isZero()) return v;
					if (this.eq(S)) return e.isOdd() ? S : v;
					if (e.eq(S)) return this.isOdd() ? S : v;
					if (this.isNegative()) return e.isNegative() ? this.neg().mul(e.neg()) : this.neg().mul(e).neg();
					if (e.isNegative()) return this.mul(e.neg()).neg();
					if (this.lt(g) && e.lt(g)) return c(this.toNumber() * e.toNumber(), this.unsigned);
					const t = this.high >>> 16;
						const r = 65535 & this.high;
						const n = this.low >>> 16;
						const s = 65535 & this.low;
						const a = e.high >>> 16;
						const u = 65535 & e.high;
						const p = e.low >>> 16;
						const f = 65535 & e.low;
						let d = 0;
						let y = 0;
						let m = 0;
						let _ = 0;
					return (
						(m += (_ += s * f) >>> 16),
						(y += (m += n * f) >>> 16),
						(m &= 65535),
						(y += (m += s * p) >>> 16),
						(d += (y += r * f) >>> 16),
						(y &= 65535),
						(d += (y += n * p) >>> 16),
						(y &= 65535),
						(d += (y += s * u) >>> 16),
						(d += t * f + r * p + n * u + s * a),
						l(((m &= 65535) << 16) | (_ &= 65535), ((d &= 65535) << 16) | (y &= 65535), this.unsigned)
					);
				}),
				(I.mul = I.multiply),
				(I.divide = function (e) {
					if ((i(e) || (e = h(e)), e.isZero())) throw Error('division by zero');
					let t, r, n;
					if (o)
						return this.unsigned || this.high !== -2147483648 || e.low !== -1 || e.high !== -1
							? l((this.unsigned ? o.div_u : o.div_s)(this.low, this.high, e.low, e.high), o.get_high(), this.unsigned)
							: this;
					if (this.isZero()) return this.unsigned ? _ : v;
					if (this.unsigned) {
						if ((e.unsigned || (e = e.toUnsigned()), e.gt(this))) return _;
						if (e.gt(this.shru(1))) return E;
						n = _;
					} else {
						if (this.eq(S))
							return e.eq(b) || e.eq(O)
								? S
								: e.eq(S)
								? b
								: (t = this.shr(1).div(e).shl(1)).eq(v)
								? e.isNegative()
									? b
									: O
								: ((r = this.sub(e.mul(t))), (n = t.add(r.div(e))));
						if (e.eq(S)) return this.unsigned ? _ : v;
						if (this.isNegative()) return e.isNegative() ? this.neg().div(e.neg()) : this.neg().div(e).neg();
						if (e.isNegative()) return this.div(e.neg()).neg();
						n = v;
					}
					for (r = this; r.gte(e); ) {
						t = Math.max(1, Math.floor(r.toNumber() / e.toNumber()));
						for (
							var s = Math.ceil(Math.log(t) / Math.LN2), a = s <= 48 ? 1 : p(2, s - 48), u = c(t), f = u.mul(e);
							f.isNegative() || f.gt(r);

						)
							f = (u = c((t -= a), this.unsigned)).mul(e);
						u.isZero() && (u = b), (n = n.add(u)), (r = r.sub(f));
					}
					return n;
				}),
				(I.div = I.divide),
				(I.modulo = function (e) {
					return (
						i(e) || (e = h(e)),
						o
							? l((this.unsigned ? o.rem_u : o.rem_s)(this.low, this.high, e.low, e.high), o.get_high(), this.unsigned)
							: this.sub(this.div(e).mul(e))
					);
				}),
				(I.mod = I.modulo),
				(I.rem = I.modulo),
				(I.not = function () {
					return l(~this.low, ~this.high, this.unsigned);
				}),
				(I.and = function (e) {
					return i(e) || (e = h(e)), l(this.low & e.low, this.high & e.high, this.unsigned);
				}),
				(I.or = function (e) {
					return i(e) || (e = h(e)), l(this.low | e.low, this.high | e.high, this.unsigned);
				}),
				(I.xor = function (e) {
					return i(e) || (e = h(e)), l(this.low ^ e.low, this.high ^ e.high, this.unsigned);
				}),
				(I.shiftLeft = function (e) {
					return (
						i(e) && (e = e.toInt()),
						(e &= 63) == 0
							? this
							: e < 32
							? l(this.low << e, (this.high << e) | (this.low >>> (32 - e)), this.unsigned)
							: l(0, this.low << (e - 32), this.unsigned)
					);
				}),
				(I.shl = I.shiftLeft),
				(I.shiftRight = function (e) {
					return (
						i(e) && (e = e.toInt()),
						(e &= 63) == 0
							? this
							: e < 32
							? l((this.low >>> e) | (this.high << (32 - e)), this.high >> e, this.unsigned)
							: l(this.high >> (e - 32), this.high >= 0 ? 0 : -1, this.unsigned)
					);
				}),
				(I.shr = I.shiftRight),
				(I.shiftRightUnsigned = function (e) {
					if ((i(e) && (e = e.toInt()), (e &= 63) === 0)) return this;
					const t = this.high;
					return e < 32
						? l((this.low >>> e) | (t << (32 - e)), t >>> e, this.unsigned)
						: l(e === 32 ? t : t >>> (e - 32), 0, this.unsigned);
				}),
				(I.shru = I.shiftRightUnsigned),
				(I.shr_u = I.shiftRightUnsigned),
				(I.toSigned = function () {
					return this.unsigned ? l(this.low, this.high, !1) : this;
				}),
				(I.toUnsigned = function () {
					return this.unsigned ? this : l(this.low, this.high, !0);
				}),
				(I.toBytes = function (e) {
					return e ? this.toBytesLE() : this.toBytesBE();
				}),
				(I.toBytesLE = function () {
					const e = this.high;
						const t = this.low;
					return [
						255 & t,
						(t >>> 8) & 255,
						(t >>> 16) & 255,
						t >>> 24,
						255 & e,
						(e >>> 8) & 255,
						(e >>> 16) & 255,
						e >>> 24
					];
				}),
				(I.toBytesBE = function () {
					const e = this.high;
						const t = this.low;
					return [
						e >>> 24,
						(e >>> 16) & 255,
						(e >>> 8) & 255,
						255 & e,
						t >>> 24,
						(t >>> 16) & 255,
						(t >>> 8) & 255,
						255 & t
					];
				}),
				(n.fromBytes = function (e, t, r) {
					return r ? n.fromBytesLE(e, t) : n.fromBytesBE(e, t);
				}),
				(n.fromBytesLE = function (e, t) {
					return new n(
						e[0] | (e[1] << 8) | (e[2] << 16) | (e[3] << 24),
						e[4] | (e[5] << 8) | (e[6] << 16) | (e[7] << 24),
						t
					);
				}),
				(n.fromBytesBE = function (e, t) {
					return new n(
						(e[4] << 24) | (e[5] << 16) | (e[6] << 8) | e[7],
						(e[0] << 24) | (e[1] << 16) | (e[2] << 8) | e[3],
						t
					);
				});
		},
		function (e, t, r) {
			'use strict';
			const o = r(65);
			e.exports = {
				getOrigin: function (e) {
					if (!e) return null;
					const t = new o(e);
					if (t.protocol === 'file:') return null;
					let r = t.port;
					return r || (r = t.protocol === 'https:' ? '443' : '80'), t.protocol + '//' + t.hostname + ':' + r;
				},
				isOriginEqual: function (e, t) {
					const r = this.getOrigin(e) === this.getOrigin(t);
					return r;
				},
				isSchemeEqual: function (e, t) {
					return e.split(':')[0] === t.split(':')[0];
				},
				addPath: function (e, t) {
					const r = e.split('?');
					return r[0] + t + (r[1] ? '?' + r[1] : '');
				},
				addQuery: function (e, t) {
					return e + (e.indexOf('?') === -1 ? '?' + t : '&' + t);
				}
			};
		},
		,
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			e.exports = a;
			const n = r(19);
			((a.prototype = Object.create(n.prototype)).constructor = a).className = 'Enum';
			const i = r(27);
				const s = r(4);
			function a(e, t, r, i, s) {
				if ((n.call(this, e, r), t && o(t) !== 'object')) throw TypeError('values must be an object');
				if (
					((this.valuesById = {}),
					(this.values = Object.create(this.valuesById)),
					(this.comment = i),
					(this.comments = s || {}),
					(this.reserved = void 0),
					t)
				)
					for (let a = Object.keys(t), u = 0; u < a.length; ++u)
						typeof t[a[u]] === 'number' && (this.valuesById[(this.values[a[u]] = t[a[u]])] = a[u]);
			}
			(a.fromJSON = function (e, t) {
				const r = new a(e, t.values, t.options, t.comment, t.comments);
				return (r.reserved = t.reserved), r;
			}),
				(a.prototype.toJSON = function (e) {
					const t = !!e && Boolean(e.keepComments);
					return s.toObject([
						'options',
						this.options,
						'values',
						this.values,
						'reserved',
						this.reserved && this.reserved.length ? this.reserved : void 0,
						'comment',
						t ? this.comment : void 0,
						'comments',
						t ? this.comments : void 0
					]);
				}),
				(a.prototype.add = function (e, t, r) {
					if (!s.isString(e)) throw TypeError('name must be a string');
					if (!s.isInteger(t)) throw TypeError('id must be an integer');
					if (void 0 !== this.values[e]) throw Error("duplicate name '" + e + "' in " + this);
					if (this.isReservedId(t)) throw Error('id ' + t + ' is reserved in ' + this);
					if (this.isReservedName(e)) throw Error("name '" + e + "' is reserved in " + this);
					if (void 0 !== this.valuesById[t]) {
						if (!this.options || !this.options.allow_alias) throw Error('duplicate id ' + t + ' in ' + this);
						this.values[e] = t;
					} else this.valuesById[(this.values[e] = t)] = e;
					return (this.comments[e] = r || null), this;
				}),
				(a.prototype.remove = function (e) {
					if (!s.isString(e)) throw TypeError('name must be a string');
					const t = this.values[e];
					if (t == null) throw Error("name '" + e + "' does not exist in " + this);
					return delete this.valuesById[t], delete this.values[e], delete this.comments[e], this;
				}),
				(a.prototype.isReservedId = function (e) {
					return i.isReservedId(this.reserved, e);
				}),
				(a.prototype.isReservedName = function (e) {
					return i.isReservedName(this.reserved, e);
				});
		},
		function (e, t, r) {
			'use strict';
			(function (e, o) {
				let n;
				function i(e) {
					return (i =
						typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
							? function (e) {
									return typeof e;
							  }
							: function (e) {
									return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
										? 'symbol'
										: typeof e;
							  })(e);
				}
				/*! JSON v3.3.2 | http://bestiejs.github.io/json3 | Copyright 2012-2014, Kit Cambridge | http://kit.mit-license.org */ (function () {
					const s = r(115);
						const a = { function: !0, object: !0 };
						const u = a[i(t)] && t && !t.nodeType && t;
						let c = (a[typeof window === 'undefined' ? 'undefined' : i(window)] && window) || this;
						const l = u && a[i(e)] && e && !e.nodeType && (void 0 === o ? 'undefined' : i(o)) == 'object' && o;
					function p(e, t) {
						e || (e = c.Object()), t || (t = c.Object());
						const r = e.Number || c.Number;
							const o = e.String || c.String;
							const n = e.Object || c.Object;
							const s = e.Date || c.Date;
							const u = e.SyntaxError || c.SyntaxError;
							const l = e.TypeError || c.TypeError;
							const f = e.Math || c.Math;
							const h = e.JSON || c.JSON;
						i(h) == 'object' && h && ((t.stringify = h.stringify), (t.parse = h.parse));
						let d;
							let y;
							const m = n.prototype;
							const g = m.toString;
							let v = new s(-0xc782b5b800cec);
						try {
							v =
								v.getUTCFullYear() == -109252 &&
								v.getUTCMonth() === 0 &&
								v.getUTCDate() === 1 &&
								v.getUTCHours() == 10 &&
								v.getUTCMinutes() == 37 &&
								v.getUTCSeconds() == 6 &&
								v.getUTCMilliseconds() == 708;
						} catch (e) {}
						function _(e) {
							if (void 0 !== _[e]) return _[e];
							let n;
							if (e == 'bug-string-char-index') n = 'a'[0] != 'a';
							else if (e == 'json') n = _('json-stringify') && _('json-parse');
							else {
								let i;
									const a = '{"a":[1,true,false,null,"\\u0000\\b\\n\\f\\r\\t"]}';
								if (e == 'json-stringify') {
									const u = t.stringify;
										let c = typeof u === 'function' && v;
									if (c) {
										(i = function () {
											return 1;
										}).toJSON = i;
										try {
											c =
												u(0) === '0' &&
												u(new r()) === '0' &&
												u(new o()) == '""' &&
												void 0 === u(g) &&
												void 0 === u(void 0) &&
												void 0 === u() &&
												u(i) === '1' &&
												u([i]) == '[1]' &&
												u([void 0]) == '[null]' &&
												u(null) == 'null' &&
												u([void 0, g, null]) == '[null,null,null]' &&
												u({ a: [i, !0, !1, null, '\0\b\n\f\r\t'] }) == a &&
												u(null, i) === '1' &&
												u([1, 2], null, 1) == '[\n 1,\n 2\n]' &&
												u(new s(-864e13)) == '"-271821-04-20T00:00:00.000Z"' &&
												u(new s(864e13)) == '"+275760-09-13T00:00:00.000Z"' &&
												u(new s(-621987552e5)) == '"-000001-01-01T00:00:00.000Z"' &&
												u(new s(-1)) == '"1969-12-31T23:59:59.999Z"';
										} catch (e) {
											c = !1;
										}
									}
									n = c;
								}
								if (e == 'json-parse') {
									const l = t.parse;
									if (typeof l === 'function')
										try {
											if (l('0') === 0 && !l(!1)) {
												var p = (i = l(a)).a.length == 5 && i.a[0] === 1;
												if (p) {
													try {
														p = !l('"\t"');
													} catch (e) {}
													if (p)
														try {
															p = l('01') !== 1;
														} catch (e) {}
													if (p)
														try {
															p = l('1.') !== 1;
														} catch (e) {}
												}
											}
										} catch (e) {
											p = !1;
										}
									n = p;
								}
							}
							return (_[e] = !!n);
						}
						if (!_('json')) {
							const b = _('bug-string-char-index');
							if (!v)
								var E = f.floor,
									O = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334],
									N = function (e, t) {
										return (
											O[t] +
											365 * (e - 1970) +
											E((e - 1969 + (t = +(t > 1))) / 4) -
											E((e - 1901 + t) / 100) +
											E((e - 1601 + t) / 400)
										);
									};
							if (
								((d = m.hasOwnProperty) ||
									(d = function (e) {
										let t;
											let r = {};
										return (
											((r.__proto__ = null), (r.__proto__ = { toString: 1 }), r).toString != g
												? (d = function (e) {
														const t = this.__proto__;
															const r = e in ((this.__proto__ = null), this);
														return (this.__proto__ = t), r;
												  })
												: ((t = r.constructor),
												  (d = function (e) {
														const r = (this.constructor || t).prototype;
														return e in this && !(e in r && this[e] === r[e]);
												  })),
											(r = null),
											d.call(this, e)
										);
									}),
								(y = function (e, t) {
									let r;
										let o;
										let n;
										let s = 0;
									for (n in (((r = function () {
										this.valueOf = 0;
									}).prototype.valueOf = 0),
									(o = new r())))
										d.call(o, n) && s++;
									return (
										(r = o = null),
										s
											? (y =
													s == 2
														? function (e, t) {
																let r;
																	const o = {};
																	const n = g.call(e) == '[object Function]';
																for (r in e)
																	(n && r == 'prototype') || d.call(o, r) || !(o[r] = 1) || !d.call(e, r) || t(r);
														  }
														: function (e, t) {
																let r;
																	let o;
																	const n = g.call(e) == '[object Function]';
																for (r in e)
																	(n && r == 'prototype') || !d.call(e, r) || (o = r === 'constructor') || t(r);
																(o || d.call(e, (r = 'constructor'))) && t(r);
														  })
											: ((o = [
													'valueOf',
													'toString',
													'toLocaleString',
													'propertyIsEnumerable',
													'isPrototypeOf',
													'hasOwnProperty',
													'constructor'
											  ]),
											  (y = function (e, t) {
													let r;
														let n;
														const s = g.call(e) == '[object Function]';
														const u =
															(!s &&
																typeof e.constructor !== 'function' &&
																a[i(e.hasOwnProperty)] &&
																e.hasOwnProperty) ||
															d;
													for (r in e) (s && r == 'prototype') || !u.call(e, r) || t(r);
													for (n = o.length; (r = o[--n]); u.call(e, r) && t(r));
											  })),
										y(e, t)
									);
								}),
								!_('json-stringify'))
							) {
								const T = { 92: '\\\\', 34: '\\"', 8: '\\b', 12: '\\f', 10: '\\n', 13: '\\r', 9: '\\t' };
									const S = function (e, t) {
										return ('000000' + (t || 0)).slice(-e);
									};
									const I = function (e) {
										for (
											var t = '"', r = 0, o = e.length, n = !b || o > 10, i = n && (b ? e.split('') : e);
											r < o;
											r++
										) {
											const s = e.charCodeAt(r);
											switch (s) {
												case 8:
												case 9:
												case 10:
												case 12:
												case 13:
												case 34:
												case 92:
													t += T[s];
													break;
												default:
													if (s < 32) {
														t += '\\u00' + S(2, s.toString(16));
														break;
													}
													t += n ? i[r] : e.charAt(r);
											}
										}
										return t + '"';
									};
								t.stringify = function (e, t, r) {
									let o, n, s, u;
									if (a[i(t)] && t)
										if ((u = g.call(t)) == '[object Function]') n = t;
										else if (u == '[object Array]') {
											s = {};
											for (
												var c, p = 0, f = t.length;
												p < f;
												c = t[p++], ((u = g.call(c)) == '[object String]' || u == '[object Number]') && (s[c] = 1)
											);
										}
									if (r)
										if ((u = g.call(r)) == '[object Number]') {
											if ((r -= r % 1) > 0) for (o = '', r > 10 && (r = 10); o.length < r; o += ' ');
										} else u == '[object String]' && (o = r.length <= 10 ? r : r.slice(0, 10));
									return (function e(t, r, o, n, s, a, u) {
										let c, p, f, h, m, v, _, b, O, T, w, C, R, x, A, j;
										try {
											c = r[t];
										} catch (e) {}
										if (i(c) == 'object' && c)
											if ((p = g.call(c)) != '[object Date]' || d.call(c, 'toJSON'))
												typeof c.toJSON === 'function' &&
													((p != '[object Number]' && p != '[object String]' && p != '[object Array]') ||
														d.call(c, 'toJSON')) &&
													(c = c.toJSON(t));
											else if (c > -1 / 0 && c < 1 / 0) {
												if (N) {
													for (m = E(c / 864e5), f = E(m / 365.2425) + 1970 - 1; N(f + 1, 0) <= m; f++);
													for (h = E((m - N(f, 0)) / 30.42); N(f, h + 1) <= m; h++);
													(m = 1 + m - N(f, h)),
														(_ = E((v = ((c % 864e5) + 864e5) % 864e5) / 36e5) % 24),
														(b = E(v / 6e4) % 60),
														(O = E(v / 1e3) % 60),
														(T = v % 1e3);
												} else
													(f = c.getUTCFullYear()),
														(h = c.getUTCMonth()),
														(m = c.getUTCDate()),
														(_ = c.getUTCHours()),
														(b = c.getUTCMinutes()),
														(O = c.getUTCSeconds()),
														(T = c.getUTCMilliseconds());
												c =
													(f <= 0 || f >= 1e4 ? (f < 0 ? '-' : '+') + S(6, f < 0 ? -f : f) : S(4, f)) +
													'-' +
													S(2, h + 1) +
													'-' +
													S(2, m) +
													'T' +
													S(2, _) +
													':' +
													S(2, b) +
													':' +
													S(2, O) +
													'.' +
													S(3, T) +
													'Z';
											} else c = null;
										if ((o && (c = o.call(r, t, c)), c === null)) return 'null';
										if ((p = g.call(c)) == '[object Boolean]') return '' + c;
										if (p == '[object Number]') return c > -1 / 0 && c < 1 / 0 ? '' + c : 'null';
										if (p == '[object String]') return I('' + c);
										if (i(c) == 'object') {
											for (x = u.length; x--; ) if (u[x] === c) throw l();
											if ((u.push(c), (w = []), (A = a), (a += s), p == '[object Array]')) {
												for (R = 0, x = c.length; R < x; R++)
													(C = e(R, c, o, n, s, a, u)), w.push(void 0 === C ? 'null' : C);
												j = w.length
													? s
														? '[\n' + a + w.join(',\n' + a) + '\n' + A + ']'
														: '[' + w.join(',') + ']'
													: '[]';
											} else
												y(n || c, function (t) {
													const r = e(t, c, o, n, s, a, u);
													void 0 !== r && w.push(I(t) + ':' + (s ? ' ' : '') + r);
												}),
													(j = w.length
														? s
															? '{\n' + a + w.join(',\n' + a) + '\n' + A + '}'
															: '{' + w.join(',') + '}'
														: '{}');
											return u.pop(), j;
										}
									})('', (((c = {})[''] = e), c), n, s, o, '', []);
								};
							}
							if (!_('json-parse')) {
								let w;
									let C;
									const R = o.fromCharCode;
									const x = { 92: '\\', 34: '"', 47: '/', 98: '\b', 116: '\t', 110: '\n', 102: '\f', 114: '\r' };
									const A = function () {
										throw ((w = C = null), u());
									};
									const j = function () {
										for (var e, t, r, o, n, i = C, s = i.length; w < s; )
											switch ((n = i.charCodeAt(w))) {
												case 9:
												case 10:
												case 13:
												case 32:
													w++;
													break;
												case 123:
												case 125:
												case 91:
												case 93:
												case 58:
												case 44:
													return (e = b ? i.charAt(w) : i[w]), w++, e;
												case 34:
													for (e = '@', w++; w < s; )
														if ((n = i.charCodeAt(w)) < 32) A();
														else if (n == 92)
															switch ((n = i.charCodeAt(++w))) {
																case 92:
																case 34:
																case 47:
																case 98:
																case 116:
																case 110:
																case 102:
																case 114:
																	(e += x[n]), w++;
																	break;
																case 117:
																	for (t = ++w, r = w + 4; w < r; w++)
																		((n = i.charCodeAt(w)) >= 48 && n <= 57) ||
																			(n >= 97 && n <= 102) ||
																			(n >= 65 && n <= 70) ||
																			A();
																	e += R('0x' + i.slice(t, w));
																	break;
																default:
																	A();
															}
														else {
															if (n == 34) break;
															for (n = i.charCodeAt(w), t = w; n >= 32 && n != 92 && n != 34; ) n = i.charCodeAt(++w);
															e += i.slice(t, w);
														}
													if (i.charCodeAt(w) == 34) return w++, e;
													A();
												default:
													if (((t = w), n == 45 && ((o = !0), (n = i.charCodeAt(++w))), n >= 48 && n <= 57)) {
														for (
															n == 48 && (n = i.charCodeAt(w + 1)) >= 48 && n <= 57 && A(), o = !1;
															w < s && (n = i.charCodeAt(w)) >= 48 && n <= 57;
															w++
														);
														if (i.charCodeAt(w) == 46) {
															for (r = ++w; r < s && (n = i.charCodeAt(r)) >= 48 && n <= 57; r++);
															r == w && A(), (w = r);
														}
														if ((n = i.charCodeAt(w)) == 101 || n == 69) {
															for (
																((n = i.charCodeAt(++w)) != 43 && n != 45) || w++, r = w;
																r < s && (n = i.charCodeAt(r)) >= 48 && n <= 57;
																r++
															);
															r == w && A(), (w = r);
														}
														return +i.slice(t, w);
													}
													if ((o && A(), i.slice(w, w + 4) == 'true')) return (w += 4), !0;
													if (i.slice(w, w + 5) == 'false') return (w += 5), !1;
													if (i.slice(w, w + 4) == 'null') return (w += 4), null;
													A();
											}
										return '$';
									};
									const k = function (e, t, r) {
										const o = M(e, t, r);
										void 0 === o ? delete e[t] : (e[t] = o);
									};
									var M = function (e, t, r) {
										let o;
											const n = e[t];
										if (i(n) == 'object' && n)
											if (g.call(n) == '[object Array]') for (o = n.length; o--; ) k(n, o, r);
											else
												y(n, function (e) {
													k(n, e, r);
												});
										return r.call(e, t, n);
									};
								t.parse = function (e, t) {
									let r, o;
									return (
										(w = 0),
										(C = '' + e),
										(r = (function e(t) {
											let r, o;
											if ((t == '$' && A(), typeof t === 'string')) {
												if ((b ? t.charAt(0) : t[0]) == '@') return t.slice(1);
												if (t == '[') {
													for (r = []; (t = j()) != ']'; o || (o = !0))
														o && (t == ',' ? (t = j()) == ']' && A() : A()), t == ',' && A(), r.push(e(t));
													return r;
												}
												if (t == '{') {
													for (r = {}; (t = j()) != '}'; o || (o = !0))
														o && (t == ',' ? (t = j()) == '}' && A() : A()),
															(t != ',' && typeof t === 'string' && (b ? t.charAt(0) : t[0]) == '@' && j() == ':') ||
																A(),
															(r[t.slice(1)] = e(j()));
													return r;
												}
												A();
											}
											return t;
										})(j())),
										j() != '$' && A(),
										(w = C = null),
										t && g.call(t) == '[object Function]' ? M((((o = {})[''] = r), o), '', t) : r
									);
								};
							}
						}
						return (t.runInContext = p), t;
					}
					if ((!l || (l.global !== l && l.window !== l && l.self !== l) || (c = l), u && !s)) p(c, u);
					else {
						let f = c.JSON;
							let h = c.JSON3;
							let d = !1;
							var y = p(
								c,
								(c.JSON3 = {
									noConflict: function () {
										return d || ((d = !0), (c.JSON = f), (c.JSON3 = h), (f = h = null)), y;
									}
								})
							);
						c.JSON = { parse: y.parse, stringify: y.stringify };
					}
					s &&
						(void 0 ===
							(n = function () {
								return y;
							}.call(t, r, t, e)) ||
							(e.exports = n));
				}).call(void 0);
			}).call(this, r(114)(e), r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (e) {
				function o(e) {
					return (o =
						typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
							? function (e) {
									return typeof e;
							  }
							: function (e) {
									return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
										? 'symbol'
										: typeof e;
							  })(e);
				}
				const n = t;
				function i(e, t, r) {
					for (let o = Object.keys(t), n = 0; n < o.length; ++n) (void 0 !== e[o[n]] && r) || (e[o[n]] = t[o[n]]);
					return e;
				}
				function s(e) {
					function t(e, r) {
						if (!(this instanceof t)) return new t(e, r);
						Object.defineProperty(this, 'message', {
							get: function () {
								return e;
							}
						}),
							Error.captureStackTrace
								? Error.captureStackTrace(this, t)
								: Object.defineProperty(this, 'stack', { value: new Error().stack || '' }),
							r && i(this, r);
					}
					return (
						((t.prototype = Object.create(Error.prototype)).constructor = t),
						Object.defineProperty(t.prototype, 'name', {
							get: function () {
								return e;
							}
						}),
						(t.prototype.toString = function () {
							return this.name + ': ' + this.message;
						}),
						t
					);
				}
				(n.asPromise = r(79)),
					(n.base64 = r(137)),
					(n.EventEmitter = r(138)),
					(n.float = r(139)),
					(n.inquire = r(80)),
					(n.utf8 = r(140)),
					(n.pool = r(141)),
					(n.LongBits = r(142)),
					(n.global =
						(typeof window !== 'undefined' && window) ||
						(void 0 !== e && e) ||
						(typeof self !== 'undefined' && self) ||
						void 0),
					(n.emptyArray = Object.freeze ? Object.freeze([]) : []),
					(n.emptyObject = Object.freeze ? Object.freeze({}) : {}),
					(n.isNode = Boolean(n.global.process && n.global.process.versions && n.global.process.versions.node)),
					(n.isInteger =
						Number.isInteger ||
						function (e) {
							return typeof e === 'number' && isFinite(e) && Math.floor(e) === e;
						}),
					(n.isString = function (e) {
						return typeof e === 'string' || e instanceof String;
					}),
					(n.isObject = function (e) {
						return e && o(e) === 'object';
					}),
					(n.isset = n.isSet =
						function (e, t) {
							const r = e[t];
							return (
								!(r == null || !e.hasOwnProperty(t)) &&
								(o(r) !== 'object' || (Array.isArray(r) ? r.length : Object.keys(r).length) > 0)
							);
						}),
					(n.Buffer = (function () {
						try {
							const e = n.inquire('buffer').Buffer;
							return e.prototype.utf8Write ? e : null;
						} catch (e) {
							return null;
						}
					})()),
					(n._Buffer_from = null),
					(n._Buffer_allocUnsafe = null),
					(n.newBuffer = function (e) {
						return typeof e === 'number'
							? n.Buffer
								? n._Buffer_allocUnsafe(e)
								: new n.Array(e)
							: n.Buffer
							? n._Buffer_from(e)
							: typeof Uint8Array === 'undefined'
							? e
							: new Uint8Array(e);
					}),
					(n.Array = typeof Uint8Array !== 'undefined' ? Uint8Array : Array),
					(n.Long = (n.global.dcodeIO && n.global.dcodeIO.Long) || n.global.Long || n.inquire('long')),
					(n.key2Re = /^true|false|0|1$/),
					(n.key32Re = /^-?(?:0|[1-9][0-9]*)$/),
					(n.key64Re = /^(?:[\\x00-\\xff]{8}|-?(?:0|[1-9][0-9]*))$/),
					(n.longToHash = function (e) {
						return e ? n.LongBits.from(e).toHash() : n.LongBits.zeroHash;
					}),
					(n.longFromHash = function (e, t) {
						const r = n.LongBits.fromHash(e);
						return n.Long ? n.Long.fromBits(r.lo, r.hi, t) : r.toNumber(Boolean(t));
					}),
					(n.merge = i),
					(n.lcFirst = function (e) {
						return e.charAt(0).toLowerCase() + e.substring(1);
					}),
					(n.newError = s),
					(n.ProtocolError = s('ProtocolError')),
					(n.oneOfGetter = function (e) {
						for (var t = {}, r = 0; r < e.length; ++r) t[e[r]] = 1;
						return function () {
							for (let e = Object.keys(this), r = e.length - 1; r > -1; --r)
								if (t[e[r]] === 1 && void 0 !== this[e[r]] && this[e[r]] !== null) return e[r];
						};
					}),
					(n.oneOfSetter = function (e) {
						return function (t) {
							for (let r = 0; r < e.length; ++r) e[r] !== t && delete this[e[r]];
						};
					}),
					(n.toJSONOptions = { longs: String, enums: String, bytes: String, json: !0 }),
					(n._configure = function () {
						const e = n.Buffer;
						e
							? ((n._Buffer_from =
									(e.from !== Uint8Array.from && e.from) ||
									function (t, r) {
										return new e(t, r);
									}),
							  (n._Buffer_allocUnsafe =
									e.allocUnsafe ||
									function (t) {
										return new e(t);
									}))
							: (n._Buffer_from = n._Buffer_allocUnsafe = null);
					});
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(17);
					const n = {};
					let i = !1;
					const s = t.chrome && t.chrome.app && t.chrome.app.runtime;
				e.exports = {
					attachEvent: function (e, r) {
						void 0 !== t.addEventListener
							? t.addEventListener(e, r, !1)
							: t.document && t.attachEvent && (t.document.attachEvent('on' + e, r), t.attachEvent('on' + e, r));
					},
					detachEvent: function (e, r) {
						void 0 !== t.addEventListener
							? t.removeEventListener(e, r, !1)
							: t.document && t.detachEvent && (t.document.detachEvent('on' + e, r), t.detachEvent('on' + e, r));
					},
					unloadAdd: function (e) {
						if (s) return null;
						const t = o.string(8);
						return (n[t] = e), i && setTimeout(this.triggerUnloadCallbacks, 0), t;
					},
					unloadDel: function (e) {
						e in n && delete n[e];
					},
					triggerUnloadCallbacks: function () {
						for (const e in n) n[e](), delete n[e];
					}
				};
				s ||
					e.exports.attachEvent('unload', function () {
						i || ((i = !0), e.exports.triggerUnloadCallbacks());
					});
			}).call(this, r(3));
		},
		,
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			e.exports = l;
			const n = r(19);
			((l.prototype = Object.create(n.prototype)).constructor = l).className = 'Field';
			let i;
				const s = r(11);
				const a = r(20);
				const u = r(4);
				const c = /^required|optional|repeated$/;
			function l(e, t, r, o, i, s, l) {
				if (
					(u.isObject(o) ? ((l = i), (s = o), (o = i = void 0)) : u.isObject(i) && ((l = s), (s = i), (i = void 0)),
					n.call(this, e, s),
					!u.isInteger(t) || t < 0)
				)
					throw TypeError('id must be a non-negative integer');
				if (!u.isString(r)) throw TypeError('type must be a string');
				if (void 0 !== o && !c.test((o = o.toString().toLowerCase()))) throw TypeError('rule must be a string rule');
				if (void 0 !== i && !u.isString(i)) throw TypeError('extend must be a string');
				(this.rule = o && o !== 'optional' ? o : void 0),
					(this.type = r),
					(this.id = t),
					(this.extend = i || void 0),
					(this.required = o === 'required'),
					(this.optional = !this.required),
					(this.repeated = o === 'repeated'),
					(this.map = !1),
					(this.message = null),
					(this.partOf = null),
					(this.typeDefault = null),
					(this.defaultValue = null),
					(this.long = !!u.Long && void 0 !== a.long[r]),
					(this.bytes = r === 'bytes'),
					(this.resolvedType = null),
					(this.extensionField = null),
					(this.declaringField = null),
					(this._packed = null),
					(this.comment = l);
			}
			(l.fromJSON = function (e, t) {
				return new l(e, t.id, t.type, t.rule, t.extend, t.options, t.comment);
			}),
				Object.defineProperty(l.prototype, 'packed', {
					get: function () {
						return this._packed === null && (this._packed = !1 !== this.getOption('packed')), this._packed;
					}
				}),
				(l.prototype.setOption = function (e, t, r) {
					return e === 'packed' && (this._packed = null), n.prototype.setOption.call(this, e, t, r);
				}),
				(l.prototype.toJSON = function (e) {
					const t = !!e && Boolean(e.keepComments);
					return u.toObject([
						'rule',
						(this.rule !== 'optional' && this.rule) || void 0,
						'type',
						this.type,
						'id',
						this.id,
						'extend',
						this.extend,
						'options',
						this.options,
						'comment',
						t ? this.comment : void 0
					]);
				}),
				(l.prototype.resolve = function () {
					if (this.resolved) return this;
					if (
						(void 0 === (this.typeDefault = a.defaults[this.type]) &&
							((this.resolvedType = (this.declaringField ? this.declaringField.parent : this.parent).lookupTypeOrEnum(
								this.type
							)),
							this.resolvedType instanceof i
								? (this.typeDefault = null)
								: (this.typeDefault = this.resolvedType.values[Object.keys(this.resolvedType.values)[0]])),
						this.options &&
							this.options.default != null &&
							((this.typeDefault = this.options.default),
							this.resolvedType instanceof s &&
								typeof this.typeDefault === 'string' &&
								(this.typeDefault = this.resolvedType.values[this.typeDefault])),
						this.options &&
							((!0 !== this.options.packed &&
								(void 0 === this.options.packed || !this.resolvedType || this.resolvedType instanceof s)) ||
								delete this.options.packed,
							Object.keys(this.options).length || (this.options = void 0)),
						this.long)
					)
						(this.typeDefault = u.Long.fromNumber(this.typeDefault, this.type.charAt(0) === 'u')),
							Object.freeze && Object.freeze(this.typeDefault);
					else if (this.bytes && typeof this.typeDefault === 'string') {
						let e;
						u.base64.test(this.typeDefault)
							? u.base64.decode(this.typeDefault, (e = u.newBuffer(u.base64.length(this.typeDefault))), 0)
							: u.utf8.write(this.typeDefault, (e = u.newBuffer(u.utf8.length(this.typeDefault))), 0),
							(this.typeDefault = e);
					}
					return (
						this.map
							? (this.defaultValue = u.emptyObject)
							: this.repeated
							? (this.defaultValue = u.emptyArray)
							: (this.defaultValue = this.typeDefault),
						this.parent instanceof i && (this.parent.ctor.prototype[this.name] = this.defaultValue),
						n.prototype.resolve.call(this)
					);
				}),
				(l.d = function (e, t, r, n) {
					return (
						typeof t === 'function'
							? (t = u.decorateType(t).name)
							: t && o(t) === 'object' && (t = u.decorateEnum(t).name),
						function (o, i) {
							u.decorateType(o.constructor).add(new l(i, e, t, r, { default: n }));
						}
					);
				}),
				(l._configure = function (e) {
					i = e;
				});
		},
		function (e, t, r) {
			'use strict';
			const o = r(106);
			e.exports = {
				string: function (e) {
					for (var t = 'abcdefghijklmnopqrstuvwxyz012345'.length, r = o.randomBytes(e), n = [], i = 0; i < e; i++)
						n.push('abcdefghijklmnopqrstuvwxyz012345'.substr(r[i] % t, 1));
					return n.join('');
				},
				number: function (e) {
					return Math.floor(Math.random() * e);
				},
				numberString: function (e) {
					const t = ('' + (e - 1)).length;
					return (new Array(t + 1).join('0') + this.number(e)).slice(-t);
				}
			};
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(9);
				const i = r(67);
			function s(e, t, r, o) {
				i.call(
					this,
					e,
					t,
					(function (e) {
						return function (t, r, o) {
							const i = {};
							typeof r === 'string' && (i.headers = { 'Content-type': 'text/plain' });
							const s = n.addPath(t, '/xhr_send');
								let a = new e('POST', s, r, i);
							return (
								a.once('finish', function (e) {
									if (((a = null), e !== 200 && e !== 204)) return o(new Error('http status ' + e));
									o();
								}),
								function () {
									a.close(), (a = null);
									const e = new Error('Aborted');
									(e.code = 1e3), o(e);
								}
							);
						};
					})(o),
					r,
					o
				);
			}
			o(s, i), (e.exports = s);
		},
		function (e, t, r) {
			'use strict';
			(e.exports = i), (i.className = 'ReflectionObject');
			let o;
				const n = r(4);
			function i(e, t) {
				if (!n.isString(e)) throw TypeError('name must be a string');
				if (t && !n.isObject(t)) throw TypeError('options must be an object');
				(this.options = t),
					(this.name = e),
					(this.parent = null),
					(this.resolved = !1),
					(this.comment = null),
					(this.filename = null);
			}
			Object.defineProperties(i.prototype, {
				root: {
					get: function () {
						for (var e = this; e.parent !== null; ) e = e.parent;
						return e;
					}
				},
				fullName: {
					get: function () {
						for (var e = [this.name], t = this.parent; t; ) e.unshift(t.name), (t = t.parent);
						return e.join('.');
					}
				}
			}),
				(i.prototype.toJSON = function () {
					throw Error();
				}),
				(i.prototype.onAdd = function (e) {
					this.parent && this.parent !== e && this.parent.remove(this), (this.parent = e), (this.resolved = !1);
					const t = e.root;
					t instanceof o && t._handleAdd(this);
				}),
				(i.prototype.onRemove = function (e) {
					const t = e.root;
					t instanceof o && t._handleRemove(this), (this.parent = null), (this.resolved = !1);
				}),
				(i.prototype.resolve = function () {
					return this.resolved || (this.root instanceof o && (this.resolved = !0)), this;
				}),
				(i.prototype.getOption = function (e) {
					if (this.options) return this.options[e];
				}),
				(i.prototype.setOption = function (e, t, r) {
					return (
						(r && this.options && void 0 !== this.options[e]) || ((this.options || (this.options = {}))[e] = t), this
					);
				}),
				(i.prototype.setOptions = function (e, t) {
					if (e) for (let r = Object.keys(e), o = 0; o < r.length; ++o) this.setOption(r[o], e[r[o]], t);
					return this;
				}),
				(i.prototype.toString = function () {
					const e = this.constructor.className;
						const t = this.fullName;
					return t.length ? e + ' ' + t : e;
				}),
				(i._configure = function (e) {
					o = e;
				});
		},
		function (e, t, r) {
			'use strict';
			const o = t;
				const n = r(4);
				const i = [
					'double',
					'float',
					'int32',
					'uint32',
					'sint32',
					'fixed32',
					'sfixed32',
					'int64',
					'uint64',
					'sint64',
					'fixed64',
					'sfixed64',
					'bool',
					'string',
					'bytes'
				];
			function s(e, t) {
				let r = 0;
					const o = {};
				for (t |= 0; r < e.length; ) o[i[r + t]] = e[r++];
				return o;
			}
			(o.basic = s([1, 5, 0, 0, 0, 5, 5, 0, 0, 0, 1, 1, 0, 2, 2])),
				(o.defaults = s([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, !1, '', n.emptyArray, null])),
				(o.long = s([0, 0, 0, 1, 1], 7)),
				(o.mapKey = s([0, 0, 0, 5, 5, 0, 0, 0, 1, 1, 0, 2], 2)),
				(o.packed = s([1, 5, 0, 0, 0, 5, 5, 0, 0, 0, 1, 1, 0]));
		},
		,
		,
		,
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(68);
			function i(e, t, r) {
				n.call(this, e, t, r, { noCredentials: !0 });
			}
			o(i, n), (i.enabled = n.enabled), (e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				e.exports = {
					isOpera: function () {
						return t.navigator && /opera/i.test(t.navigator.userAgent);
					},
					isKonqueror: function () {
						return t.navigator && /konqueror/i.test(t.navigator.userAgent);
					},
					hasDomain: function () {
						if (!t.document) return !0;
						try {
							return !!t.document.domain;
						} catch (e) {
							return !1;
						}
					}
				};
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				function o(e) {
					return (o =
						typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
							? function (e) {
									return typeof e;
							  }
							: function (e) {
									return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
										? 'symbol'
										: typeof e;
							  })(e);
				}
				const n = r(14);
					const i = r(12);
					const s = r(25);
				(e.exports = {
					WPrefix: '_jp',
					currentWindowId: null,
					polluteGlobalNamespace: function () {
						e.exports.WPrefix in t || (t[e.exports.WPrefix] = {});
					},
					postMessage: function (r, o) {
						t.parent !== t &&
							t.parent.postMessage(i.stringify({ windowId: e.exports.currentWindowId, type: r, data: o || '' }), '*');
					},
					createIframe: function (e, r) {
						let o;
							let i;
							let s = t.document.createElement('iframe');
							const a = function () {
								clearTimeout(o);
								try {
									s.onload = null;
								} catch (e) {}
								s.onerror = null;
							};
							const u = function () {
								s &&
									(a(),
									setTimeout(function () {
										s && s.parentNode.removeChild(s), (s = null);
									}, 0),
									n.unloadDel(i));
							};
							const c = function (e) {
								s && (u(), r(e));
							};
						return (
							(s.src = e),
							(s.style.display = 'none'),
							(s.style.position = 'absolute'),
							(s.onerror = function () {
								c('onerror');
							}),
							(s.onload = function () {
								clearTimeout(o),
									(o = setTimeout(function () {
										c('onload timeout');
									}, 2e3));
							}),
							t.document.body.appendChild(s),
							(o = setTimeout(function () {
								c('timeout');
							}, 15e3)),
							(i = n.unloadAdd(u)),
							{
								post: function (e, t) {
									setTimeout(function () {
										try {
											s && s.contentWindow && s.contentWindow.postMessage(e, t);
										} catch (e) {}
									}, 0);
								},
								cleanup: u,
								loaded: a
							}
						);
					},
					createHtmlfile: function (r, o) {
						let i;
							let s;
							let a;
							const u = ['Active'].concat('Object').join('X');
							let c = new t[u]('htmlfile');
							const l = function () {
								clearTimeout(i), (a.onerror = null);
							};
							const p = function () {
								c && (l(), n.unloadDel(s), a.parentNode.removeChild(a), (a = c = null), CollectGarbage());
							};
							const f = function (e) {
								c && (p(), o(e));
							};
						c.open(),
							c.write('<html><script>document.domain="' + t.document.domain + '";</script></html>'),
							c.close(),
							(c.parentWindow[e.exports.WPrefix] = t[e.exports.WPrefix]);
						const h = c.createElement('div');
						return (
							c.body.appendChild(h),
							(a = c.createElement('iframe')),
							h.appendChild(a),
							(a.src = r),
							(a.onerror = function () {
								f('onerror');
							}),
							(i = setTimeout(function () {
								f('timeout');
							}, 15e3)),
							(s = n.unloadAdd(p)),
							{
								post: function (e, t) {
									try {
										setTimeout(function () {
											a && a.contentWindow && a.contentWindow.postMessage(e, t);
										}, 0);
									} catch (e) {}
								},
								cleanup: p,
								loaded: l
							}
						);
					}
				}),
					(e.exports.iframeEnabled = !1),
					t.document &&
						(e.exports.iframeEnabled =
							(typeof t.postMessage === 'function' || o(t.postMessage) === 'object') && !s.isKonqueror());
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			e.exports = l;
			const o = r(19);
			((l.prototype = Object.create(o.prototype)).constructor = l).className = 'Namespace';
			let n;
				let i;
				let s;
				const a = r(16);
				const u = r(4);
			function c(e, t) {
				if (e && e.length) {
					for (var r = {}, o = 0; o < e.length; ++o) r[e[o].name] = e[o].toJSON(t);
					return r;
				}
			}
			function l(e, t) {
				o.call(this, e, t), (this.nested = void 0), (this._nestedArray = null);
			}
			function p(e) {
				return (e._nestedArray = null), e;
			}
			(l.fromJSON = function (e, t) {
				return new l(e, t.options).addJSON(t.nested);
			}),
				(l.arrayToJSON = c),
				(l.isReservedId = function (e, t) {
					if (e)
						for (let r = 0; r < e.length; ++r) if (typeof e[r] !== 'string' && e[r][0] <= t && e[r][1] >= t) return !0;
					return !1;
				}),
				(l.isReservedName = function (e, t) {
					if (e) for (let r = 0; r < e.length; ++r) if (e[r] === t) return !0;
					return !1;
				}),
				Object.defineProperty(l.prototype, 'nestedArray', {
					get: function () {
						return this._nestedArray || (this._nestedArray = u.toArray(this.nested));
					}
				}),
				(l.prototype.toJSON = function (e) {
					return u.toObject(['options', this.options, 'nested', c(this.nestedArray, e)]);
				}),
				(l.prototype.addJSON = function (e) {
					if (e)
						for (var t, r = Object.keys(e), o = 0; o < r.length; ++o)
							(t = e[r[o]]),
								this.add(
									(void 0 !== t.fields
										? n.fromJSON
										: void 0 !== t.values
										? s.fromJSON
										: void 0 !== t.methods
										? i.fromJSON
										: void 0 !== t.id
										? a.fromJSON
										: l.fromJSON)(r[o], t)
								);
					return this;
				}),
				(l.prototype.get = function (e) {
					return (this.nested && this.nested[e]) || null;
				}),
				(l.prototype.getEnum = function (e) {
					if (this.nested && this.nested[e] instanceof s) return this.nested[e].values;
					throw Error('no such enum: ' + e);
				}),
				(l.prototype.add = function (e) {
					if (
						!(
							(e instanceof a && void 0 !== e.extend) ||
							e instanceof n ||
							e instanceof s ||
							e instanceof i ||
							e instanceof l
						)
					)
						throw TypeError('object must be a valid nested object');
					if (this.nested) {
						const t = this.get(e.name);
						if (t) {
							if (!(t instanceof l && e instanceof l) || t instanceof n || t instanceof i)
								throw Error("duplicate name '" + e.name + "' in " + this);
							for (let r = t.nestedArray, o = 0; o < r.length; ++o) e.add(r[o]);
							this.remove(t), this.nested || (this.nested = {}), e.setOptions(t.options, !0);
						}
					} else this.nested = {};
					return (this.nested[e.name] = e), e.onAdd(this), p(this);
				}),
				(l.prototype.remove = function (e) {
					if (!(e instanceof o)) throw TypeError('object must be a ReflectionObject');
					if (e.parent !== this) throw Error(e + ' is not a member of ' + this);
					return (
						delete this.nested[e.name],
						Object.keys(this.nested).length || (this.nested = void 0),
						e.onRemove(this),
						p(this)
					);
				}),
				(l.prototype.define = function (e, t) {
					if (u.isString(e)) e = e.split('.');
					else if (!Array.isArray(e)) throw TypeError('illegal path');
					if (e && e.length && e[0] === '') throw Error('path must be relative');
					for (var r = this; e.length > 0; ) {
						const o = e.shift();
						if (r.nested && r.nested[o]) {
							if (!((r = r.nested[o]) instanceof l)) throw Error('path conflicts with non-namespace objects');
						} else r.add((r = new l(o)));
					}
					return t && r.addJSON(t), r;
				}),
				(l.prototype.resolveAll = function () {
					for (let e = this.nestedArray, t = 0; t < e.length; )
						e[t] instanceof l ? e[t++].resolveAll() : e[t++].resolve();
					return this.resolve();
				}),
				(l.prototype.lookup = function (e, t, r) {
					if (
						(typeof t === 'boolean' ? ((r = t), (t = void 0)) : t && !Array.isArray(t) && (t = [t]),
						u.isString(e) && e.length)
					) {
						if (e === '.') return this.root;
						e = e.split('.');
					} else if (!e.length) return this;
					if (e[0] === '') return this.root.lookup(e.slice(1), t);
					let o = this.get(e[0]);
					if (o) {
						if (e.length === 1) {
							if (!t || t.indexOf(o.constructor) > -1) return o;
						} else if (o instanceof l && (o = o.lookup(e.slice(1), t, !0))) return o;
					} else
						for (let n = 0; n < this.nestedArray.length; ++n)
							if (this._nestedArray[n] instanceof l && (o = this._nestedArray[n].lookup(e, t, !0))) return o;
					return this.parent === null || r ? null : this.parent.lookup(e, t);
				}),
				(l.prototype.lookupType = function (e) {
					const t = this.lookup(e, [n]);
					if (!t) throw Error('no such type: ' + e);
					return t;
				}),
				(l.prototype.lookupEnum = function (e) {
					const t = this.lookup(e, [s]);
					if (!t) throw Error("no such Enum '" + e + "' in " + this);
					return t;
				}),
				(l.prototype.lookupTypeOrEnum = function (e) {
					const t = this.lookup(e, [n, s]);
					if (!t) throw Error("no such Type or Enum '" + e + "' in " + this);
					return t;
				}),
				(l.prototype.lookupService = function (e) {
					const t = this.lookup(e, [i]);
					if (!t) throw Error("no such Service '" + e + "' in " + this);
					return t;
				}),
				(l._configure = function (e, t, r) {
					(n = e), (i = t), (s = r);
				});
		},
		function (e, t, r) {
			'use strict';
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const o = function e(t, r) {
				return !this instanceof e
					? new e(t)
					: ((this._msg = {}),
					  typeof e[t] === 'function' && ((e[t].prototype.setGroup = this.setGroup), (this._msg = new e[t](r))),
					  this._msg);
			};
			(o.prototype.setGroup = function (e) {
				this.body.group = e;
			}),
				(o.prototype._utils = {}),
				((o.read = function (e) {
					(this.id = e), (this.type = 'read');
				}).prototype.set = function (e) {
					(this.body = {
						id: this.id,
						type: this.type,
						ackId: e.id,
						to: e.to,
						msgConfig: e.msgConfig,
						ackContent: e.ackContent
					}),
						!e.msgConfig && delete this.body.msgConfig,
						!e.ackContent && delete this.body.ackContent;
				}),
				((o.delivery = function (e) {
					(this.id = e), (this.type = 'delivery');
				}).prototype.set = function (e) {
					this.body = { id: this.id, type: this.type, ackId: e.ackId, to: e.to };
				}),
				((o.txt = function (e) {
					(this.id = e), (this.type = 'txt'), (this.body = {});
				}).prototype.set = function (e) {
					(this.value = e.msg),
						(this.body = {
							id: this.id,
							to: e.to,
							from: e.from,
							msg: this.value,
							type: this.type,
							roomType: e.roomType,
							ext: e.ext || {},
							success: e.success,
							fail: e.fail,
							msgConfig: e.msgConfig
						}),
						!e.msgConfig && delete this.body.msgConfig,
						!e.roomType && delete this.body.roomType;
				}),
				((o.cmd = function (e) {
					(this.id = e), (this.type = 'cmd'), (this.body = {});
				}).prototype.set = function (e) {
					(this.value = ''),
						(this.body = {
							id: this.id,
							to: e.to,
							from: e.from,
							action: e.action,
							msg: this.value,
							type: this.type,
							roomType: e.roomType,
							ext: e.ext || {},
							success: e.success
						}),
						!e.roomType && delete this.body.roomType;
				}),
				((o.custom = function (e) {
					(this.id = e), (this.type = 'custom'), (this.body = {});
				}).prototype.set = function (e) {
					(this.body = {
						id: this.id,
						to: e.to,
						from: e.from,
						params: e.params,
						customEvent: e.customEvent,
						customExts: e.customExts,
						type: this.type,
						roomType: e.roomType,
						ext: e.ext || {},
						success: e.success
					}),
						!e.roomType && delete this.body.roomType;
				}),
				((o.location = function (e) {
					(this.id = e), (this.type = 'loc'), (this.body = {});
				}).prototype.set = function (e) {
					this.body = {
						id: this.id,
						to: e.to,
						type: this.type,
						roomType: e.roomType,
						addr: e.addr,
						lat: e.lat,
						lng: e.lng,
						ext: e.ext || {}
					};
				}),
				((o.img = function (e) {
					(this.id = e), (this.type = 'img'), (this.body = {});
				}).prototype.set = function (e) {
					(e.file = e.file || o.prototype._utils.getFileUrl(e.fileInputId)),
						(this.value = e.file),
						(this.body = {
							id: this.id,
							file: this.value,
							apiUrl: e.apiUrl,
							to: e.to,
							from: e.from,
							type: this.type,
							ext: e.ext || {},
							roomType: e.roomType,
							onFileUploadError: e.onFileUploadError,
							onFileUploadComplete: e.onFileUploadComplete,
							success: e.success,
							fail: e.fail,
							flashUpload: e.flashUpload,
							width: e.width,
							height: e.height,
							body: e.body,
							uploadError: e.uploadError,
							uploadComplete: e.uploadComplete
						}),
						!e.roomType && delete this.body.roomType;
				}),
				((o.audio = function (e) {
					(this.id = e), (this.type = 'audio'), (this.body = {});
				}).prototype.set = function (e) {
					(e.file = e.file || o.prototype._utils.getFileUrl(e.fileInputId)),
						(this.value = e.file),
						(this.filename = e.filename || this.value.filename),
						(this.body = {
							id: this.id,
							file: this.value,
							filename: this.filename,
							apiUrl: e.apiUrl,
							to: e.to,
							from: e.from,
							type: this.type,
							ext: e.ext || {},
							length: e.length || 0,
							roomType: e.roomType,
							file_length: e.file_length,
							onFileUploadError: e.onFileUploadError,
							onFileUploadComplete: e.onFileUploadComplete,
							success: e.success,
							fail: e.fail,
							flashUpload: e.flashUpload,
							body: e.body
						}),
						!e.roomType && delete this.body.roomType;
				}),
				((o.file = function (e) {
					(this.id = e), (this.type = 'file'), (this.body = {});
				}).prototype.set = function (e) {
					(e.file = e.file || o.prototype._utils.getFileUrl(e.fileInputId)),
						(this.value = e.file),
						(this.filename = e.filename || this.value.filename),
						(this.body = {
							id: this.id,
							file: this.value,
							filename: this.filename,
							apiUrl: e.apiUrl,
							to: e.to,
							from: e.from,
							type: this.type,
							ext: e.ext || {},
							roomType: e.roomType,
							onFileUploadError: e.onFileUploadError,
							onFileUploadComplete: e.onFileUploadComplete,
							success: e.success,
							fail: e.fail,
							flashUpload: e.flashUpload,
							body: e.body
						}),
						!e.roomType && delete this.body.roomType;
				}),
				((o.video = function (e) {
					(this.id = e), (this.type = 'video'), (this.body = {});
				}).prototype.set = function (e) {
					(e.file = e.file || o.prototype._utils.getFileUrl(e.fileInputId)),
						(this.value = e.file),
						(this.filename = e.filename || this.value.filename),
						(this.body = {
							id: this.id,
							file: this.value,
							filename: this.filename,
							apiUrl: e.apiUrl,
							to: e.to,
							from: e.from,
							type: this.type,
							ext: e.ext || {},
							length: e.length || 0,
							roomType: e.roomType,
							file_length: e.file_length,
							onFileUploadError: e.onFileUploadError,
							onFileUploadComplete: e.onFileUploadComplete,
							success: e.success,
							fail: e.fail,
							flashUpload: e.flashUpload,
							body: e.body
						}),
						!e.roomType && delete this.body.roomType;
				});
			const n = o;
			t.default = n;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			let n;
				const i = o(r(6));
			function s(e) {
				if (e && (0, i.default)(e) == 'object') {
					const t = [];
						const r = this.context.root.lookup('easemob.pb.KeyValue');
						const o = [];
					for (const n in e) {
						const s = r.decode(t);
						(s.key = n),
							(0, i.default)(e[n]) == 'object'
								? ((s.type = 8), (s.stringValue = JSON.stringify(e[n])))
								: typeof e[n] === 'string'
								? ((s.type = 7), (s.stringValue = e[n]))
								: typeof e[n] === 'boolean'
								? ((s.type = 1), (s.varintValue = e[n]))
								: Number.isInteger(e[n])
								? ((s.type = 2), (s.varintValue = e[n]))
								: ((s.type = 6), (s.doubleValue = e[n])),
							o.push(s);
					}
					return o;
				}
			}
			const a = function (e, t) {
					t.isDebug && console.log('上行消息：', e);
					const r = [];
						const o = t.context.root.lookup('easemob.pb.MessageBody.Content').decode(r);
					t.isDebug && console.log('上行contentMessage：', o);
					const n = t.context.root.lookup('easemob.pb.KeyValue');
						const a = [];
					switch (e.type) {
						case 'txt':
							(o.type = 0), (o.text = e.msg);
							break;
						case 'img':
							(o.type = 1),
								(o.displayName = e.body.filename),
								(o.remotePath = e.body.url),
								(o.secretKey = e.body.secret),
								(o.fileLength = e.body.file_length),
								(o.size = e.body.size),
								(o.thumbnailDisplayName = e.body.filename);
							break;
						case 'video':
							(o.type = 2),
								(o.displayName = e.body.filename),
								(o.remotePath = e.body.url),
								(o.secretKey = e.body.secret),
								(o.fileLength = e.body.file_length),
								(o.duration = e.body.length),
								(o.thumbnailDisplayName = e.body.filename);
							break;
						case 'loc':
							(o.type = 3), (o.latitude = e.lat), (o.longitude = e.lng), (o.address = e.addr), (o.latitude = e.lat);
							break;
						case 'audio':
							(o.type = 4),
								(o.displayName = e.body.filename),
								(o.remotePath = e.body.url),
								(o.secretKey = e.body.secret),
								(o.fileLength = e.body.file_length),
								(o.duration = e.body.length),
								(o.size = e.body.size),
								(o.thumbnailDisplayName = e.body.filename);
							break;
						case 'file':
							(o.type = 5),
								(o.displayName = e.body.filename),
								(o.remotePath = e.body.url),
								(o.secretKey = e.body.secret),
								(o.fileLength = e.body.file_length),
								(o.size = e.body.size),
								(o.thumbnailDisplayName = e.body.filename);
							break;
						case 'cmd':
							(o.type = 6), (o.action = e.action);
							break;
						case 'custom':
							(o.type = 7),
								(o.params = s.call(t, e.params)),
								(o.customEvent = e.customEvent),
								(o.customExts = s.call(t, e.customExts));
					}
					if (e.ext)
						for (const u in e.ext) {
							const c = n.decode(r);
							(c.key = u),
								(0, i.default)(e.ext[u]) == 'object'
									? ((c.type = 8), (c.stringValue = JSON.stringify(e.ext[u])))
									: typeof e.ext[u] === 'string'
									? ((c.type = 7), (c.stringValue = e.ext[u]))
									: typeof e.ext[u] === 'boolean'
									? ((c.type = 1), (c.varintValue = e.ext[u]))
									: Number.isInteger(e.ext[u])
									? ((c.type = 2), (c.varintValue = e.ext[u]))
									: ((c.type = 6), (c.doubleValue = e.ext[u])),
								a.push(c);
						}
					const l = t.context.root.lookup('easemob.pb.MessageBody');
						let p = l.decode(r);
					t.isDebug && console.log('上行messageBody：', p),
						e.type === 'recall'
							? ((p.type = 6),
							  (p.from = { name: t.context.jid.name }),
							  (p.to = { name: e.to }),
							  (p.ackMessageId = e.ackId))
							: e.type === 'delivery'
							? ((p.type = 5),
							  (p.from = { name: t.context.jid.name }),
							  (p.to = { name: e.to }),
							  (p.ackMessageId = e.ackId))
							: e.type === 'read'
							? ((p.type = 4),
							  (p.from = { name: t.context.jid.name }),
							  (p.to = { name: e.to }),
							  (p.ackMessageId = e.ackId),
							  e.msgConfig &&
									e.group === 'groupchat' &&
									!e.roomType &&
									((p.msgConfig = e.msgConfig), (p.ackContent = e.ackContent)))
							: e.group || e.roomType
							? e.group !== 'groupchat' || e.roomType
								? e.group === 'groupchat' &&
								  e.roomType &&
								  ((p.type = 3), (p.from = { name: t.context.jid.name }), (p.to = { name: e.to }))
								: ((p.type = 2),
								  (p.from = { name: t.context.jid.name }),
								  (p.to = { name: e.to }),
								  e.msgConfig && (p.msgConfig = e.msgConfig))
							: ((p.type = 1), (p.from = { name: t.context.jid.name }), (p.to = { name: e.to })),
						(p.contents = [o]),
						(p.ext = a),
						(p = l.encode(p).finish());
					const f = t.context.root.lookup('easemob.pb.Meta').decode(r);
					if (((f.id = e.id), e.type === 'recall')) {
						f.from = t.context.jid;
						var h = 'easemob.com';
						(e.group !== 'groupchat' && e.group !== 'chatroom') || (h = 'conference.easemob.com'),
							(f.to = { appKey: t.appKey, name: e.to, domain: h });
					} else if (e.type === 'delivery')
						(f.from = t.context.jid), (f.to = { appKey: t.appKey, name: e.to, domain: 'easemob.com' });
					else if (e.type === 'read') {
						f.from = t.context.jid;
						h = 'easemob.com';
						e.group === 'groupchat' && (h = 'conference.easemob.com'),
							(f.to = { appKey: t.appKey, name: e.to, domain: h });
					} else
						e.group || e.roomType
							? e.group !== 'groupchat' || e.roomType
								? e.group === 'groupchat' &&
								  e.roomType &&
								  ((f.from = { appKey: t.appKey, name: t.user, domain: 'conference.easemob.com' }),
								  (f.to = { appKey: t.appKey, name: e.to, domain: 'conference.easemob.com' }))
								: ((f.from = { appKey: t.appKey, name: t.user, domain: 'conference.easemob.com' }),
								  (f.to = { appKey: t.appKey, name: e.to, domain: 'conference.easemob.com' }))
							: ((f.from = t.context.jid), (f.to = { appKey: t.appKey, name: e.to, domain: 'easemob.com' }));
					(f.ns = 1), (f.payload = p), t.isDebug && console.log('上行MetaMessage：', f);
					const d = t.context.root.lookup('easemob.pb.CommSyncUL');
						let y = d.decode(r);
					(y.meta = f), t.isDebug && console.log('上行commSyncULMessage：', y), (y = d.encode(y).finish());
					const m = t.context.root.lookup('easemob.pb.MSync');
						let g = m.decode(r);
					(g.version = t.version),
						(g.encryptType = t.encryptType),
						(g.command = 0),
						(g.guid = t.context.jid),
						(g.payload = y),
						t.isDebug && console.log('上行MSync：', g),
						(g = m.encode(g).finish()),
						t.sendMSync(g);
				};
				const u = function (e, t, r) {
					n = r;
					const o = t || this;
					if (((o.msg = e), !e.file)) return a(o.msg, t);
					if (o.msg.body && o.msg.body.url) return a(o.msg, t);
					const i = o.msg.onFileUploadComplete;
					(o.msg.onFileUploadComplete = function (e) {
						if (e.entities[0]['file-metadata']) {
							const r = e.entities[0]['file-metadata']['content-length'];
							(o.msg.filetype = e.entities[0]['file-metadata']['content-type']), r > 204800 && (o.msg.thumbnail = !0);
						}
						(o.msg.body = {
							type: o.msg.type || 'file',
							url: (t.isHttpDNS ? t.apiUrl + e.uri.substr(e.uri.indexOf('/', 9)) : e.uri) + '/' + e.entities[0].uuid,
							secret: e.entities[0]['share-secret'],
							filename: o.msg.file.filename || o.msg.filename,
							size: { width: o.msg.width || 0, height: o.msg.height || 0 },
							length: o.msg.length || 0,
							file_length: o.msg.ext.file_length || 0,
							filetype: o.msg.filetype || o.msg.file.filetype
						}),
							a(o.msg, t),
							i instanceof Function && i(e, o.msg.id);
					}),
						n.uploadFile.call(t, o.msg);
				};
			t.default = u;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const n = o(r(8));
				const i = o(r(29));
				const s = o(r(7));
				const a = o(r(28));
				const u = o(r(54));
				const c = (0, s.default)();
				const l = { 0: 'TEXT', 1: 'IMAGE', 2: 'VIDEO', 3: 'LOCATION', 4: 'VOICE', 5: 'FILE', 6: 'COMMAND', 7: 'CUSTOM' };
				const p = function (e, t, r) {
					if (e.delivery && t.from !== t.to) {
						const o = e.getUniqueId();
							const n = new a.default('delivery', o);
						n.set({ ackId: r, to: t.from }), (0, i.default)(n.body, e);
					}
				};
				const f = function (e) {
					if (e) {
						for (var t = e, r = {}, o = 0; o < t.length; o++)
							if (t[o].type == 8) r[t[o].key] = JSON.parse(t[o].stringValue);
							else if (t[o].type == 7) r[t[o].key] = t[o].stringValue;
							else if (t[o].type == 6) r[t[o].key] = t[o].doubleValue;
							else if (t[o].type == 5) r[t[o].key] = t[o].floatValue;
							else if (t[o].type == 1 || t[o].type == 2 || t[o].type == 3 || t[o].type == 4)
								if (t[o].type == 2) {
									const i = t[o].varintValue;
										const s = new n.default(i.low, i.high, i.unsigned).toString();
									r[t[o].key] = Number(s);
								} else r[t[o].key] = t[o].varintValue;
						return r;
					}
				};
				const h = function (e, t, r, o) {
					const i = r;
						const s = new n.default(e.timestamp.low, e.timestamp.high, e.timestamp.unsigned).toString();
						const a = i.context.root.lookup('easemob.pb.MessageBody').decode(e.payload);
						const h = new n.default(e.id.low, e.id.high, e.id.unsigned).toString();
						const d = a.ackMessageId
							? new n.default(a.ackMessageId.low, a.ackMessageId.high, a.ackMessageId.unsigned).toString()
							: '';
						let y = null;
					if ((r.isDebug && console.log('下行消息：', a), a.type === 1)) y = 'chat';
					else if (a.type === 2) y = 'groupchat';
					else if (a.type === 3) y = 'chatroom';
					else {
						if (a.type === 4)
							return (
								(y = 'read_ack'),
								a.msgConfig
									? void r.onReadMessage({
											mid: d,
											groupReadCount: a.ext[0] && JSON.parse(a.ext[0].stringValue),
											ackContent: a.ackContent
									  })
									: void r.onReadMessage({ mid: d })
							);
						if (a.type === 5) return (y = 'deliver_ack'), void r.onDeliverdMessage({ mid: d });
						if (a.type === 6) return (y = 'recall'), void r.onRecallMessage({ mid: d });
					}
					for (let m = 0; m < a.contents.length; m++) {
						let g = {};
							const v = t.errorCode > 0;
							const _ = t.errorCode;
							const b = t.reason;
							const E = a.contents[m];
							const O = a.from.name;
							const N = a.to.name;
							let T = {};
						a.ext && (T = f(a.ext));
						try {
							switch (E.type) {
								case 0:
									var S = a.contents[m].text;
									if (!I) var I = {};
									var w = u.default.parseTextMessage(S, I && I.Emoji);
									w.isemoji
										? (!(g = {
												id: h,
												type: y,
												contentsType: 'EMOJI',
												from: O,
												to: N,
												data: w.body,
												ext: T,
												time: s,
												msgConfig: a.msgConfig
										  }).delay && delete g.delay,
										  !g.msgConfig && delete a.msgConfig,
										  (g.error = v),
										  (g.errorText = b),
										  (g.errorCode = _),
										  !o && i.onEmojiMessage(g))
										: (!(g = {
												id: h,
												type: y,
												contentsType: l[E.type],
												from: O,
												to: N,
												data: E.text,
												ext: T,
												sourceMsg: E.text,
												time: s,
												msgConfig: a.msgConfig
										  }).msgConfig && delete a.msgConfig,
										  (g.error = v),
										  (g.errorText = b),
										  (g.errorCode = _),
										  !o && r.onTextMessage(g));
									break;
								case 1:
									if (E.size)
										var C = E.size.width || 0,
											R = E.size.height || 0;
									!(g = {
										id: h,
										type: y,
										contentsType: l[E.type],
										from: O,
										to: N,
										url:
											E.remotePath &&
											i.apiUrl + E.remotePath.substr(E.remotePath.indexOf('/', 9)) + '?em-redirect=true',
										secret: E.secretKey,
										filename: E.displayName,
										thumb: E.thumbnailRemotePath,
										thumb_secret: E.thumbnailSecretKey,
										file_length: E.fileLength || '',
										width: C,
										height: R,
										filetype: E.filetype || '',
										accessToken: r.token || '',
										ext: T,
										time: s,
										msgConfig: a.msgConfig
									}).delay && delete g.delay,
										!g.msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onPictureMessage(g);
									break;
								case 2:
									!(g = {
										id: h,
										type: y,
										contentsType: l[E.type],
										from: O,
										to: N,
										url:
											E.remotePath &&
											i.apiUrl + E.remotePath.substr(E.remotePath.indexOf('/', 9)) + '?em-redirect=true',
										secret: E.secretKey,
										filename: E.displayName,
										length: E.duration || '',
										file_length: E.fileLength || '',
										filetype: E.filetype || '',
										accessToken: r.token || '',
										ext: T,
										time: s,
										msgConfig: a.msgConfig
									}).delay && delete g.delay,
										!g.msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onVideoMessage(g);
									break;
								case 3:
									!(g = {
										id: h,
										type: y,
										contentsType: l[E.type],
										from: O,
										to: N,
										addr: E.address,
										lat: E.latitude,
										lng: E.longitude,
										ext: T,
										time: s,
										msgConfig: a.msgConfig
									}).delay && delete g.delay,
										!g.msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onLocationMessage(g);
									break;
								case 4:
									!(g = {
										id: h,
										type: y,
										contentsType: l[E.type],
										from: O,
										to: N,
										url:
											E.remotePath &&
											i.apiUrl + E.remotePath.substr(E.remotePath.indexOf('/', 9)) + '?em-redirect=true',
										secret: E.secretKey,
										filename: E.displayName,
										file_length: E.fileLength || '',
										accessToken: r.token || '',
										ext: T,
										length: E.duration,
										time: s,
										msgConfig: a.msgConfig
									}).delay && delete g.delay,
										!g.msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onAudioMessage(g);
									break;
								case 5:
									!(g = {
										id: h,
										type: y,
										contentsType: l[E.type],
										from: O,
										to: N,
										url:
											E.remotePath &&
											i.apiUrl + E.remotePath.substr(E.remotePath.indexOf('/', 9)) + '?em-redirect=true',
										secret: E.secretKey,
										filename: E.displayName,
										file_length: E.fileLength,
										accessToken: r.token || '',
										ext: T,
										time: s,
										msgConfig: a.msgConfig
									}).delay && delete g.delay,
										!g.msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onFileMessage(g);
									break;
								case 6:
									!(g = {
										id: h,
										contentsType: l[E.type],
										from: O,
										to: N,
										action: E.action,
										ext: T,
										time: s,
										msgConfig: a.msgConfig
									}).msgConfig && delete a.msgConfig,
										(g.error = v),
										(g.errorText = b),
										(g.errorCode = _),
										!o && r.onCmdMessage(g);
									break;
								case 7:
									var x = '';
										var A = '';
									a.contents[0].customExts && (x = f(a.contents[0].customExts)),
										a.contents[0].params && (A = f(a.contents[0].params)),
										(g = {
											id: h,
											contentsType: l[E.type],
											from: O,
											to: N,
											customEvent: E.customEvent,
											params: A,
											customExts: x,
											ext: T,
											time: s
										}),
										!o && r.onCustomMessage(g);
							}
						} catch (e) {
							r.onError({ type: c.WEBIM_CONNCTION_CALLBACK_INNER_ERROR, data: e });
						}
						if ((!o && a.type === 1 && r.delivery && p(r, g, h), o || r.delivery)) return (g.message_type = y), g;
					}
				};
			t.default = h;
		},
		,
		,
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(5).EventEmitter;
			function i(e, t) {
				n.call(this);
				const r = this;
				(this.bufferPosition = 0),
					(this.xo = new t('POST', e, null)),
					this.xo.on('chunk', this._chunkHandler.bind(this)),
					this.xo.once('finish', function (e, t) {
						r._chunkHandler(e, t), (r.xo = null);
						const o = e === 200 ? 'network' : 'permanent';
						r.emit('close', null, o), r._cleanup();
					});
			}
			o(i, n),
				(i.prototype._chunkHandler = function (e, t) {
					if (e === 200 && t)
						for (let r = -1; ; this.bufferPosition += r + 1) {
							const o = t.slice(this.bufferPosition);
							if ((r = o.indexOf('\n')) === -1) break;
							const n = o.slice(0, r);
							n && this.emit('message', n);
						}
				}),
				(i.prototype._cleanup = function () {
					this.removeAllListeners();
				}),
				(i.prototype.abort = function () {
					this.xo && (this.xo.close(), this.emit('close', null, 'user'), (this.xo = null)), this._cleanup();
				}),
				(e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(68);
			function i(e, t, r, o) {
				n.call(this, e, t, r, o);
			}
			o(i, n), (i.enabled = n.enabled && n.supportsCORS), (e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			!(function () {
				const e =
						o(t) === 'object' && t !== null && typeof t.nodeType !== 'number'
							? t
							: typeof self !== 'undefined'
							? self
							: $.global;
					const r = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
				function n(e) {
					this.message = e;
				}
				(n.prototype = new Error()),
					(n.prototype.name = 'InvalidCharacterError'),
					e.btoa ||
						(e.btoa = function (e) {
							for (
								var t, o, i = String(e), s = 0, a = r, u = '';
								i.charAt(0 | s) || ((a = '='), s % 1);
								u += a.charAt(63 & (t >> (8 - (s % 1) * 8)))
							) {
								if ((o = i.charCodeAt((s += 3 / 4))) > 255)
									throw new n(
										"'btoa' failed: The string to be encoded contains characters outside of the Latin1 range."
									);
								t = (t << 8) | o;
							}
							return u;
						}),
					e.atob ||
						(e.atob = function (e) {
							const t = String(e).replace(/[=]+$/, '');
							if (t.length % 4 == 1) throw new n("'atob' failed: The string to be decoded is not correctly encoded.");
							for (
								var o, i, s = 0, a = 0, u = '';
								(i = t.charAt(a++));
								~i && ((o = s % 4 ? 64 * o + i : i), s++ % 4)
									? (u += String.fromCharCode(255 & (o >> ((-2 * s) & 6))))
									: 0
							)
								i = r.indexOf(i);
							return u;
						});
			})();
		},
		function (e, t, r) {
			'use strict';
			e.exports = s;
			const o = r(19);
			((s.prototype = Object.create(o.prototype)).constructor = s).className = 'OneOf';
			const n = r(16);
				const i = r(4);
			function s(e, t, r, n) {
				if ((Array.isArray(t) || ((r = t), (t = void 0)), o.call(this, e, r), void 0 !== t && !Array.isArray(t)))
					throw TypeError('fieldNames must be an Array');
				(this.oneof = t || []), (this.fieldsArray = []), (this.comment = n);
			}
			function a(e) {
				if (e.parent)
					for (let t = 0; t < e.fieldsArray.length; ++t) e.fieldsArray[t].parent || e.parent.add(e.fieldsArray[t]);
			}
			(s.fromJSON = function (e, t) {
				return new s(e, t.oneof, t.options, t.comment);
			}),
				(s.prototype.toJSON = function (e) {
					const t = !!e && Boolean(e.keepComments);
					return i.toObject(['options', this.options, 'oneof', this.oneof, 'comment', t ? this.comment : void 0]);
				}),
				(s.prototype.add = function (e) {
					if (!(e instanceof n)) throw TypeError('field must be a Field');
					return (
						e.parent && e.parent !== this.parent && e.parent.remove(e),
						this.oneof.push(e.name),
						this.fieldsArray.push(e),
						(e.partOf = this),
						a(this),
						this
					);
				}),
				(s.prototype.remove = function (e) {
					if (!(e instanceof n)) throw TypeError('field must be a Field');
					let t = this.fieldsArray.indexOf(e);
					if (t < 0) throw Error(e + ' is not a member of ' + this);
					return (
						this.fieldsArray.splice(t, 1),
						(t = this.oneof.indexOf(e.name)) > -1 && this.oneof.splice(t, 1),
						(e.partOf = null),
						this
					);
				}),
				(s.prototype.onAdd = function (e) {
					o.prototype.onAdd.call(this, e);
					for (let t = 0; t < this.oneof.length; ++t) {
						const r = e.get(this.oneof[t]);
						r && !r.partOf && ((r.partOf = this), this.fieldsArray.push(r));
					}
					a(this);
				}),
				(s.prototype.onRemove = function (e) {
					for (var t, r = 0; r < this.fieldsArray.length; ++r) (t = this.fieldsArray[r]).parent && t.parent.remove(t);
					o.prototype.onRemove.call(this, e);
				}),
				(s.d = function () {
					for (var e = new Array(arguments.length), t = 0; t < arguments.length; ) e[t] = arguments[t++];
					return function (t, r) {
						i.decorateType(t.constructor).add(new s(r, e)),
							Object.defineProperty(t, r, { get: i.oneOfGetter(e), set: i.oneOfSetter(e) });
					};
				});
		},
		,
		,
		,
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(5).EventEmitter;
					const n = r(0);
					const i = r(14);
					const s = r(25);
					const a = r(9);
				function u(e, t, r) {
					const n = this;
					o.call(this),
						setTimeout(function () {
							n._start(e, t, r);
						}, 0);
				}
				n(u, o),
					(u.prototype._start = function (e, r, o) {
						const n = this;
							const s = new t.XDomainRequest();
						(r = a.addQuery(r, 't=' + +new Date())),
							(s.onerror = function () {
								n._error();
							}),
							(s.ontimeout = function () {
								n._error();
							}),
							(s.onprogress = function () {
								s.responseText, n.emit('chunk', 200, s.responseText);
							}),
							(s.onload = function () {
								n.emit('finish', 200, s.responseText), n._cleanup(!1);
							}),
							(this.xdr = s),
							(this.unloadRef = i.unloadAdd(function () {
								n._cleanup(!0);
							}));
						try {
							this.xdr.open(e, r), this.timeout && (this.xdr.timeout = this.timeout), this.xdr.send(o);
						} catch (e) {
							this._error();
						}
					}),
					(u.prototype._error = function () {
						this.emit('finish', 0, ''), this._cleanup(!1);
					}),
					(u.prototype._cleanup = function (e) {
						if (this.xdr) {
							if (
								(this.removeAllListeners(),
								i.unloadDel(this.unloadRef),
								(this.xdr.ontimeout = this.xdr.onerror = this.xdr.onprogress = this.xdr.onload = null),
								e)
							)
								try {
									this.xdr.abort();
								} catch (e) {}
							this.unloadRef = this.xdr = null;
						}
					}),
					(u.prototype.close = function () {
						this._cleanup(!0);
					}),
					(u.enabled = !(!t.XDomainRequest || !s.hasDomain())),
					(e.exports = u);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(0);
					const n = r(72);
					const i = r(42);
				e.exports = function (e) {
					function r(t, r) {
						n.call(this, e.transportName, t, r);
					}
					return (
						o(r, n),
						(r.enabled = function (r, o) {
							if (!t.document) return !1;
							const s = i.extend({}, o);
							return (s.sameOrigin = !0), e.enabled(s) && n.enabled();
						}),
						(r.transportName = 'iframe-' + e.transportName),
						(r.needBody = !0),
						(r.roundTrips = n.roundTrips + e.roundTrips - 1),
						(r.facadeTransport = e),
						r
					);
				};
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			e.exports = {
				isObject: function (e) {
					const t = o(e);
					return t === 'function' || (t === 'object' && !!e);
				},
				extend: function (e) {
					if (!this.isObject(e)) return e;
					for (var t, r, o = 1, n = arguments.length; o < n; o++)
						for (r in (t = arguments[o])) Object.prototype.hasOwnProperty.call(t, r) && (e[r] = t[r]);
					return e;
				}
			};
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				this.type = e;
			}
			(o.prototype.initEvent = function (e, t, r) {
				return (this.type = e), (this.bubbles = t), (this.cancelable = r), (this.timeStamp = +new Date()), this;
			}),
				(o.prototype.stopPropagation = function () {}),
				(o.prototype.preventDefault = function () {}),
				(o.CAPTURING_PHASE = 1),
				(o.AT_TARGET = 2),
				(o.BUBBLING_PHASE = 3),
				(e.exports = o);
		},
		function (e, t, r) {
			'use strict';
			e.exports = p;
			let o;
				const n = r(13);
				const i = n.LongBits;
				const s = n.base64;
				const a = n.utf8;
			function u(e, t, r) {
				(this.fn = e), (this.len = t), (this.next = void 0), (this.val = r);
			}
			function c() {}
			function l(e) {
				(this.head = e.head), (this.tail = e.tail), (this.len = e.len), (this.next = e.states);
			}
			function p() {
				(this.len = 0), (this.head = new u(c, 0, 0)), (this.tail = this.head), (this.states = null);
			}
			function f(e, t, r) {
				t[r] = 255 & e;
			}
			function h(e, t) {
				(this.len = e), (this.next = void 0), (this.val = t);
			}
			function d(e, t, r) {
				for (; e.hi; ) (t[r++] = (127 & e.lo) | 128), (e.lo = ((e.lo >>> 7) | (e.hi << 25)) >>> 0), (e.hi >>>= 7);
				for (; e.lo > 127; ) (t[r++] = (127 & e.lo) | 128), (e.lo = e.lo >>> 7);
				t[r++] = e.lo;
			}
			function y(e, t, r) {
				(t[r] = 255 & e), (t[r + 1] = (e >>> 8) & 255), (t[r + 2] = (e >>> 16) & 255), (t[r + 3] = e >>> 24);
			}
			(p.create = n.Buffer
				? function () {
						return (p.create = function () {
							return new o();
						})();
				  }
				: function () {
						return new p();
				  }),
				(p.alloc = function (e) {
					return new n.Array(e);
				}),
				n.Array !== Array && (p.alloc = n.pool(p.alloc, n.Array.prototype.subarray)),
				(p.prototype._push = function (e, t, r) {
					return (this.tail = this.tail.next = new u(e, t, r)), (this.len += t), this;
				}),
				(h.prototype = Object.create(u.prototype)),
				(h.prototype.fn = function (e, t, r) {
					for (; e > 127; ) (t[r++] = (127 & e) | 128), (e >>>= 7);
					t[r] = e;
				}),
				(p.prototype.uint32 = function (e) {
					return (
						(this.len += (this.tail = this.tail.next =
							new h((e >>>= 0) < 128 ? 1 : e < 16384 ? 2 : e < 2097152 ? 3 : e < 268435456 ? 4 : 5, e)).len),
						this
					);
				}),
				(p.prototype.int32 = function (e) {
					return e < 0 ? this._push(d, 10, i.fromNumber(e)) : this.uint32(e);
				}),
				(p.prototype.sint32 = function (e) {
					return this.uint32(((e << 1) ^ (e >> 31)) >>> 0);
				}),
				(p.prototype.uint64 = function (e) {
					const t = i.from(e);
					return this._push(d, t.length(), t);
				}),
				(p.prototype.int64 = p.prototype.uint64),
				(p.prototype.sint64 = function (e) {
					const t = i.from(e).zzEncode();
					return this._push(d, t.length(), t);
				}),
				(p.prototype.bool = function (e) {
					return this._push(f, 1, e ? 1 : 0);
				}),
				(p.prototype.fixed32 = function (e) {
					return this._push(y, 4, e >>> 0);
				}),
				(p.prototype.sfixed32 = p.prototype.fixed32),
				(p.prototype.fixed64 = function (e) {
					const t = i.from(e);
					return this._push(y, 4, t.lo)._push(y, 4, t.hi);
				}),
				(p.prototype.sfixed64 = p.prototype.fixed64),
				(p.prototype.float = function (e) {
					return this._push(n.float.writeFloatLE, 4, e);
				}),
				(p.prototype.double = function (e) {
					return this._push(n.float.writeDoubleLE, 8, e);
				});
			const m = n.Array.prototype.set
				? function (e, t, r) {
						t.set(e, r);
				  }
				: function (e, t, r) {
						for (let o = 0; o < e.length; ++o) t[r + o] = e[o];
				  };
			(p.prototype.bytes = function (e) {
				let t = e.length >>> 0;
				if (!t) return this._push(f, 1, 0);
				if (n.isString(e)) {
					const r = p.alloc((t = s.length(e)));
					s.decode(e, r, 0), (e = r);
				}
				return this.uint32(t)._push(m, t, e);
			}),
				(p.prototype.string = function (e) {
					const t = a.length(e);
					return t ? this.uint32(t)._push(a.write, t, e) : this._push(f, 1, 0);
				}),
				(p.prototype.fork = function () {
					return (this.states = new l(this)), (this.head = this.tail = new u(c, 0, 0)), (this.len = 0), this;
				}),
				(p.prototype.reset = function () {
					return (
						this.states
							? ((this.head = this.states.head),
							  (this.tail = this.states.tail),
							  (this.len = this.states.len),
							  (this.states = this.states.next))
							: ((this.head = this.tail = new u(c, 0, 0)), (this.len = 0)),
						this
					);
				}),
				(p.prototype.ldelim = function () {
					const e = this.head;
						const t = this.tail;
						const r = this.len;
					return this.reset().uint32(r), r && ((this.tail.next = e.next), (this.tail = t), (this.len += r)), this;
				}),
				(p.prototype.finish = function () {
					for (var e = this.head.next, t = this.constructor.alloc(this.len), r = 0; e; )
						e.fn(e.val, t, r), (r += e.len), (e = e.next);
					return t;
				}),
				(p._configure = function (e) {
					o = e;
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = u;
			let o;
				const n = r(13);
				const i = n.LongBits;
				const s = n.utf8;
			function a(e, t) {
				return RangeError('index out of range: ' + e.pos + ' + ' + (t || 1) + ' > ' + e.len);
			}
			function u(e) {
				(this.buf = e), (this.pos = 0), (this.len = e.length);
			}
			let c;
				const l =
					typeof Uint8Array !== 'undefined'
						? function (e) {
								if (e instanceof Uint8Array || Array.isArray(e)) return new u(e);
								throw Error('illegal buffer');
						  }
						: function (e) {
								if (Array.isArray(e)) return new u(e);
								throw Error('illegal buffer');
						  };
			function p() {
				const e = new i(0, 0);
					let t = 0;
				if (!(this.len - this.pos > 4)) {
					for (; t < 3; ++t) {
						if (this.pos >= this.len) throw a(this);
						if (((e.lo = (e.lo | ((127 & this.buf[this.pos]) << (7 * t))) >>> 0), this.buf[this.pos++] < 128)) return e;
					}
					return (e.lo = (e.lo | ((127 & this.buf[this.pos++]) << (7 * t))) >>> 0), e;
				}
				for (; t < 4; ++t)
					if (((e.lo = (e.lo | ((127 & this.buf[this.pos]) << (7 * t))) >>> 0), this.buf[this.pos++] < 128)) return e;
				if (
					((e.lo = (e.lo | ((127 & this.buf[this.pos]) << 28)) >>> 0),
					(e.hi = (e.hi | ((127 & this.buf[this.pos]) >> 4)) >>> 0),
					this.buf[this.pos++] < 128)
				)
					return e;
				if (((t = 0), this.len - this.pos > 4)) {
					for (; t < 5; ++t)
						if (((e.hi = (e.hi | ((127 & this.buf[this.pos]) << (7 * t + 3))) >>> 0), this.buf[this.pos++] < 128))
							return e;
				} else
					for (; t < 5; ++t) {
						if (this.pos >= this.len) throw a(this);
						if (((e.hi = (e.hi | ((127 & this.buf[this.pos]) << (7 * t + 3))) >>> 0), this.buf[this.pos++] < 128))
							return e;
					}
				throw Error('invalid varint encoding');
			}
			function f(e, t) {
				return (e[t - 4] | (e[t - 3] << 8) | (e[t - 2] << 16) | (e[t - 1] << 24)) >>> 0;
			}
			function h() {
				if (this.pos + 8 > this.len) throw a(this, 8);
				return new i(f(this.buf, (this.pos += 4)), f(this.buf, (this.pos += 4)));
			}
			(u.create = n.Buffer
				? function (e) {
						return (u.create = function (e) {
							return n.Buffer.isBuffer(e) ? new o(e) : l(e);
						})(e);
				  }
				: l),
				(u.prototype._slice = n.Array.prototype.subarray || n.Array.prototype.slice),
				(u.prototype.uint32 =
					((c = 4294967295),
					function () {
						if (((c = (127 & this.buf[this.pos]) >>> 0), this.buf[this.pos++] < 128)) return c;
						if (((c = (c | ((127 & this.buf[this.pos]) << 7)) >>> 0), this.buf[this.pos++] < 128)) return c;
						if (((c = (c | ((127 & this.buf[this.pos]) << 14)) >>> 0), this.buf[this.pos++] < 128)) return c;
						if (((c = (c | ((127 & this.buf[this.pos]) << 21)) >>> 0), this.buf[this.pos++] < 128)) return c;
						if (((c = (c | ((15 & this.buf[this.pos]) << 28)) >>> 0), this.buf[this.pos++] < 128)) return c;
						if ((this.pos += 5) > this.len) throw ((this.pos = this.len), a(this, 10));
						return c;
					})),
				(u.prototype.int32 = function () {
					return 0 | this.uint32();
				}),
				(u.prototype.sint32 = function () {
					const e = this.uint32();
					return ((e >>> 1) ^ -(1 & e)) | 0;
				}),
				(u.prototype.bool = function () {
					return this.uint32() !== 0;
				}),
				(u.prototype.fixed32 = function () {
					if (this.pos + 4 > this.len) throw a(this, 4);
					return f(this.buf, (this.pos += 4));
				}),
				(u.prototype.sfixed32 = function () {
					if (this.pos + 4 > this.len) throw a(this, 4);
					return 0 | f(this.buf, (this.pos += 4));
				}),
				(u.prototype.float = function () {
					if (this.pos + 4 > this.len) throw a(this, 4);
					const e = n.float.readFloatLE(this.buf, this.pos);
					return (this.pos += 4), e;
				}),
				(u.prototype.double = function () {
					if (this.pos + 8 > this.len) throw a(this, 4);
					const e = n.float.readDoubleLE(this.buf, this.pos);
					return (this.pos += 8), e;
				}),
				(u.prototype.bytes = function () {
					const e = this.uint32();
						const t = this.pos;
						const r = this.pos + e;
					if (r > this.len) throw a(this, e);
					return (
						(this.pos += e),
						Array.isArray(this.buf)
							? this.buf.slice(t, r)
							: t === r
							? new this.buf.constructor(0)
							: this._slice.call(this.buf, t, r)
					);
				}),
				(u.prototype.string = function () {
					const e = this.bytes();
					return s.read(e, 0, e.length);
				}),
				(u.prototype.skip = function (e) {
					if (typeof e === 'number') {
						if (this.pos + e > this.len) throw a(this, e);
						this.pos += e;
					} else
						do {
							if (this.pos >= this.len) throw a(this);
						} while (128 & this.buf[this.pos++]);
					return this;
				}),
				(u.prototype.skipType = function (e) {
					switch (e) {
						case 0:
							this.skip();
							break;
						case 1:
							this.skip(8);
							break;
						case 2:
							this.skip(this.uint32());
							break;
						case 3:
							for (; (e = 7 & this.uint32()) != 4; ) this.skipType(e);
							break;
						case 5:
							this.skip(4);
							break;
						default:
							throw Error('invalid wire type ' + e + ' at offset ' + this.pos);
					}
					return this;
				}),
				(u._configure = function (e) {
					o = e;
					const t = n.Long ? 'toLong' : 'toNumber';
					n.merge(u.prototype, {
						int64: function () {
							return p.call(this)[t](!1);
						},
						uint64: function () {
							return p.call(this)[t](!0);
						},
						sint64: function () {
							return p.call(this).zzDecode()[t](!1);
						},
						fixed64: function () {
							return h.call(this)[t](!0);
						},
						sfixed64: function () {
							return h.call(this)[t](!1);
						}
					});
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = v;
			const o = r(27);
			((v.prototype = Object.create(o.prototype)).constructor = v).className = 'Type';
			const n = r(11);
				const i = r(36);
				const s = r(16);
				const a = r(47);
				const u = r(48);
				const c = r(50);
				const l = r(45);
				const p = r(44);
				const f = r(4);
				const h = r(83);
				const d = r(84);
				const y = r(85);
				const m = r(86);
				const g = r(87);
			function v(e, t) {
				o.call(this, e, t),
					(this.fields = {}),
					(this.oneofs = void 0),
					(this.extensions = void 0),
					(this.reserved = void 0),
					(this.group = void 0),
					(this._fieldsById = null),
					(this._fieldsArray = null),
					(this._oneofsArray = null),
					(this._ctor = null);
			}
			function _(e) {
				return (
					(e._fieldsById = e._fieldsArray = e._oneofsArray = null), delete e.encode, delete e.decode, delete e.verify, e
				);
			}
			Object.defineProperties(v.prototype, {
				fieldsById: {
					get: function () {
						if (this._fieldsById) return this._fieldsById;
						this._fieldsById = {};
						for (let e = Object.keys(this.fields), t = 0; t < e.length; ++t) {
							const r = this.fields[e[t]];
								const o = r.id;
							if (this._fieldsById[o]) throw Error('duplicate id ' + o + ' in ' + this);
							this._fieldsById[o] = r;
						}
						return this._fieldsById;
					}
				},
				fieldsArray: {
					get: function () {
						return this._fieldsArray || (this._fieldsArray = f.toArray(this.fields));
					}
				},
				oneofsArray: {
					get: function () {
						return this._oneofsArray || (this._oneofsArray = f.toArray(this.oneofs));
					}
				},
				ctor: {
					get: function () {
						return this._ctor || (this.ctor = v.generateConstructor(this)());
					},
					set: function (e) {
						const t = e.prototype;
						t instanceof c || (((e.prototype = new c()).constructor = e), f.merge(e.prototype, t)),
							(e.$type = e.prototype.$type = this),
							f.merge(e, c, !0),
							(this._ctor = e);
						for (var r = 0; r < this.fieldsArray.length; ++r) this._fieldsArray[r].resolve();
						const o = {};
						for (r = 0; r < this.oneofsArray.length; ++r)
							o[this._oneofsArray[r].resolve().name] = {
								get: f.oneOfGetter(this._oneofsArray[r].oneof),
								set: f.oneOfSetter(this._oneofsArray[r].oneof)
							};
						r && Object.defineProperties(e.prototype, o);
					}
				}
			}),
				(v.generateConstructor = function (e) {
					for (var t, r = f.codegen(['p'], e.name), o = 0; o < e.fieldsArray.length; ++o)
						(t = e._fieldsArray[o]).map
							? r('this%s={}', f.safeProp(t.name))
							: t.repeated && r('this%s=[]', f.safeProp(t.name));
					return r('if(p)for(var ks=Object.keys(p),i=0;i<ks.length;++i)if(p[ks[i]]!=null)')('this[ks[i]]=p[ks[i]]');
				}),
				(v.fromJSON = function (e, t) {
					const r = new v(e, t.options);
					(r.extensions = t.extensions), (r.reserved = t.reserved);
					for (var c = Object.keys(t.fields), l = 0; l < c.length; ++l)
						r.add((void 0 !== t.fields[c[l]].keyType ? a.fromJSON : s.fromJSON)(c[l], t.fields[c[l]]));
					if (t.oneofs)
						for (c = Object.keys(t.oneofs), l = 0; l < c.length; ++l) r.add(i.fromJSON(c[l], t.oneofs[c[l]]));
					if (t.nested)
						for (c = Object.keys(t.nested), l = 0; l < c.length; ++l) {
							const p = t.nested[c[l]];
							r.add(
								(void 0 !== p.id
									? s.fromJSON
									: void 0 !== p.fields
									? v.fromJSON
									: void 0 !== p.values
									? n.fromJSON
									: void 0 !== p.methods
									? u.fromJSON
									: o.fromJSON)(c[l], p)
							);
						}
					return (
						t.extensions && t.extensions.length && (r.extensions = t.extensions),
						t.reserved && t.reserved.length && (r.reserved = t.reserved),
						t.group && (r.group = !0),
						t.comment && (r.comment = t.comment),
						r
					);
				}),
				(v.prototype.toJSON = function (e) {
					const t = o.prototype.toJSON.call(this, e);
						const r = !!e && Boolean(e.keepComments);
					return f.toObject([
						'options',
						(t && t.options) || void 0,
						'oneofs',
						o.arrayToJSON(this.oneofsArray, e),
						'fields',
						o.arrayToJSON(
							this.fieldsArray.filter(function (e) {
								return !e.declaringField;
							}),
							e
						) || {},
						'extensions',
						this.extensions && this.extensions.length ? this.extensions : void 0,
						'reserved',
						this.reserved && this.reserved.length ? this.reserved : void 0,
						'group',
						this.group || void 0,
						'nested',
						(t && t.nested) || void 0,
						'comment',
						r ? this.comment : void 0
					]);
				}),
				(v.prototype.resolveAll = function () {
					for (var e = this.fieldsArray, t = 0; t < e.length; ) e[t++].resolve();
					const r = this.oneofsArray;
					for (t = 0; t < r.length; ) r[t++].resolve();
					return o.prototype.resolveAll.call(this);
				}),
				(v.prototype.get = function (e) {
					return this.fields[e] || (this.oneofs && this.oneofs[e]) || (this.nested && this.nested[e]) || null;
				}),
				(v.prototype.add = function (e) {
					if (this.get(e.name)) throw Error("duplicate name '" + e.name + "' in " + this);
					if (e instanceof s && void 0 === e.extend) {
						if (this._fieldsById ? this._fieldsById[e.id] : this.fieldsById[e.id])
							throw Error('duplicate id ' + e.id + ' in ' + this);
						if (this.isReservedId(e.id)) throw Error('id ' + e.id + ' is reserved in ' + this);
						if (this.isReservedName(e.name)) throw Error("name '" + e.name + "' is reserved in " + this);
						return (
							e.parent && e.parent.remove(e), (this.fields[e.name] = e), (e.message = this), e.onAdd(this), _(this)
						);
					}
					return e instanceof i
						? (this.oneofs || (this.oneofs = {}), (this.oneofs[e.name] = e), e.onAdd(this), _(this))
						: o.prototype.add.call(this, e);
				}),
				(v.prototype.remove = function (e) {
					if (e instanceof s && void 0 === e.extend) {
						if (!this.fields || this.fields[e.name] !== e) throw Error(e + ' is not a member of ' + this);
						return delete this.fields[e.name], (e.parent = null), e.onRemove(this), _(this);
					}
					if (e instanceof i) {
						if (!this.oneofs || this.oneofs[e.name] !== e) throw Error(e + ' is not a member of ' + this);
						return delete this.oneofs[e.name], (e.parent = null), e.onRemove(this), _(this);
					}
					return o.prototype.remove.call(this, e);
				}),
				(v.prototype.isReservedId = function (e) {
					return o.isReservedId(this.reserved, e);
				}),
				(v.prototype.isReservedName = function (e) {
					return o.isReservedName(this.reserved, e);
				}),
				(v.prototype.create = function (e) {
					return new this.ctor(e);
				}),
				(v.prototype.setup = function () {
					for (var e = this.fullName, t = [], r = 0; r < this.fieldsArray.length; ++r)
						t.push(this._fieldsArray[r].resolve().resolvedType);
					(this.encode = h(this)({ Writer: p, types: t, util: f })),
						(this.decode = d(this)({ Reader: l, types: t, util: f })),
						(this.verify = y(this)({ types: t, util: f })),
						(this.fromObject = m.fromObject(this)({ types: t, util: f })),
						(this.toObject = m.toObject(this)({ types: t, util: f }));
					const o = g[e];
					if (o) {
						const n = Object.create(this);
						(n.fromObject = this.fromObject),
							(this.fromObject = o.fromObject.bind(n)),
							(n.toObject = this.toObject),
							(this.toObject = o.toObject.bind(n));
					}
					return this;
				}),
				(v.prototype.encode = function (e, t) {
					return this.setup().encode(e, t);
				}),
				(v.prototype.encodeDelimited = function (e, t) {
					return this.encode(e, t && t.len ? t.fork() : t).ldelim();
				}),
				(v.prototype.decode = function (e, t) {
					return this.setup().decode(e, t);
				}),
				(v.prototype.decodeDelimited = function (e) {
					return e instanceof l || (e = l.create(e)), this.decode(e, e.uint32());
				}),
				(v.prototype.verify = function (e) {
					return this.setup().verify(e);
				}),
				(v.prototype.fromObject = function (e) {
					return this.setup().fromObject(e);
				}),
				(v.prototype.toObject = function (e, t) {
					return this.setup().toObject(e, t);
				}),
				(v.d = function (e) {
					return function (t) {
						f.decorateType(t, e);
					};
				});
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			e.exports = a;
			const n = r(16);
			((a.prototype = Object.create(n.prototype)).constructor = a).className = 'MapField';
			const i = r(20);
				const s = r(4);
			function a(e, t, r, o, i, a) {
				if ((n.call(this, e, t, o, void 0, void 0, i, a), !s.isString(r))) throw TypeError('keyType must be a string');
				(this.keyType = r), (this.resolvedKeyType = null), (this.map = !0);
			}
			(a.fromJSON = function (e, t) {
				return new a(e, t.id, t.keyType, t.type, t.options, t.comment);
			}),
				(a.prototype.toJSON = function (e) {
					const t = !!e && Boolean(e.keepComments);
					return s.toObject([
						'keyType',
						this.keyType,
						'type',
						this.type,
						'id',
						this.id,
						'extend',
						this.extend,
						'options',
						this.options,
						'comment',
						t ? this.comment : void 0
					]);
				}),
				(a.prototype.resolve = function () {
					if (this.resolved) return this;
					if (void 0 === i.mapKey[this.keyType]) throw Error('invalid key type: ' + this.keyType);
					return n.prototype.resolve.call(this);
				}),
				(a.d = function (e, t, r) {
					return (
						typeof r === 'function'
							? (r = s.decorateType(r).name)
							: r && o(r) === 'object' && (r = s.decorateEnum(r).name),
						function (o, n) {
							s.decorateType(o.constructor).add(new a(n, e, t, r));
						}
					);
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = a;
			const o = r(27);
			((a.prototype = Object.create(o.prototype)).constructor = a).className = 'Service';
			const n = r(49);
				const i = r(4);
				const s = r(81);
			function a(e, t) {
				o.call(this, e, t), (this.methods = {}), (this._methodsArray = null);
			}
			function u(e) {
				return (e._methodsArray = null), e;
			}
			(a.fromJSON = function (e, t) {
				const r = new a(e, t.options);
				if (t.methods)
					for (let o = Object.keys(t.methods), i = 0; i < o.length; ++i) r.add(n.fromJSON(o[i], t.methods[o[i]]));
				return t.nested && r.addJSON(t.nested), (r.comment = t.comment), r;
			}),
				(a.prototype.toJSON = function (e) {
					const t = o.prototype.toJSON.call(this, e);
						const r = !!e && Boolean(e.keepComments);
					return i.toObject([
						'options',
						(t && t.options) || void 0,
						'methods',
						o.arrayToJSON(this.methodsArray, e) || {},
						'nested',
						(t && t.nested) || void 0,
						'comment',
						r ? this.comment : void 0
					]);
				}),
				Object.defineProperty(a.prototype, 'methodsArray', {
					get: function () {
						return this._methodsArray || (this._methodsArray = i.toArray(this.methods));
					}
				}),
				(a.prototype.get = function (e) {
					return this.methods[e] || o.prototype.get.call(this, e);
				}),
				(a.prototype.resolveAll = function () {
					for (let e = this.methodsArray, t = 0; t < e.length; ++t) e[t].resolve();
					return o.prototype.resolve.call(this);
				}),
				(a.prototype.add = function (e) {
					if (this.get(e.name)) throw Error("duplicate name '" + e.name + "' in " + this);
					return e instanceof n
						? ((this.methods[e.name] = e), (e.parent = this), u(this))
						: o.prototype.add.call(this, e);
				}),
				(a.prototype.remove = function (e) {
					if (e instanceof n) {
						if (this.methods[e.name] !== e) throw Error(e + ' is not a member of ' + this);
						return delete this.methods[e.name], (e.parent = null), u(this);
					}
					return o.prototype.remove.call(this, e);
				}),
				(a.prototype.create = function (e, t, r) {
					for (var o, n = new s.Service(e, t, r), a = 0; a < this.methodsArray.length; ++a) {
						const u = i.lcFirst((o = this._methodsArray[a]).resolve().name).replace(/[^$\w_]/g, '');
						n[u] = i.codegen(['r', 'c'], i.isReserved(u) ? u + '_' : u)('return this.rpcCall(m,q,s,r,c)')({
							m: o,
							q: o.resolvedRequestType.ctor,
							s: o.resolvedResponseType.ctor
						});
					}
					return n;
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = i;
			const o = r(19);
			((i.prototype = Object.create(o.prototype)).constructor = i).className = 'Method';
			const n = r(4);
			function i(e, t, r, i, s, a, u, c) {
				if (
					(n.isObject(s) ? ((u = s), (s = a = void 0)) : n.isObject(a) && ((u = a), (a = void 0)),
					void 0 !== t && !n.isString(t))
				)
					throw TypeError('type must be a string');
				if (!n.isString(r)) throw TypeError('requestType must be a string');
				if (!n.isString(i)) throw TypeError('responseType must be a string');
				o.call(this, e, u),
					(this.type = t || 'rpc'),
					(this.requestType = r),
					(this.requestStream = !!s || void 0),
					(this.responseType = i),
					(this.responseStream = !!a || void 0),
					(this.resolvedRequestType = null),
					(this.resolvedResponseType = null),
					(this.comment = c);
			}
			(i.fromJSON = function (e, t) {
				return new i(e, t.type, t.requestType, t.responseType, t.requestStream, t.responseStream, t.options, t.comment);
			}),
				(i.prototype.toJSON = function (e) {
					const t = !!e && Boolean(e.keepComments);
					return n.toObject([
						'type',
						(this.type !== 'rpc' && this.type) || void 0,
						'requestType',
						this.requestType,
						'requestStream',
						this.requestStream,
						'responseType',
						this.responseType,
						'responseStream',
						this.responseStream,
						'options',
						this.options,
						'comment',
						t ? this.comment : void 0
					]);
				}),
				(i.prototype.resolve = function () {
					return this.resolved
						? this
						: ((this.resolvedRequestType = this.parent.lookupType(this.requestType)),
						  (this.resolvedResponseType = this.parent.lookupType(this.responseType)),
						  o.prototype.resolve.call(this));
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = n;
			const o = r(13);
			function n(e) {
				if (e) for (let t = Object.keys(e), r = 0; r < t.length; ++r) this[t[r]] = e[t[r]];
			}
			(n.create = function (e) {
				return this.$type.create(e);
			}),
				(n.encode = function (e, t) {
					return this.$type.encode(e, t);
				}),
				(n.encodeDelimited = function (e, t) {
					return this.$type.encodeDelimited(e, t);
				}),
				(n.decode = function (e) {
					return this.$type.decode(e);
				}),
				(n.decodeDelimited = function (e) {
					return this.$type.decodeDelimited(e);
				}),
				(n.verify = function (e) {
					return this.$type.verify(e);
				}),
				(n.fromObject = function (e) {
					return this.$type.fromObject(e);
				}),
				(n.toObject = function (e, t) {
					return this.$type.toObject(e, t);
				}),
				(n.prototype.toJSON = function () {
					return this.$type.toObject(this, o.toJSONOptions);
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = p;
			const o = r(27);
			((p.prototype = Object.create(o.prototype)).constructor = p).className = 'Root';
			let n;
				let i;
				let s;
				const a = r(16);
				const u = r(11);
				const c = r(36);
				const l = r(4);
			function p(e) {
				o.call(this, '', e), (this.deferred = []), (this.files = []);
			}
			function f() {}
			(p.fromJSON = function (e, t) {
				return t || (t = new p()), e.options && t.setOptions(e.options), t.addJSON(e.nested);
			}),
				(p.prototype.resolvePath = l.path.resolve),
				(p.prototype.load = function e(t, r, o) {
					typeof r === 'function' && ((o = r), (r = void 0));
					const n = this;
					if (!o) return l.asPromise(e, n, t, r);
					const a = o === f;
					function u(e, t) {
						if (o) {
							const r = o;
							if (((o = null), a)) throw e;
							r(e, t);
						}
					}
					function c(e, t) {
						try {
							if ((l.isString(t) && t.charAt(0) === '{' && (t = JSON.parse(t)), l.isString(t))) {
								i.filename = e;
								let o;
									const s = i(t, n, r);
									let c = 0;
								if (s.imports) for (; c < s.imports.length; ++c) (o = n.resolvePath(e, s.imports[c])) && p(o);
								if (s.weakImports)
									for (c = 0; c < s.weakImports.length; ++c) (o = n.resolvePath(e, s.weakImports[c])) && p(o, !0);
							} else n.setOptions(t.options).addJSON(t.nested);
						} catch (e) {
							u(e);
						}
						a || h || u(null, n);
					}
					function p(e, t) {
						const r = e.lastIndexOf('google/protobuf/');
						if (r > -1) {
							const i = e.substring(r);
							i in s && (e = i);
						}
						if (!(n.files.indexOf(e) > -1))
							if ((n.files.push(e), e in s))
								a
									? c(e, s[e])
									: (++h,
									  setTimeout(function () {
											--h, c(e, s[e]);
									  }));
							else if (a) {
								let p;
								try {
									p = l.fs.readFileSync(e).toString('utf8');
								} catch (e) {
									return void (t || u(e));
								}
								c(e, p);
							} else
								++h,
									l.fetch(e, function (r, i) {
										--h, o && (r ? (t ? h || u(null, n) : u(r)) : c(e, i));
									});
					}
					var h = 0;
					l.isString(t) && (t = [t]);
					for (var d, y = 0; y < t.length; ++y) (d = n.resolvePath('', t[y])) && p(d);
					if (a) return n;
					h || u(null, n);
				}),
				(p.prototype.loadSync = function (e, t) {
					if (!l.isNode) throw Error('not supported');
					return this.load(e, t, f);
				}),
				(p.prototype.resolveAll = function () {
					if (this.deferred.length)
						throw Error(
							'unresolvable extensions: ' +
								this.deferred
									.map(function (e) {
										return "'extend " + e.extend + "' in " + e.parent.fullName;
									})
									.join(', ')
						);
					return o.prototype.resolveAll.call(this);
				});
			const h = /^[A-Z]/;
			function d(e, t) {
				const r = t.parent.lookup(t.extend);
				if (r) {
					const o = new a(t.fullName, t.id, t.type, t.rule, void 0, t.options);
					return (o.declaringField = t), (t.extensionField = o), r.add(o), !0;
				}
				return !1;
			}
			(p.prototype._handleAdd = function (e) {
				if (e instanceof a) void 0 === e.extend || e.extensionField || d(0, e) || this.deferred.push(e);
				else if (e instanceof u) h.test(e.name) && (e.parent[e.name] = e.values);
				else if (!(e instanceof c)) {
					if (e instanceof n)
						for (let t = 0; t < this.deferred.length; ) d(0, this.deferred[t]) ? this.deferred.splice(t, 1) : ++t;
					for (let r = 0; r < e.nestedArray.length; ++r) this._handleAdd(e._nestedArray[r]);
					h.test(e.name) && (e.parent[e.name] = e);
				}
			}),
				(p.prototype._handleRemove = function (e) {
					if (e instanceof a) {
						if (void 0 !== e.extend)
							if (e.extensionField) e.extensionField.parent.remove(e.extensionField), (e.extensionField = null);
							else {
								const t = this.deferred.indexOf(e);
								t > -1 && this.deferred.splice(t, 1);
							}
					} else if (e instanceof u) h.test(e.name) && delete e.parent[e.name];
					else if (e instanceof o) {
						for (let r = 0; r < e.nestedArray.length; ++r) this._handleRemove(e._nestedArray[r]);
						h.test(e.name) && delete e.parent[e.name];
					}
				}),
				(p._configure = function (e, t, r) {
					(n = e), (i = t), (s = r);
				});
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			let n;
				let i;
				const s = o(r(7));
				const a = o(r(28));
				const u = o(r(53));
				const c = o(r(29));
				const l = o(r(30));
				const p = o(r(55));
				const f = o(r(56));
				const h = o(r(57));
				const d = o(r(8));
				const y = o(r(58));
				const m = {};
				const g = (0, s.default)();
				const v = [];
				const _ = 1;
				const b = function () {};
				const E = function e(t) {
					if (!this instanceof e) return new e(t);
					t = t || {};
					(this.isDebug = t.isDebug || !1),
						(this.isHttpDNS = t.isHttpDNS || !1),
						(this.isMultiLoginSessions = t.isMultiLoginSessions || !1),
						(this.wait = t.wait || 30),
						(this.retry = t.retry || !1),
						(this.https = t.https && location.protocol === 'https:'),
						(this.url = t.url),
						(this.hold = t.hold || 1),
						(this.route = t.route || null),
						(this.inactivity = t.inactivity || 30),
						(this.heartBeatWait = t.heartBeatWait || 4500),
						(this.maxRetries = t.maxRetries || 5),
						(this.isAutoLogin = !1 !== t.isAutoLogin),
						(this.pollingTime = t.pollingTime || 800),
						(this.stropheConn = !1),
						(this.autoReconnectNumMax = t.autoReconnectNumMax || 0),
						(this.autoReconnectNumTotal = 0),
						(this.autoReconnectInterval = t.autoReconnectInterval || 0),
						(this.context = { status: g.STATUS_INIT }),
						(this.sendQueue = new u.default()),
						(this.intervalId = null),
						(this.apiUrl = t.apiUrl || ''),
						(this.isWindowSDK = t.isWindowSDK || !1),
						(this.encrypt = t.encrypt || { encrypt: { type: 'none' } }),
						(this.delivery = t.delivery || !1),
						(this.appKey = t.appKey || ''),
						(this.domain = t.domain || 'easemob.com'),
						(this.clientResource = '84ff3eba1'),
						(this.user = ''),
						(this.orgName = ''),
						(this.appName = ''),
						(this.token = ''),
						(this.unSendMsgArr = []),
						(this.dnsArr = ['https://rs.easemob.com', 'http://182.92.174.78', 'http://112.126.66.111']),
						(this.dnsIndex = 0),
						(this.dnsTotal = this.dnsArr.length),
						(this.restHosts = []),
						(this.restIndex = 0),
						(this.restTotal = 0),
						(this.xmppHosts = []),
						(this.xmppIndex = 0),
						(this.xmppTotal = 0),
						(this.groupOption = {}),
						(this.version = t.version || '3.0.0'),
						(this.compressAlgorimth = t.compressAlgorimth || 0),
						(this.userAgent = t.userAgent || 0),
						(this.pov = t.pov || 0),
						(this.command = t.command || 3),
						(this.deviceId = t.deviceId || 'webim'),
						(this.encryptKey = t.encryptKey || ''),
						(this.firstPayload = t.firstPayload || []),
						(this.compressType = t.compressType || [0]),
						(this.encryptType = t.encryptType || [0]),
						(this.osType = 16);
				};
			(E.prototype.registerUser = function (e) {
				this.isHttpDNS ? ((this.dnsIndex = 0), this.getHttpDNS(e, 'signup')) : this.signup(e);
			}),
				(E.prototype.listen = function (e) {
					(this.onOpened = e.onOpened || b),
						(this.onClosed = e.onClosed || b),
						(this.onTextMessage = e.onTextMessage || b),
						(this.onEmojiMessage = e.onEmojiMessage || b),
						(this.onPictureMessage = e.onPictureMessage || b),
						(this.onAudioMessage = e.onAudioMessage || b),
						(this.onVideoMessage = e.onVideoMessage || b),
						(this.onFileMessage = e.onFileMessage || b),
						(this.onLocationMessage = e.onLocationMessage || b),
						(this.onCustomMessage = e.onCustomMessage || b),
						(this.onCmdMessage = e.onCmdMessage || b),
						(this.onStatisticMessage = e.onStatisticMessage || b),
						(this.onPresence = e.onPresence || b),
						(this.onRoster = e.onRoster || b),
						(this.onError = e.onError || b),
						(this.onReceivedMessage = e.onReceivedMessage || b),
						(this.onInviteMessage = e.onInviteMessage || b),
						(this.onDeliverdMessage = e.onDeliveredMessage || b),
						(this.onReadMessage = e.onReadMessage || b),
						(this.onRecallMessage = e.onRecallMessage || b),
						(this.onMutedMessage = e.onMutedMessage || b),
						(this.onOffline = e.onOffline || b),
						(this.onOnline = e.onOnline || b),
						(this.onConfirmPop = e.onConfirmPop || b),
						(this.onCreateGroup = e.onCreateGroup || b),
						(this.onUpdateMyGroupList = e.onUpdateMyGroupList || b),
						(this.onUpdateMyRoster = e.onUpdateMyRoster || b),
						(this.onBlacklistUpdate = e.onBlacklistUpdate || b),
						i._listenNetwork(this.onOnline, this.onOffline);
				}),
				(E.prototype.getParams = function (e) {
					(n = e.root),
						(i = e.utils),
						(E.prototype._utils = i),
						(m.utils = i),
						(m.statusCode = g),
						(m.message = a.default),
						(m.message.prototype._utils = i);
				}),
				(E.prototype._msgHash = {}),
				(E.prototype._queues = []),
				(E.prototype._lastsession = function (e, t, r) {
					const o = [];
						const i = n.lookup('easemob.pb.CommSyncUL');
						let s = i.decode(o);
					(s.queue = t),
						(s.key = new d.default(e.low, e.high, e.unsigned).toString()),
						r.isDebug && console.log('上行_lastsession: ', s),
						(s = i.encode(s).finish());
					const a = n.lookup('easemob.pb.MSync');
						let u = a.decode(o);
					if (
						((u.version = r.version),
						(u.encryptType = r.encryptType),
						(u.command = 0),
						(u.payload = s),
						(u = a.encode(u).finish()),
						r.sock.readyState !== _)
					) {
						const c = { type: g.WEBIM_CONNCTION_DISCONNECTED };
						r.onError(c);
					} else r._base64transform(u, r);
				}),
				(E.prototype._metapayload = function (e, t, r) {
					for (let o = 0; o < e.length; o++) {
						const n = new d.default(e[o].id.low, e[o].id.high, e[o].id.unsigned).toString();
						v.indexOf(n) < 0 &&
							(r.isDebug && console.log('下行meta：', e[o]),
							e[o].ns === 1
								? (0, l.default)(e[o], t, r)
								: e[o].ns === 2
								? (0, p.default)(e[o], t, r)
								: e[o].ns === 3
								? f.default.handleMessage(e[o], t, r)
								: e[o].ns === 0
								? (0, h.default)(e[o], t, r)
								: e[o].ns === 4 && r.registerConfrIQHandler && r.registerConfrIQHandler(e[o], t, r),
							v.length <= 100 || v.shift(),
							v.push(n));
					}
				}),
				(E.prototype._rebuild = function () {
					const e = [];
						const t = n.lookup('easemob.pb.StatisticsBody');
						let r = t.decode(e);
					(r.operation = 0), (r = t.encode(r).finish());
					const o = n.lookup('easemob.pb.Meta').decode(e);
					(o.id = new Date().valueOf()), (o.ns = 0), (o.payload = r);
					const i = n.lookup('easemob.pb.CommSyncUL');
						let s = i.decode(e);
					(s.meta = o), this.isDebug && console.log('上行rebuild: ', o), (s = i.encode(s).finish());
					const a = n.lookup('easemob.pb.MSync');
						let u = a.decode(e);
					(u.version = '3.0.8'),
						(u.encryptType = [0]),
						(u.command = 0),
						(u.payload = s),
						(u = a.encode(u).finish()),
						this._base64transform(u, this);
				}),
				(E.prototype._backqueue = function (e, t) {
					const r = [];
						const o = n.lookup('easemob.pb.CommSyncUL');
						let i = o.decode(r);
					(i.queue = e), t.isDebug && console.log('上行queue: ', i), (i = o.encode(i).finish());
					const s = n.lookup('easemob.pb.MSync');
						let a = s.decode(r);
					(a.version = t.version),
						(a.encryptType = t.encryptType),
						(a.command = 0),
						(a.payload = i),
						(a = s.encode(a).finish()),
						t._base64transform(a, t);
				});
			const O = function (e) {
				const t = n.lookup('easemob.pb.MSync');
					let r = t.decode([]);
				(r.version = e.version),
					(r.encryptType = e.encryptType),
					(r.command = 1),
					e.isDebug && console.log('上行unreadDeal: ', r),
					(r = t.encode(r).finish()),
					e._base64transform(r, e);
			};
			(E.prototype._receiveProvision = function (e, t) {
				const r = n.lookup('easemob.pb.Provision').decode(e.payload);
				(t.context.jid.clientResource = r.resource), r.status.errorCode == 0 && (O(t), t._rebuild(t));
			}),
				(E.prototype.heartBeatID = 0),
				(E.prototype.heartBeat = function (e) {
					this.stopHeartBeat(),
						(this.heartBeatID = setInterval(function () {
							O(e);
						}, this.heartBeatWait));
				}),
				(E.prototype.stopHeartBeat = function () {
					clearInterval(this.heartBeatID);
				}),
				(E.prototype.getRestFromHttpDNS = function (e, t) {
					if (!(this.restIndex > this.restTotal)) {
						let r = '';
							const o = this.restHosts[this.restIndex];
							const n = o.domain;
							const i = o.ip;
						if (i && location.protocol == 'http:') {
							const s = o.port;
							r = (location.protocol === 'https:' ? 'https:' : 'http:') + '//' + i + ':' + s;
						} else r = (location.protocol === 'https:' ? 'https:' : 'http:') + '//' + n;
						r != '' && ((this.apiUrl = r), (e.apiUrl = r)), t == 'login' ? this.login(e) : this.signup(e);
					}
				}),
				(E.prototype.getHttpDNS = function (e, t) {
					const r = this;
						const o = {
							url: this.dnsArr[this.dnsIndex] + '/easemob/server.json',
							dataType: 'json',
							type: 'GET',
							data: { app_key: encodeURIComponent(e.appKey || this.appKey) },
							success:
								function (o, n) {
									const i = o.rest.hosts;
									if (i) {
										for (
											var s = r.https ? 'https' : 'http',
												a = i.filter(function (e, t) {
													if (e.protocol == s) return e;
												}),
												u = 0;
											u < a.length;
											u++
										)
											if (a[u].protocol === s) {
												var c = a[u];
												a.splice(u, 1), a.unshift(c);
											}
										(r.restHosts = a), (r.restTotal = a.length);
										try {
											Array.prototype.slice.call(document.documentElement.childNodes, 0)[0].nodeType;
										} catch (e) {
											(function (e) {
												for (var t = [], r = 0, o = e.length; r < o; r++) t.push(e[r]);
												return t;
											});
										}
										const l = o['msync-ws'].hosts;
										if (l) {
											const p = l.filter(function (e, t) {
												if (e.protocol == s) return e;
											});
											for (u = 0; u < p.length; u++)
												if (p[u].protocol === s) {
													c = p[u];
													p.splice(u, 1), p.unshift(c);
												}
											(r.xmppHosts = p), (r.xmppTotal = p.length), r.getRestFromHttpDNS(e, t);
										}
									}
								} || b,
							error:
								function (o, n, i) {
									console.log('getHttpDNS error', o, i), r.dnsIndex++, r.dnsIndex < r.dnsTotal && r.getHttpDNS(e, t);
								} || b
						};
					i.ajax(o);
				}),
				(E.prototype.signup = function (e) {
					const t = this;
						let r = e.orgName || '';
						let o = e.appName || '';
						const n = e.appKey || this.appKey;
						const s = e.success || b;
						const a = e.error || b;
					if (!r && !o && n) {
						const u = n.split('#');
						u.length === 2 && ((r = u[0]), (o = u[1]));
					}
					if (r || o) {
						e.https || this.https;
						const c = (e.apiUrl || this.apiUrl) + '/' + r + '/' + o + '/users';
							const l = { username: e.username, password: e.password, nickname: e.nickname || '' };
							const p = {
								url: c,
								dataType: 'json',
								data: i.stringify(l),
								success: s,
								error: function (r, o, n) {
									if (t.isHttpDNS && t.restIndex + 1 < t.restTotal)
										return t.restIndex++, void t.getRestFromHttpDNS(e, 'signup');
									t.clear(), a(r);
								}
							};
						i.ajax(p);
					} else a({ type: g.WEBIM_CONNCTION_APPKEY_NOT_ASSIGN_ERROR });
				}),
				(E.prototype.open = function (e) {
					const t = e.appKey;
						const r = t.split('#')[0];
						const o = t.split('#')[1];
					(this.orgName = r),
						(this.appName = o),
						e.accessToken && (this.token = e.accessToken),
						this.isHttpDNS ? ((this.dnsIndex = 0), this.getHttpDNS(e, 'login')) : this.login(e);
				}),
				(E.prototype.login = function (e) {
					if (
						((this.user = e.user),
						(function (e, t) {
							if ((e = e || {}).user == '') return t.onError({ type: g.WEBIM_CONNCTION_USER_NOT_ASSIGN_ERROR }), !1;
							const r = e.user + '' || '';
								const o = e.appKey || '';
								const i = o.split('#');
							if (i.length !== 2) return t.onError({ type: g.WEBIM_CONNCTION_APPKEY_NOT_ASSIGN_ERROR }), !1;
							const s = i[0];
								const a = i[1];
							return s && a
								? ((t.context.jid = { appKey: o, name: r, domain: t.domain, clientResource: t.clientResource }),
								  (t.context.root = n),
								  (t.context.userId = r),
								  (t.context.appKey = o),
								  (t.context.appName = a),
								  (t.context.orgName = s),
								  !0)
								: (t.onError({ type: g.WEBIM_CONNCTION_APPKEY_NOT_ASSIGN_ERROR }), !1);
						})(e, this))
					) {
						const t = this;
						if (!t.isOpened())
							if (e.accessToken) (e.access_token = e.accessToken), this._login(e, t);
							else {
								const r = e.apiUrl;
									const o = this.context.userId;
									const s = e.pwd || '';
									const a = this.context.appName;
									const u = this.context.orgName;
									const c = { grant_type: 'password', username: o, password: s, timestamp: +new Date() };
									const l = {
										headers: { 'Content-type': 'application/json' },
										url: r + '/' + u + '/' + a + '/token',
										dataType: 'json',
										data: i.stringify(c),
										success:
											function (r, o) {
												e.success && e.success(r),
													(t.token = r.access_token),
													(t.context.restTokenData = r.access_token),
													t._login(r, t);
											} || b,
										error:
											function (r, o, n) {
												if ((e.error && e.error(), t.isHttpDNS && t.restIndex + 1 < t.restTotal))
													return t.restIndex++, void t.getRestFromHttpDNS(e, 'login');
												t.clear(),
													r.error && r.error_description
														? t.onError({ type: g.WEBIM_CONNCTION_OPEN_USERGRID_ERROR, data: r, xhr: o })
														: t.onError({ type: g.WEBIM_CONNCTION_OPEN_ERROR, data: r, xhr: o });
											} || b
									};
								i.ajax(l);
							}
					}
				}),
				(E.prototype.close = function (e) {
					(this.logOut = !0),
						(this.context.status = g.STATUS_CLOSING),
						this.sock.close(),
						this.stopHeartBeat(),
						(this.context.status = g.STATUS_CLOSING);
				}),
				(E.prototype.recallMessage = function (e) {
					const t = {
						id: this.getUniqueId(),
						type: 'recall',
						group: e.type,
						ackId: e.mid,
						to: e.to,
						success: e.success,
						fail: e.fail
					};
					this.send(t, this);
				}),
				(E.prototype.sendMSync = function (e) {
					if (this.sock.readyState === _) return this._base64transform(e, this);
					this.unSendMsgArr.push(this._base64transform(e, this, !0)),
						!this.logOut &&
							this.autoReconnectNumTotal < this.autoReconnectNumMax &&
							((this.autoReconnectNumTotal <= this.xmppHosts.length && this.isHttpDNS) || !this.isHttpDNS) &&
							((this.offLineSendConnecting = !0), this.reconnect()),
						this.onError({ type: g.WEBIM_CONNCTION_DISCONNECTED, reconnect: !0 });
				}),
				(E.prototype.getUniqueId = function (e) {
					this.autoIncrement ? this.autoIncrement++ : (this.autoIncrement = 1);
					const t = new Date();
						const r = new Date(2010, 1, 1);
					return t.getTime() - r.getTime() + this.autoIncrement;
				}),
				(E.prototype.send = function (e) {
					(0, c.default)(e, this, i), (this._msgHash[e.id] = e);
				}),
				(E.prototype.removeRoster = function (e) {
					f.default.operatRoster(e, 'remove', this);
				}),
				(E.prototype.subscribe = function (e) {
					f.default.operatRoster(e, 'add', this);
				}),
				(E.prototype.subscribed = function (e) {
					f.default.operatRoster(e, 'accept', this);
				}),
				(E.prototype.unsubscribed = function (e) {
					f.default.operatRoster(e, 'decline', this);
				}),
				(E.prototype.isOpened = function () {
					return this.sock && this.sock.readyState === _;
				}),
				(E.prototype.clear = function () {
					const e = this.context.appKey;
					if (
						(this.errorType != g.WEBIM_CONNCTION_DISCONNECTED &&
							this.logOut &&
							((this.unSendMsgArr = []),
							(this.offLineSendConnecting = !1),
							(this.context = { status: g.STATUS_INIT, appKey: e })),
						this.intervalId && clearInterval(this.intervalId),
						(this.restIndex = 0),
						(this.xmppIndex = 0),
						this.errorType == g.WEBIM_CONNCTION_CLIENT_LOGOUT || this.errorType == -1)
					) {
						const t = { data: { data: 'logout' }, type: g.WEBIM_CONNCTION_CLIENT_LOGOUT };
						this.onError(t);
					}
				}),
				(E.prototype.autoReconnectInterval = 0),
				(E.prototype.times = 1),
				(E.prototype.reconnect = function (e) {
					const t = this;
					t.xmppIndex < t.xmppHosts.length - 1 && t.xmppIndex++,
						setTimeout(function () {
							t._login({ access_token: t.context.accessToken }, t),
								(t.autoReconnectInterval += t.times * t.times),
								t.times++;
						}, 1e3 * (this.autoReconnectNumTotal == 0 ? 0 : t.autoReconnectInterval)),
						this.autoReconnectNumTotal++;
				}),
				(E.prototype.closed = function () {
					const e = { data: { data: 'Closed error' }, type: g.WEBIM_CONNECTION_CLOSED };
					this.onError(e), this.stopHeartBeat();
				}),
				(E.prototype.addToBlackList = function (e) {
					f.default.operatRoster({ to: e.name }, 'ban', this);
				}),
				(E.prototype.removeFromBlackList = function (e) {
					f.default.operatRoster({ to: e.name }, 'allow', this);
				}),
				Object.assign(E.prototype, y.default),
				(m.connection = E),
				(m.doQuery = function (e, t, r) {
					void 0 !== window.cefQuery && window.cefQuery({ request: e, persistent: !1, onSuccess: t, onFailure: r });
				}),
				(m.debug = function (e) {});
			const N = m;
			t.default = N;
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				this.array = void 0 === e ? [] : new Array(e);
			}
			Object.defineProperty(t, '__esModule', { value: !0 }),
				(t.default = void 0),
				(o.prototype = {
					length: function () {
						return this.array.length;
					},
					at: function (e) {
						return this.array[e];
					},
					set: function (e, t) {
						this.array[e] = t;
					},
					push: function (e) {
						return this.array.push(e);
					},
					slice: function (e, t) {
						return (this.array = this.array.slice(e, t));
					},
					concat: function (e) {
						this.array = this.array.concat(e);
					},
					remove: function (e, t) {
						(t = void 0 === t ? 1 : t), this.array.splice(e, t);
					},
					join: function (e) {
						return this.array.join(e);
					},
					clear: function () {
						this.array.length = 0;
					}
				});
			const n = function () {
				this._array_h = new o();
			};
			n.prototype = {
				_index: 0,
				push: function (e) {
					this._array_h.push(e);
				},
				pop: function () {
					let e = null;
					return (
						this._array_h.length() &&
							((e = this._array_h.at(this._index)),
							2 * ++this._index >= this._array_h.length() && (this._array_h.slice(this._index), (this._index = 0))),
						e
					);
				},
				head: function () {
					let e = null;
						const t = this._array_h.length();
					return t && (e = this._array_h.at(t - 1)), e;
				},
				tail: function () {
					let e = null;
					return this._array_h.length() && (e = this._array_h.at(this._index)), e;
				},
				length: function () {
					return this._array_h.length() - this._index;
				},
				empty: function () {
					return this._array_h.length() === 0;
				},
				clear: function () {
					this._array_h.clear();
				}
			};
			const i = n;
			t.default = i;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			let n;
				let i;
				let s;
				let a;
				const u = o(r(6));
			Object.keys ||
				(Object.keys =
					((n = Object.prototype.hasOwnProperty),
					(i = !{ toString: null }.propertyIsEnumerable('toString')),
					(a = (s = [
						'toString',
						'toLocaleString',
						'valueOf',
						'hasOwnProperty',
						'isPrototypeOf',
						'propertyIsEnumerable',
						'constructor'
					]).length),
					function (e) {
						if ((0, u.default)(e) !== 'object' && (typeof e !== 'function' || e === null))
							throw new TypeError('Object.keys called on non-object');
						let t;
							let r;
							const o = [];
						for (t in e) n.call(e, t) && o.push(t);
						if (i) for (r = 0; r < a; r++) n.call(e, s[r]) && o.push(s[r]);
						return o;
					}));
			const c = {
					emptyfn: function () {},
					stringify: function (e) {
						if (typeof JSON !== 'undefined' && JSON.stringify) return JSON.stringify(e);
						let t = '';
							const r = [];
						return (function e(o) {
							let n = !1;
							for (const i in (Object.prototype.toString.call(o) === '[object Array]'
								? (r.push(']', '['), (n = !0))
								: Object.prototype.toString.call(o) === '[object Object]' && r.push('}', '{'),
							o))
								Object.prototype.toString.call(o[i]) === '[object Null]'
									? (o[i] = 'null')
									: Object.prototype.toString.call(o[i]) === '[object Undefined]' && (o[i] = 'undefined'),
									o[i] && (0, u.default)(o[i]) === 'object'
										? (t += ',' + (n ? '' : '"' + i + '":' + (n ? '"' : '')) + e(o[i]))
										: (t += ',"' + (n ? '' : i + '":"') + o[i] + '"');
							return t != '' && (t = t.slice(1)), r.pop() + t + r.pop();
						})(e);
					},
					getFileSize: function (e) {
						let t = this.getFileLength(e);
						if (t > 1e7) return !1;
						const r = Math.round(t / 1e3);
						if (r < 1e3) t = r + ' KB';
						else if (r >= 1e3) {
							const o = r / 1e3;
							if (o < 1e3) t = o.toFixed(1) + ' MB';
							else t = (o / 1e3).toFixed(1) + ' GB';
						}
						return t;
					},
					trim: function (e) {
						return (e = typeof e === 'string' ? e : '').trim ? e.trim() : e.replace(/^\s|\s$/g, '');
					},
					parseTextMessage: function (e, t) {
						if (typeof e === 'string') {
							if (Object.prototype.toString.call(t) !== '[object Object]')
								return { isemoji: !1, body: [{ type: 'txt', data: e }] };
							let r = e;
								const o = [];
								const n = r.match(/\[[^[\]]{2,3}\]/gm);
							if (!n || n.length < 1) return { isemoji: !1, body: [{ type: 'txt', data: e }] };
							for (var i = !1, s = 0; s < n.length; s++) {
								const a = r.substring(0, r.indexOf(n[s]));
									const u = WebIM.Emoji.map[n[s]];
								if ((a && o.push({ type: 'txt', data: a }), u)) {
									const c = WebIM.Emoji.map ? WebIM.Emoji.path + u : null;
									c ? ((i = !0), o.push({ type: 'emoji', data: c })) : o.push({ type: 'txt', data: n[s] });
									const l = r.indexOf(n[s]) + n[s].length;
									r = r.substring(l);
								} else o.push({ type: 'txt', data: n[s] });
							}
							return (
								r && o.push({ type: 'txt', data: r }),
								i ? { isemoji: i, body: o } : { isemoji: !1, body: [{ type: 'txt', data: e }] }
							);
						}
					},
					ts: function () {
						const e = new Date();
							const t = e.getHours();
							const r = e.getMinutes();
							const o = e.getSeconds();
						return (
							(t < 10 ? '0' + t : t) +
							':' +
							(r < 10 ? '0' + r : r) +
							':' +
							(o < 10 ? '0' + o : o) +
							':' +
							e.getMilliseconds() +
							' '
						);
					},
					getObjectKey: function (e, t) {
						for (const r in e) if (e[r] == t) return r;
						return '';
					},
					sprintf: function () {
						let e;
							let t;
							const r = arguments;
							let o = r[0] || '';
						for (e = 1, t = r.length; e < t; e++) o = o.replace(/%s/, r[e]);
						return o;
					},
					reverse: function (e) {
						let t = [];
						if (Array.prototype.reverse) t = e.reverse();
						else for (let r = 0; r < e.length; r++) t.unshift(e[r]);
						return t;
					},
					checkArray: function (e, t) {
						let r = 'off';
						if (
							(e.forEach(function (e, o) {
								if (e.name === t.name) return (r = 'on'), o;
							}),
							r == 'off')
						)
							return !1;
					}
				};
				const l = c;
			t.default = l;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const n = o(r(8));
				const i = function (e, t, r) {
					const o = r.context.root.lookup('easemob.pb.MUCBody').decode(e.payload);
					new n.default(e.id.low, e.id.high, e.id.unsigned).toString();
					!(function (e) {
						const t = {
							type: '',
							owner: o.from.name,
							gid: o.mucId.name,
							from: o.from.name,
							fromJid: o.from,
							to: o.to.length ? o.to[0].name : '',
							toJid: o.to,
							chatroom: o.isChatroom,
							status: o.status
						};
						(
							({
								32: function () {
									(t.type = o.isChatroom ? 'rmChatRoomMute' : 'rmGroupMute'), r.onPresence(t);
								},
								31: function () {
									(t.type = o.isChatroom ? 'muteChatRoom' : 'muteGroup'), r.onPresence(t);
								},
								30: function () {
									(t.type = o.isChatroom ? 'rmUserFromChatRoomWhiteList' : 'rmUserFromGroupWhiteList'), r.onPresence(t);
								},
								29: function () {
									(t.type = o.isChatroom ? 'addUserToChatRoomWhiteList' : 'addUserToGroupWhiteList'), r.onPresence(t);
								},
								28: function () {
									(t.type = 'deleteFile'), r.onPresence(t);
								},
								27: function () {
									(t.type = 'uploadFile'), r.onPresence(t);
								},
								26: function () {
									(t.type = 'deleteAnnouncement'), r.onPresence(t);
								},
								25: function () {
									(t.type = 'updateAnnouncement'), r.onPresence(t);
								},
								24: function () {
									(t.type = 'removeMute'), r.onPresence(t);
								},
								23: function () {
									(t.type = 'addMute'), r.onPresence(t);
								},
								22: function () {
									(t.type = 'removeAdmin'), r.onPresence(t);
								},
								21: function () {
									(t.type = 'addAdmin'), r.onPresence(t);
								},
								20: function () {
									(t.type = 'changeOwner'), r.onPresence(t);
								},
								19: function () {
									(t.type = 'direct_joined'), r.onPresence(t);
								},
								18: function () {
									(t.type = o.isChatroom ? 'leaveChatRoom' : 'leaveGroup'), r.onPresence(t);
								},
								17: function () {
									(t.type = o.isChatroom ? 'memberJoinChatRoomSuccess' : 'memberJoinPublicGroupSuccess'),
										r.onPresence(t);
								},
								16: function () {
									(t.type = 'unblock'), r.onPresence(t);
								},
								15: function () {
									(t.type = 'block'), r.onPresence(t);
								},
								14: function () {
									(t.type = 'update'), r.onPresence(t);
								},
								13: function () {
									(t.type = 'allow'), (t.reason = o.reason), r.onPresence(t);
								},
								12: function () {
									(t.type = 'ban'), r.onPresence(t);
								},
								11: function () {
									(t.type = 'getBlackList'), r.onPresence(t);
								},
								10: function () {
									(t.type = 'removedFromGroup'), (t.kicked = t.to), r.onPresence(t);
								},
								9: function () {
									(t.type = 'invite_decline'), (t.kicked = t.to), r.onPresence(t);
								},
								8: function () {
									(t.type = 'invite_accept'), (t.kicked = t.to), r.onPresence(t);
								},
								7: function () {
									(t.type = 'invite'), (t.kicked = t.to), r.onPresence(t);
								},
								6: function () {
									(t.type = 'joinPublicGroupDeclined'), r.onPresence(t);
								},
								5: function () {
									(t.type = 'joinPublicGroupSuccess'), r.onPresence(t);
								},
								4: function () {
									(t.type = 'joinGroupNotifications'), (t.reason = o.reason), r.onPresence(t);
								},
								3: function () {
									(t.type = 'leave'), r.onPresence(t);
								},
								2: function () {
									(t.type = 'join'), r.onPresence(t);
								},
								1: function () {
									(t.type = 'deleteGroupChat'), r.onPresence(t);
								}
							})[e] ||
							function () {
								console.log('%c没有匹配'.concat(e, '类型'), 'background: green');
							}
						)();
					})(o.operation);
				};
			t.default = i;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const n = o(r(8));
				const i = {
					handleMessage: function (e, t, r) {
						const o = r.context.root.lookup('easemob.pb.RosterBody').decode(e.payload);
							const i =
								(new n.default(e.id.low, e.id.high, e.id.unsigned).toString(),
								{ to: o.to[0].name, from: o.from.name, status: o.reason });
						switch (o.operation) {
							case 0:
								break;
							case 2:
								i.type = 'subscribe';
								break;
							case 3:
								i.type = 'unsubscribed';
								break;
							case 4:
								i.type = 'subscribed';
								break;
							case 5:
								i.type = 'unsubscribed';
								break;
							case 6:
							case 7:
								r.getBlacklist();
								break;
							case 8:
								i.type = 'subscribed';
								break;
							case 9:
								i.type = 'unsubscribed';
						}
						r.onPresence(i);
					},
					operatRoster: function (e, t, r) {
						const o = [];
							const n = r.context.root.lookup('easemob.pb.RosterBody');
							let i = n.decode(o);
						t === 'add'
							? (i.operation = 2)
							: t === 'remove'
							? (i.operation = 3)
							: t === 'accept'
							? (i.operation = 4)
							: t === 'decline'
							? (i.operation = 5)
							: t === 'ban'
							? (i.operation = 6)
							: t === 'allow' && (i.operation = 7),
							(i.from = r.context.jid);
						const s = [];
						if (typeof e.to === 'string')
							s.push({ appKey: r.appKey || r.context.appKey, name: e.to, domain: 'easemob.com' });
						else if (e.to instanceof Array)
							for (let a = 0; a < e.to.length; a++) s.push({ appKey: r.appKey, name: e.to[a], domain: 'easemob.com' });
						(i.to = s), (i.reason = e.message), (i = n.encode(i).finish());
						const u = r.context.root.lookup('easemob.pb.Meta').decode(o);
						(u.id = e.id || r.getUniqueId()),
							(u.from = r.context.jid),
							(u.to = { domain: '@easemob.com' }),
							(u.ns = 3),
							(u.payload = i);
						const c = r.context.root.lookup('easemob.pb.CommSyncUL');
							let l = c.decode(o);
						(l.meta = u), (l = c.encode(l).finish());
						const p = r.context.root.lookup('easemob.pb.MSync');
							let f = p.decode(o);
						(f.version = r.version),
							(f.encryptType = [0]),
							(f.command = 0),
							(f.guid = r.jid),
							(f.payload = l),
							(f = p.encode(f).finish()),
							r.sendMSync(f);
					}
				};
			t.default = i;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const n = o(r(8));
				const i = (0, o(r(7)).default)();
				const s = function (e, t, r) {
					const o = r.context.root.lookup('easemob.pb.StatisticsBody').decode(e.payload);
					new n.default(e.id.low, e.id.high, e.id.unsigned).toString();
					switch (o.operation) {
						case 0:
							r.onStatisticMessage(o);
							break;
						case 1:
							var s = { type: i.WEBIM_CONNCTION_USER_REMOVED };
							(r.logOut = !0), r.onError(s);
							break;
						case 2:
							s = { type: i.WEBIM_CONNCTION_USER_LOGIN_ANOTHER_DEVICE };
							(r.logOut = !0), r.onError(s);
							break;
						case 3:
							s = { type: i.WEBIM_CONNCTION_USER_KICKED_BY_CHANGE_PASSWORD };
							(r.logOut = !0), r.onError(s);
							break;
						case 4:
							s = { type: i.WEBIM_CONNCTION_USER_KICKED_BY_OTHER_DEVICE };
							(r.logOut = !0), r.onError(s);
					}
				};
			t.default = s;
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			let n;
				const i = o(r(59));
				const s = o(r(30));
				const a = o(r(7));
				const u = o(r(35));
				const c = (0, a.default)();
				const l =
					((n = {
						mr_cache: [],
						_fetchMessages: function (e, t) {
							const r = e.accessToken || t.context.accessToken;
							if (t._utils.isCanSetRequestHeader)
								if (r) {
									const o = t.apiUrl;
										const n = t.context.appName;
										const i = t.context.orgName;
									if (!n || !i) return void t.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
									if (!e.queue) return void t.onError({ type: '', msg: 'queue is not specified' });
									const a = e.queue;
										const l = this.mr_cache[a] || (this.mr_cache[a] = { msgs: [] });
										const p = t.context.userId;
										let f = -1;
									if (l.msgs.length >= e.count || l.is_last)
										return void (typeof e.success === 'function' && e.success(l));
									l && l.next_key && (f = l.next_key);
									const h = { queue: a + (e.isGroup ? '@conference.easemob.com' : '@easemob.com'), start: f, end: -1 };
										const d = {
											url: o + '/' + i + '/' + n + '/users/' + p + '/messageroaming',
											dataType: 'json',
											type: 'POST',
											headers: { Authorization: 'Bearer ' + r },
											data: JSON.stringify(h),
											success:
												function (r, o) {
													if (r && r.data) {
														const n = r.data;
														if (!r.data.msgs)
															return (
																typeof e.success === 'function' && e.success(l), (l.is_last = !0), void (l.next_key = '')
															);
														const i = n.msgs;
															const a = i.length;
														(l.is_last = n.is_last), (l.next_key = n.next_key);
														const c = function (e) {
															for (var r = [], o = 0, n = (e = u.default.atob(e)).length; o < n; ++o)
																r.push(e.charCodeAt(o));
															let i = t.context.root.lookup('easemob.pb.Meta');
															if ((i = i.decode(r)).ns == 1)
																return (0, s.default)(i, { errorCode: 0, reason: '' }, t, !0);
														};
														try {
															for (let p = 0; p < a; p++) {
																const f = c(i[p].msg);
																f && l.msgs.push(f);
															}
														} catch (e) {
															console.log(e);
														} finally {
															typeof e.success === 'function' && e.success(l);
														}
													}
												} || t._utils.emptyfn,
											error:
												function (e, r) {
													e.error &&
														e.error_description &&
														t.onError({
															type: c.WEBIM_CONNCTION_LOAD_CHATROOM_ERROR,
															msg: e.error_description,
															data: e
														});
												} || t._utils.emptyfn
										};
									t._utils.ajax(d);
								} else t.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
							else t.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
						},
						fetchHistoryMessages: function (e) {
							const t = this;
							if (e.queue) {
								const r = e.count || 20;
								!(function o() {
									t._fetchMessages(
										{
											count: r,
											isGroup: !!e.isGroup,
											queue: e.queue,
											success: function (n) {
												n.msgs.length >= r || n.is_last
													? e.success && e.success(t._utils.reverse(n.msgs.splice(0, r)))
													: o();
											},
											fail: function () {}
										},
										t
									);
								})();
							} else t.onError({ type: '', msg: 'queue is not specified' });
						},
						getChatRooms: function (e) {
							const t = this;
								const r = e.accessToken || this.context.accessToken;
							if (t._utils.isCanSetRequestHeader)
								if (r) {
									const o = e.apiUrl;
										const n = this.context.appName;
										const i = this.context.orgName;
									if (!n || !i) return void t.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
									const s = {
										url: o + '/' + i + '/' + n + '/chatrooms',
										dataType: 'json',
										type: 'GET',
										headers: { Authorization: 'Bearer ' + r },
										data: { pagenum: parseInt(e.pagenum) || 1, pagesize: parseInt(e.pagesize) || 20 },
										success:
											function (t, r) {
												typeof e.success === 'function' && e.success(t);
											} || t._utils.emptyfn,
										error:
											function (e, r, o) {
												e.error &&
													e.error_description &&
													t.onError({
														type: c.WEBIM_CONNCTION_LOAD_CHATROOM_ERROR,
														msg: e.error_description,
														data: e,
														xhr: r
													});
											} || t._utils.emptyfn
									};
									t._utils.ajax(s);
								} else t.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
							else t.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
						},
						joinChatRoom: function (e) {
							e = e || {};
							if (this._utils.isCanSetRequestHeader) {
								var t = this;
									const r = e.accessToken || this.token;
								if (r) {
									const o = e.apiUrl || this.apiUrl;
										const n = this.context.appName;
										const i = this.context.orgName;
										const s = e.roomId;
										const a = e.message || '';
									if (!n || !i) return void t.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
									const u = {
										url: o + '/' + i + '/' + n + '/chatrooms/' + s + '/apply',
										dataType: 'json',
										type: 'POST',
										data: JSON.stringify({ message: a }),
										headers: { Authorization: 'Bearer ' + r, 'Content-Type': 'application/json' },
										success:
											function (t, r) {
												typeof e.success === 'function' && e.success(t);
											} || t._utils.emptyfn,
										error:
											function (t, r, o) {
												typeof e.error === 'function' && e.error(t);
											} || t._utils.emptyfn
									};
									t._utils.ajax(u);
								} else t.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
							} else t.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
						},
						quitChatRoom: function (e) {
							e = e || {};
							if (this._utils.isCanSetRequestHeader) {
								var t = this;
									const r = e.accessToken || this.token;
								if (r) {
									const o = e.apiUrl || this.apiUrl;
										const n = this.context.appName;
										const i = this.context.orgName;
										const s = e.roomId;
									if (!n || !i) return void t.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
									const a = {
										url: o + '/' + i + '/' + n + '/chatrooms/' + s + '/quit',
										dataType: 'json',
										type: 'DELETE',
										headers: { Authorization: 'Bearer ' + r },
										success:
											function (t, r) {
												typeof e.success === 'function' && e.success(t);
											} || t._utils.emptyfn,
										error:
											function (t, r, o) {
												typeof e.error === 'function' && e.error(t);
											} || t._utils.emptyfn
									};
									t._utils.ajax(a);
								} else t.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
							} else t.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
						},
						createGroupNew: function (e) {
							(e.data.owner = this.user), (e.data.invite_need_confirm = !1);
							const t = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups',
								dataType: 'json',
								type: 'POST',
								data: JSON.stringify(e.data),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(t.success = function (t) {
								e.success(t), this.onCreateGroup(t);
							}.bind(this)),
								(t.error = e.error || this._utils.emptyfn),
								this._utils.ajax(t);
						},
						blockGroup: function (e) {
							let t = e.groupId;
							t = 'notification_ignore_' + t;
							const r = { entities: [] };
							(r.entities[0] = {}), (r.entities[0][t] = !0);
							const o = {
								type: 'PUT',
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/users/' + this.user,
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(o.success = e.success || this._utils.emptyfn),
								(o.error = e.error || this._utils.emptyfn),
								this._utils.ajax(o);
						},
						listGroups: function (e) {
							const t = [];
							if (((t.limit = e.limit), (t.cursor = e.cursor), t.cursor || delete t.cursor, isNaN(e.limit)))
								throw 'The parameter "limit" should be a number';
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/publicchatgroups',
								type: 'GET',
								dataType: 'json',
								data: t,
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(r.success = e.success || this._utils.emptyfn),
								(r.error = e.error || this._utils.emptyfn),
								this._utils.ajax(r);
						},
						getGroup: function (e) {
							const t = {
								url:
									this.apiUrl + '/' + this.orgName + '/' + this.appName + '/users/' + this.user + '/joined_chatgroups',
								dataType: 'json',
								type: 'GET',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(t.success = e.success || this._utils.emptyfn),
								(t.error = e.error || this._utils.emptyfn),
								this._utils.ajax(t);
						},
						changeOwner: function (e) {
							const t = { newowner: e.newOwner };
								const r = {
									url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + e.groupId,
									type: 'PUT',
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
									data: JSON.stringify(t)
								};
							(r.success = e.success || this._utils.emptyfn),
								(r.error = e.error || this._utils.emptyfn),
								this._utils.ajax(r);
						},
						getGroupInfo: function (e) {
							const t = {
								url:
									this.apiUrl +
									'/' +
									this.orgName +
									'/' +
									this.appName +
									'/chatgroups/' +
									e.groupId +
									'?joined_time=true',
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(t.success = e.success || this._utils.emptyfn),
								(t.error = e.error || this._utils.emptyfn),
								this._utils.ajax(t);
						},
						modifyGroup: function (e) {
							const t = e.groupId;
								const r = { groupname: e.groupName, description: e.description };
								const o = {
									url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t,
									type: 'PUT',
									data: JSON.stringify(r),
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
								};
							(o.success = e.success || this._utils.emptyfn),
								(o.error = e.error || this._utils.emptyfn),
								this._utils.ajax(o);
						},
						listGroupMember: function (e) {
							if (isNaN(e.pageNum) || e.pageNum <= 0) throw 'The parameter "pageNum" should be a positive number';
							if (isNaN(e.pageSize) || e.pageSize <= 0) throw 'The parameter "pageSize" should be a positive number';
							if (e.groupId === null && void 0 === e.groupId) throw 'The parameter "groupId" should be added';
							const t = [];
								const r = e.groupId;
							(t.pagenum = e.pageNum), (t.pagesize = e.pageSize);
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + r + '/users',
								dataType: 'json',
								type: 'GET',
								data: t,
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
							(o.success = e.success || this._utils.emptyfn),
								(o.error = e.error || this._utils.emptyfn),
								this._utils.ajax(o);
						}
					}),
					(0, i.default)(n, 'listGroupMember', function (e) {
						if (isNaN(e.pageNum) || e.pageNum <= 0) throw 'The parameter "pageNum" should be a positive number';
						if (isNaN(e.pageSize) || e.pageSize <= 0) throw 'The parameter "pageSize" should be a positive number';
						if (e.groupId === null && void 0 === e.groupId) throw 'The parameter "groupId" should be added';
						const t = [];
							const r = e.groupId;
						(t.pagenum = e.pageNum), (t.pagesize = e.pageSize);
						const o = {
							url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + r + '/users',
							dataType: 'json',
							type: 'GET',
							data: t,
							headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
						};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'listChatRoomMember', function (e) {
						if (isNaN(e.pageNum) || e.pageNum <= 0) throw 'The parameter "pageNum" should be a positive number';
						if (isNaN(e.pageSize) || e.pageSize <= 0) throw 'The parameter "pageSize" should be a positive number';
						if (e.chatRoomId === null && void 0 === e.chatRoomId) throw 'The parameter "chatRoomId" should be added';
						const t = [];
							const r = e.chatRoomId;
						(t.pagenum = e.pageNum), (t.pagesize = e.pageSize);
						const o = {
							url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + r + '/users',
							dataType: 'json',
							type: 'GET',
							data: t,
							headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
						};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'getGroupAdmin', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/admin',
								dataType: 'json',
								type: 'GET',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'setAdmin', function (e) {
						const t = e.groupId;
							const r = { newadmin: e.username };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/admin',
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeAdmin', function (e) {
						const t = e.groupId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/admin/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'dissolveGroup', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '?version=v3',
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'quitGroup', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/quit',
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'inviteToGroup', function (e) {
						const t = e.groupId;
							const r = { usernames: e.users };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/invite',
								type: 'POST',
								data: JSON.stringify(r),
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'joinGroup', function (e) {
						const t = {
							url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + e.groupId + '/apply',
							type: 'POST',
							dataType: 'json',
							data: JSON.stringify({ message: 'join group' }),
							headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
						};
						(t.success = e.success || this._utils.emptyfn),
							(t.error = e.error || this._utils.emptyfn),
							this._utils.ajax(t);
					}),
					(0, i.default)(n, 'agreeJoinGroup', function (e) {
						const t = e.groupId;
							const r = { applicant: e.applicant, verifyResult: !0, reason: 'no clue' };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/apply_verify',
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'rejectJoinGroup', function (e) {
						const t = e.groupId;
							const r = { applicant: e.applicant, verifyResult: !1, reason: 'no clue' };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/apply_verify',
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'agreeInviteIntoGroup', function (e) {
						const t = e.groupId;
							const r = { invitee: e.invitee, verifyResult: !0 };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/invite_verify',
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'rejectInviteIntoGroup', function (e) {
						const t = e.groupId;
							const r = { invitee: e.invitee, verifyResult: !1 };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/invite_verify',
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(r),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeSingleGroupMember', function (e) {
						const t = e.groupId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeMultiGroupMember', function (e) {
						const t = e.groupId;
							const r = e.users.join(',');
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'mute', function (e) {
						const t = e.groupId;
							const r = { usernames: [e.username], mute_duration: e.muteDuration };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/mute',
								dataType: 'json',
								type: 'POST',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
								data: JSON.stringify(r)
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'muteChatRoomMember', function (e) {
						const t = e.chatRoomId;
							const r = { usernames: [e.username], mute_duration: e.muteDuration };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/mute',
								dataType: 'json',
								type: 'POST',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' },
								data: JSON.stringify(r)
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeMute', function (e) {
						const t = e.groupId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/mute/' + r,
								dataType: 'json',
								type: 'DELETE',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeMuteChatRoomMember', function (e) {
						const t = e.chatRoomId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/mute/' + r,
								dataType: 'json',
								type: 'DELETE',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'getMuted', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/mute',
								dataType: 'json',
								type: 'GET',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'getChatRoomMuted', function (e) {
						const t = e.chatRoomId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/mute',
								dataType: 'json',
								type: 'GET',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'groupBlockSingle', function (e) {
						const t = e.groupId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/blocks/users/' + r,
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'chatRoomBlockSingle', function (e) {
						const t = e.chatRoomId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/blocks/users/' + r,
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'groupBlockMulti', function (e) {
						const t = e.groupId;
							const r = { usernames: e.usernames };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/blocks/users',
								data: JSON.stringify(r),
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'chatRoomBlockMulti', function (e) {
						const t = e.chatRoomId;
							const r = { usernames: e.usernames };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/blocks/users',
								data: JSON.stringify(r),
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeGroupBlockSingle', function (e) {
						const t = e.groupId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/blocks/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeChatRoomBlockSingle', function (e) {
						const t = e.chatRoomId;
							const r = e.username;
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/blocks/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeGroupBlockMulti', function (e) {
						const t = e.groupId;
							const r = e.usernames.join(',');
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/blocks/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'removeChatRoomBlockMulti', function (e) {
						const t = e.chatRoomId;
							const r = e.usernames.join(',');
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/blocks/users/' + r,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'getGroupBlacklistNew', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/blocks/users',
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'getChatRoomBlacklistNew', function (e) {
						const t = e.chatRoomId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/blocks/users',
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'disableSendGroupMsg', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/ban',
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'disableSendChatRoomMsg', function (e) {
						const t = e.chatRoomId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/ban',
								type: 'POST',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'enableSendGroupMsg', function (e) {
						const t = e.groupId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/ban',
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'enableSendChatRoomMsg', function (e) {
						const t = e.chatRoomId;
							const r = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/ban',
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'addUsersToGroupWhitelist', function (e) {
						const t = e.groupId;
							const r = { usernames: e.users };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/white/users',
								type: 'POST',
								data: JSON.stringify(r),
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'addUsersToChatRoomWhitelist', function (e) {
						const t = e.chatRoomId;
							const r = { usernames: e.users };
							const o = {
								url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/white/users',
								type: 'POST',
								data: JSON.stringify(r),
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(o.success = e.success || this._utils.emptyfn),
							(o.error = e.error || this._utils.emptyfn),
							this._utils.ajax(o);
					}),
					(0, i.default)(n, 'rmUsersFromGroupWhitelist', function (e) {
						const t = e.groupId;
							const r = {
								url:
									this.apiUrl +
									'/' +
									this.orgName +
									'/' +
									this.appName +
									'/chatgroups/' +
									t +
									'/white/users/' +
									e.userName,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'rmUsersFromChatRoomWhitelist', function (e) {
						const t = e.chatRoomId;
							const r = {
								url:
									this.apiUrl +
									'/' +
									this.orgName +
									'/' +
									this.appName +
									'/chatrooms/' +
									t +
									'/white/users/' +
									e.userName,
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'getGroupWhitelist', function (e) {
						const t = e.groupId;
							const r =
								(e.users,
								{
									url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatgroups/' + t + '/white/users',
									type: 'GET',
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
								});
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'getChatRoomWhitelist', function (e) {
						const t = e.chatRoomId;
							const r =
								(e.users,
								{
									url: this.apiUrl + '/' + this.orgName + '/' + this.appName + '/chatrooms/' + t + '/white/users',
									type: 'GET',
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
								});
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'isGroupWhiteUser', function (e) {
						const t = e.groupId;
							const r =
								(e.users,
								{
									url:
										this.apiUrl +
										'/' +
										this.orgName +
										'/' +
										this.appName +
										'/chatgroups/' +
										t +
										'/white/users/' +
										e.userName,
									type: 'GET',
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
								});
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'isChatRoomWhiteUser', function (e) {
						const t = e.chatRoomId;
							const r =
								(e.users,
								{
									url:
										this.apiUrl +
										'/' +
										this.orgName +
										'/' +
										this.appName +
										'/chatrooms/' +
										t +
										'/white/users/' +
										e.userName,
									type: 'GET',
									dataType: 'json',
									headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
								});
						(r.success = e.success || this._utils.emptyfn),
							(r.error = e.error || this._utils.emptyfn),
							this._utils.ajax(r);
					}),
					(0, i.default)(n, 'getGroupMsgReadUser', function (e) {
						const t = this;
						e = e || {};
						if (this._utils.isCanSetRequestHeader) {
							const r = e.accessToken || this.token;
							if (r) {
								const o = t.apiUrl;
									const n = t.context.appName;
									const i = t.context.orgName;
								if (!n || !i) return void t.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
								const s = {
									url: o + '/' + i + '/' + n + '/chatgroups/' + e.groupId + '/acks/' + e.msgId,
									dataType: 'json',
									type: 'GET',
									data: { limit: 500, key: void 0 },
									headers: { Authorization: 'Bearer ' + r },
									success:
										function (t) {
											typeof e.success === 'function' && e.success(t);
										} || this._utils.emptyfn,
									error:
										function (t) {
											typeof e.error === 'function' && e.error(t);
										} || this._utils.emptyfn
								};
								this._utils.ajax(s);
							} else t.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
						} else conn.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
					}),
					(0, i.default)(n, 'getBlacklist', function (e) {
						const t = this;
						e = e || {};
						if (this._utils.isCanSetRequestHeader) {
							var r = this;
								const o = e.accessToken || this.token;
							if (o) {
								const n = e.apiUrl || this.apiUrl;
									const i = this.context.appName;
									const s = this.context.orgName;
								if (!i || !s) return void r.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
								const a = {
									url: n + '/' + s + '/' + i + '/users/' + this.user + '/blocks/users',
									dataType: 'json',
									type: 'GET',
									headers: { Authorization: 'Bearer ' + o },
									success:
										function (r, o) {
											const n = {};
											r.data.forEach(function (e, t) {
												n[e] = { name: e };
											}),
												t.onBlacklistUpdate(n),
												typeof e.success === 'function' && e.success(r);
										} || this._utils.emptyfn,
									error:
										function (r, o, n) {
											t.onBlacklistUpdate([]), typeof e.error === 'function' && e.error(r);
										} || this._utils.emptyfn
								};
								this._utils.ajax(a);
							} else r.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
						} else r.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
					}),
					(0, i.default)(n, 'getRoster', function (e) {
						e = e || {};
						const t = this;
						if (this._utils.isCanSetRequestHeader) {
							var r = this;
								const o = e.accessToken || this.token;
							if (o) {
								const n = e.apiUrl || this.apiUrl;
									const i = this.context.appName;
									const s = this.context.orgName;
								if (!i || !s) return void r.onError({ type: c.WEBIM_CONNCTION_AUTH_ERROR });
								const a = {
									url: n + '/' + s + '/' + i + '/users/' + this.user + '/contacts/users',
									dataType: 'json',
									type: 'GET',
									headers: { Authorization: 'Bearer ' + o },
									success:
										function (r, o) {
											const n = [];
											r.data.forEach(function (e, r) {
												n.push({ name: e, subscription: 'both', jid: t.context.jid });
											}),
												typeof e.success === 'function' && e.success(n),
												t.onRoster && t.onRoster(n);
										} || this._utils.emptyfn,
									error:
										function (t, r, o) {
											typeof e.error === 'function' && e.error(t);
										} || this._utils.emptyfn
								};
								this._utils.ajax(a);
							} else r.onError({ type: c.WEBIM_CONNCTION_TOKEN_NOT_ASSIGN_ERROR });
						} else r.onError({ type: c.WEBIM_CONNCTION_NOT_SUPPORT_CHATROOM_ERROR });
					}),
					(0, i.default)(n, 'fetchGroupAnnouncement', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
							const i = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/announcement'),
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(i.success = e.success || this._utils.emptyfn),
							(i.error = e.error || this._utils.emptyfn),
							this._utils.ajax(i);
					}),
					(0, i.default)(n, 'fetchChatRoomAnnouncement', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
							const i = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/announcement'),
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(i.success = e.success || this._utils.emptyfn),
							(i.error = e.error || this._utils.emptyfn),
							this._utils.ajax(i);
					}),
					(0, i.default)(n, 'updateGroupAnnouncement', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
							const i = { announcement: e.announcement };
							const s = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/announcement'),
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(i),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(s.success = e.success || this._utils.emptyfn),
							(s.error = e.error || this._utils.emptyfn),
							this._utils.ajax(s);
					}),
					(0, i.default)(n, 'updateChatRoomAnnouncement', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
							const i = { announcement: e.announcement };
							const s = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/announcement'),
								type: 'POST',
								dataType: 'json',
								data: JSON.stringify(i),
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(s.success = e.success || this._utils.emptyfn),
							(s.error = e.error || this._utils.emptyfn),
							this._utils.ajax(s);
					}),
					(0, i.default)(n, 'uploadGroupSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
						this._utils.uploadFile({
							uploadUrl: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/share_files'),
							onFileUploadProgress: e.onFileUploadProgress,
							onFileUploadComplete: e.onFileUploadComplete,
							onFileUploadError: e.onFileUploadError,
							onFileUploadCanceled: e.onFileUploadCanceled,
							accessToken: this.token,
							apiUrl: t,
							file: e.file,
							appKey: this.context.appKey
						});
					}),
					(0, i.default)(n, 'uploadChatRoomSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
						this._utils.uploadFile({
							uploadUrl: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/share_files'),
							onFileUploadProgress: e.onFileUploadProgress,
							onFileUploadComplete: e.onFileUploadComplete,
							onFileUploadError: e.onFileUploadError,
							onFileUploadCanceled: e.onFileUploadCanceled,
							accessToken: this.token,
							apiUrl: t,
							file: e.file,
							appKey: this.context.appKey
						});
					}),
					(0, i.default)(n, 'deleteGroupSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
							const i = e.fileId;
							const s = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/share_files/').concat(i),
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(s.success = e.success || this._utils.emptyfn),
							(s.error = e.error || this._utils.emptyfn),
							this._utils.ajax(s);
					}),
					(0, i.default)(n, 'deleteChatRoomSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
							const i = e.fileId;
							const s = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/share_files/').concat(i),
								type: 'DELETE',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(s.success = e.success || this._utils.emptyfn),
							(s.error = e.error || this._utils.emptyfn),
							this._utils.ajax(s);
					}),
					(0, i.default)(n, 'downloadGroupSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
							const i = e.fileId;
						this._utils.download.call(this, {
							url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/share_files/').concat(i),
							onFileDownloadComplete: e.onFileDownloadComplete,
							onFileDownloadError: e.onFileDownloadError,
							accessToken: this.token,
							id: i,
							secret: ''
						});
					}),
					(0, i.default)(n, 'downloadChatRoomSharedFile', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
							const i = e.fileId;
						this._utils.download.call(this, {
							url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/share_files/').concat(i),
							onFileDownloadComplete: e.onFileDownloadComplete,
							onFileDownloadError: e.onFileDownloadError,
							accessToken: this.token,
							id: i,
							secret: ''
						});
					}),
					(0, i.default)(n, 'fetchGroupSharedFileList', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.groupId;
							const i = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatgroups/').concat(n, '/share_files'),
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(i.success = e.success || this._utils.emptyfn),
							(i.error = e.error || this._utils.emptyfn),
							this._utils.ajax(i);
					}),
					(0, i.default)(n, 'fetchChatRoomSharedFileList', function (e) {
						const t = e.apiUrl || this.apiUrl;
							const r = this.context.appName;
							const o = this.context.orgName;
							const n = e.roomId;
							const i = {
								url: ''.concat(t, '/').concat(o, '/').concat(r, '/chatrooms/').concat(n, '/share_files'),
								type: 'GET',
								dataType: 'json',
								headers: { Authorization: 'Bearer ' + this.token, 'Content-Type': 'application/json' }
							};
						(i.success = e.success || this._utils.emptyfn),
							(i.error = e.error || this._utils.emptyfn),
							this._utils.ajax(i);
					}),
					n);
			t.default = l;
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e, t, r) {
				return (
					t in e
						? Object.defineProperty(e, t, { value: r, enumerable: !0, configurable: !0, writable: !0 })
						: (e[t] = r),
					e
				);
			};
		},
		function (e, t, r) {
			'use strict';
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const o = function () {
				return {
					nested: {
						easemob: {
							nested: {
								pb: {
									nested: {
										MessageBody: {
											fields: {
												type: { type: 'Type', id: 1 },
												from: { type: 'JID', id: 2 },
												to: { type: 'JID', id: 3 },
												contents: { rule: 'repeated', type: 'Content', id: 4 },
												ext: { rule: 'repeated', type: 'KeyValue', id: 5 },
												ackMessageId: { type: 'uint64', id: 6 },
												msgConfig: { type: 'MessageConfig', id: 7 },
												ackContent: { type: 'string', id: 8 }
											},
											nested: {
												Content: {
													fields: {
														type: { type: 'Type', id: 1 },
														text: { type: 'string', id: 2 },
														latitude: { type: 'double', id: 3 },
														longitude: { type: 'double', id: 4 },
														address: { type: 'string', id: 5 },
														displayName: { type: 'string', id: 6 },
														remotePath: { type: 'string', id: 7 },
														secretKey: { type: 'string', id: 8 },
														fileLength: { type: 'int32', id: 9 },
														action: { type: 'string', id: 10 },
														params: { rule: 'repeated', type: 'KeyValue', id: 11 },
														duration: { type: 'int32', id: 12 },
														size: { type: 'Size', id: 13 },
														thumbnailRemotePath: { type: 'string', id: 14 },
														thumbnailSecretKey: { type: 'string', id: 15 },
														thumbnailDisplayName: { type: 'string', id: 16 },
														thumbnailFileLength: { type: 'int32', id: 17 },
														thumbnailSize: { type: 'Size', id: 18 },
														customEvent: { type: 'string', id: 19 },
														customExts: { rule: 'repeated', type: 'KeyValue', id: 20 }
													},
													nested: {
														Type: {
															values: {
																TEXT: 0,
																IMAGE: 1,
																VIDEO: 2,
																LOCATION: 3,
																VOICE: 4,
																FILE: 5,
																COMMAND: 6,
																CUSTOM: 7
															}
														},
														Size: { fields: { width: { type: 'double', id: 1 }, height: { type: 'double', id: 2 } } }
													}
												},
												Type: {
													values: {
														NORMAL: 0,
														CHAT: 1,
														GROUPCHAT: 2,
														CHATROOM: 3,
														READ_ACK: 4,
														DELIVER_ACK: 5,
														RECALL: 6
													}
												},
												MessageConfig: { fields: { allowGroupAck: { type: 'bool', id: 1 } } }
											}
										},
										KeyValue: {
											oneofs: { value: { oneof: ['varintValue', 'floatValue', 'doubleValue', 'stringValue'] } },
											fields: {
												key: { type: 'string', id: 1 },
												type: { type: 'ValueType', id: 2 },
												varintValue: { type: 'int64', id: 3 },
												floatValue: { type: 'float', id: 4 },
												doubleValue: { type: 'double', id: 5 },
												stringValue: { type: 'string', id: 6 }
											},
											nested: {
												ValueType: {
													values: { BOOL: 1, INT: 2, UINT: 3, LLINT: 4, FLOAT: 5, DOUBLE: 6, STRING: 7, JSON_STRING: 8 }
												}
											}
										},
										JID: {
											fields: {
												appKey: { type: 'string', id: 1 },
												name: { type: 'string', id: 2 },
												domain: { type: 'string', id: 3 },
												clientResource: { type: 'string', id: 4 }
											}
										},
										ConferenceBody: {
											fields: {
												sessionId: { type: 'string', id: 1 },
												operation: { type: 'Operation', id: 2 },
												conferenceId: { type: 'string', id: 3 },
												type: { type: 'Type', id: 4 },
												content: { type: 'string', id: 5 },
												network: { type: 'string', id: 6 },
												version: { type: 'string', id: 7 },
												identity: { type: 'Identity', id: 8 },
												duration: { type: 'string', id: 9 },
												peerName: { type: 'string', id: 10 },
												endReason: { type: 'EndReason', id: 11 },
												status: { type: 'Status', id: 12 },
												isDirect: { type: 'bool', id: 13 },
												controlType: { type: 'StreamControlType', id: 14 },
												routeFlag: { type: 'int32', id: 15 },
												routeKey: { type: 'string', id: 16 }
											},
											nested: {
												Status: { fields: { errorCode: { type: 'int32', id: 1 } } },
												Operation: {
													values: {
														JOIN: 0,
														INITIATE: 1,
														ACCEPT_INITIATE: 2,
														ANSWER: 3,
														TERMINATE: 4,
														REMOVE: 5,
														STREAM_CONTROL: 6,
														MEDIA_REQUEST: 7
													}
												},
												Type: { values: { VOICE: 0, VIDEO: 1 } },
												Identity: { values: { CALLER: 0, CALLEE: 1 } },
												EndReason: {
													values: { HANGUP: 0, NORESPONSE: 1, REJECT: 2, BUSY: 3, FAIL: 4, UNSUPPORTED: 5, OFFLINE: 6 }
												},
												StreamControlType: {
													values: { PAUSE_VOICE: 0, RESUME_VOICE: 1, PAUSE_VIDEO: 2, RESUME_VIDEO: 3 }
												}
											}
										},
										MSync: {
											fields: {
												version: { type: 'Version', id: 1, options: { default: 'MSYNC_V1' } },
												guid: { type: 'JID', id: 2 },
												auth: { type: 'string', id: 3 },
												compressAlgorimth: { type: 'uint32', id: 4 },
												crypto: { type: 'uint32', id: 5 },
												userAgent: { type: 'string', id: 6 },
												pov: { type: 'uint64', id: 7 },
												command: { type: 'Command', id: 8 },
												deviceId: { type: 'uint32', id: 10 },
												encryptType: { rule: 'repeated', type: 'EncryptType', id: 11, options: { packed: !1 } },
												encryptKey: { type: 'string', id: 12 },
												payload: { type: 'bytes', id: 9 }
											},
											nested: {
												Version: { values: { MSYNC_V1: 0, MSYNC_V2: 1 } },
												Command: { values: { SYNC: 0, UNREAD: 1, NOTICE: 2, PROVISION: 3 } }
											}
										},
										EncryptType: { values: { ENCRYPT_NONE: 0, ENCRYPT_AES_128_CBC: 1, ENCRYPT_AES_256_CBC: 2 } },
										CommSyncUL: {
											fields: {
												meta: { type: 'Meta', id: 1 },
												key: { type: 'uint64', id: 2 },
												queue: { type: 'JID', id: 3 },
												isRoam: { type: 'bool', id: 4 },
												lastFullRoamKey: { type: 'uint64', id: 5 }
											}
										},
										CommSyncDL: {
											fields: {
												status: { type: 'Status', id: 1 },
												metaId: { type: 'uint64', id: 2 },
												serverId: { type: 'uint64', id: 3 },
												metas: { rule: 'repeated', type: 'Meta', id: 4 },
												nextKey: { type: 'uint64', id: 5 },
												queue: { type: 'JID', id: 6 },
												isLast: { type: 'bool', id: 7 },
												timestamp: { type: 'uint64', id: 8 },
												isRoam: { type: 'bool', id: 9 }
											}
										},
										CommNotice: { fields: { queue: { type: 'JID', id: 1 } } },
										CommUnreadUL: { fields: {} },
										CommUnreadDL: {
											fields: {
												status: { type: 'Status', id: 1 },
												unread: { rule: 'repeated', type: 'MetaQueue', id: 2 },
												timestamp: { type: 'uint64', id: 3 }
											}
										},
										MetaQueue: { fields: { queue: { type: 'JID', id: 1 }, n: { type: 'uint32', id: 2 } } },
										Meta: {
											fields: {
												id: { type: 'uint64', id: 1 },
												from: { type: 'JID', id: 2 },
												to: { type: 'JID', id: 3 },
												timestamp: { type: 'uint64', id: 4 },
												ns: { type: 'NameSpace', id: 5 },
												payload: { type: 'bytes', id: 6 },
												routetype: { type: 'RouteType', id: 7 }
											},
											nested: {
												NameSpace: { values: { STATISTIC: 0, CHAT: 1, MUC: 2, ROSTER: 3, CONFERENCE: 4 } },
												RouteType: { values: { ROUTE_ALL: 0, ROUTE_ONLINE: 1 } }
											}
										},
										Status: {
											fields: {
												errorCode: { type: 'ErrorCode', id: 1 },
												reason: { type: 'string', id: 2 },
												redirectInfo: { rule: 'repeated', type: 'RedirectInfo', id: 3 }
											},
											nested: {
												ErrorCode: {
													values: {
														OK: 0,
														FAIL: 1,
														UNAUTHORIZED: 2,
														MISSING_PARAMETER: 3,
														WRONG_PARAMETER: 4,
														REDIRECT: 5,
														TOKEN_EXPIRED: 6,
														PERMISSION_DENIED: 7,
														NO_ROUTE: 8,
														UNKNOWN_COMMAND: 9,
														PB_PARSER_ERROR: 10,
														BIND_ANOTHER_DEVICE: 11,
														IM_FORBIDDEN: 12,
														TOO_MANY_DEVICES: 13,
														PLATFORM_LIMIT: 14,
														USER_MUTED: 15,
														ENCRYPT_DISABLE: 16,
														ENCRYPT_ENABLE: 17,
														DECRYPT_FAILURE: 18
													}
												}
											}
										},
										RedirectInfo: { fields: { host: { type: 'string', id: 1 }, port: { type: 'uint32', id: 2 } } },
										Provision: {
											fields: {
												osType: { type: 'OsType', id: 1 },
												version: { type: 'string', id: 2 },
												networkType: { type: 'NetworkType', id: 3 },
												appSign: { type: 'string', id: 4 },
												compressType: { rule: 'repeated', type: 'CompressType', id: 5, options: { packed: !1 } },
												encryptType: { rule: 'repeated', type: 'EncryptType', id: 6, options: { packed: !1 } },
												encryptKey: { type: 'string', id: 7 },
												status: { type: 'Status', id: 8 },
												deviceUuid: { type: 'string', id: 9 },
												isManualLogin: { type: 'bool', id: 10 },
												password: { type: 'string', id: 11 },
												deviceName: { type: 'string', id: 12 },
												resource: { type: 'string', id: 13 },
												auth: { type: 'string', id: 14 }
											},
											nested: {
												OsType: {
													values: { OS_IOS: 0, OS_ANDROID: 1, OS_LINUX: 2, OS_OSX: 3, OS_WIN: 4, OS_OTHER: 16 }
												},
												NetworkType: {
													values: {
														NETWORK_NONE: 0,
														NETWORK_WIFI: 1,
														NETWORK_4G: 2,
														NETWORK_3G: 3,
														NETWORK_2G: 4,
														NETWORK_WIRE: 5
													}
												},
												CompressType: { values: { COMPRESS_NONE: 0, COMPRESS_ZLIB: 1 } }
											}
										},
										MUCBody: {
											fields: {
												mucId: { type: 'JID', id: 1 },
												operation: { type: 'Operation', id: 2 },
												from: { type: 'JID', id: 3 },
												to: { rule: 'repeated', type: 'JID', id: 4 },
												setting: { type: 'Setting', id: 5 },
												reason: { type: 'string', id: 6 },
												isChatroom: { type: 'bool', id: 7 },
												status: { type: 'Status', id: 8 }
											},
											nested: {
												Operation: {
													values: {
														CREATE: 0,
														DESTROY: 1,
														JOIN: 2,
														LEAVE: 3,
														APPLY: 4,
														APPLY_ACCEPT: 5,
														APPLY_DECLINE: 6,
														INVITE: 7,
														INVITE_ACCEPT: 8,
														INVITE_DECLINE: 9,
														KICK: 10,
														GET_BLACKLIST: 11,
														BAN: 12,
														ALLOW: 13,
														UPDATE: 14,
														BLOCK: 15,
														UNBLOCK: 16,
														PRESENCE: 17,
														ABSENCE: 18,
														DIRECT_JOINED: 19,
														ASSIGN_OWNER: 20,
														ADD_ADMIN: 21,
														REMOVE_ADMIN: 22,
														ADD_MUTE: 23,
														REMOVE_MUTE: 24,
														UPDATE_ANNOUNCEMENT: 25,
														DELETE_ANNOUNCEMENT: 26,
														UPLOAD_FILE: 27,
														DELETE_FILE: 28,
														ADD_USER_WHITE_LIST: 29,
														REMOVE_USER_WHITE_LIST: 30,
														BAN_GROUP: 31,
														REMOVE_BAN_GROUP: 32
													}
												},
												Setting: {
													fields: {
														name: { type: 'string', id: 1 },
														desc: { type: 'string', id: 2 },
														type: { type: 'Type', id: 3 },
														maxUsers: { type: 'int32', id: 4 },
														owner: { type: 'string', id: 5 }
													},
													nested: {
														Type: {
															values: {
																PRIVATE_OWNER_INVITE: 0,
																PRIVATE_MEMBER_INVITE: 1,
																PUBLIC_JOIN_APPROVAL: 2,
																PUBLIC_JOIN_OPEN: 3,
																PUBLIC_ANONYMOUS: 4
															}
														}
													}
												},
												Status: {
													fields: { errorCode: { type: 'ErrorCode', id: 1 }, description: { type: 'string', id: 2 } },
													nested: {
														ErrorCode: {
															values: {
																OK: 0,
																PERMISSION_DENIED: 1,
																WRONG_PARAMETER: 2,
																MUC_NOT_EXIST: 3,
																USER_NOT_EXIST: 4,
																UNKNOWN: 5
															}
														}
													}
												}
											}
										},
										RosterBody: {
											fields: {
												operation: { type: 'Operation', id: 1 },
												status: { type: 'Status', id: 2 },
												from: { type: 'JID', id: 3 },
												to: { rule: 'repeated', type: 'JID', id: 4 },
												reason: { type: 'string', id: 5 },
												rosterVer: { type: 'string', id: 6 },
												biDirection: { type: 'bool', id: 7 }
											},
											nested: {
												Operation: {
													values: {
														GET_ROSTER: 0,
														GET_BLACKLIST: 1,
														ADD: 2,
														REMOVE: 3,
														ACCEPT: 4,
														DECLINE: 5,
														BAN: 6,
														ALLOW: 7,
														REMOTE_ACCEPT: 8,
														REMOTE_DECLINE: 9
													}
												},
												Status: {
													fields: { errorCode: { type: 'ErrorCode', id: 1 }, description: { type: 'string', id: 2 } },
													nested: {
														ErrorCode: {
															values: { OK: 0, USER_NOT_EXIST: 1, USER_ALREADY_FRIEND: 2, USER_ALREADY_BLACKLIST: 3 }
														}
													}
												}
											}
										},
										StatisticsBody: {
											fields: {
												operation: { type: 'Operation', id: 1 },
												os: { type: 'OsType', id: 2 },
												version: { type: 'string', id: 3 },
												network: { type: 'NetworkType', id: 4 },
												imTime: { type: 'uint32', id: 5 },
												chatTime: { type: 'uint32', id: 6 },
												location: { type: 'string', id: 7 }
											},
											nested: {
												Operation: {
													values: {
														INFORMATION: 0,
														USER_REMOVED: 1,
														USER_LOGIN_ANOTHER_DEVICE: 2,
														USER_KICKED_BY_CHANGE_PASSWORD: 3,
														USER_KICKED_BY_OTHER_DEVICE: 4
													}
												},
												OsType: {
													values: { OS_IOS: 0, OS_ANDROID: 1, OS_LINUX: 2, OS_OSX: 3, OS_WIN: 4, OS_OTHER: 16 }
												},
												NetworkType: {
													values: {
														NETWORK_NONE: 0,
														NETWORK_WIFI: 1,
														NETWORK_4G: 2,
														NETWORK_3G: 3,
														NETWORK_2G: 4,
														NETWORK_WIRE: 5
													}
												}
											}
										}
									}
								}
							}
						}
					}
				};
			};
			t.default = o;
		},
		,
		,
		,
		,
		function (e, t, r) {
			'use strict';
			(function (t) {
				function o(e) {
					return (o =
						typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
							? function (e) {
									return typeof e;
							  }
							: function (e) {
									return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
										? 'symbol'
										: typeof e;
							  })(e);
				}
				const n = r(107);
					const i = r(108);
					const s = /^([a-z][a-z0-9.+-]*:)?(\/\/)?([\S\s]*)/i;
					const a = /^[A-Za-z][A-Za-z0-9+-.]*:\/\//;
					const u = [
						['#', 'hash'],
						['?', 'query'],
						function (e) {
							return e.replace('\\', '/');
						},
						['/', 'pathname'],
						['@', 'auth', 1],
						[NaN, 'host', void 0, 1, 1],
						[/:(\d+)$/, 'port', void 0, 1],
						[NaN, 'hostname', void 0, 1, 1]
					];
					const c = { hash: 1, query: 1 };
				function l(e) {
					let r;
						const n =
							(typeof window !== 'undefined' ? window : void 0 !== t ? t : typeof self !== 'undefined' ? self : {})
								.location || {};
						let i = {};
						const s = o((e = e || n));
					if (e.protocol === 'blob:') i = new f(unescape(e.pathname), {});
					else if (s === 'string') for (r in ((i = new f(e, {})), c)) delete i[r];
					else if (s === 'object') {
						for (r in e) r in c || (i[r] = e[r]);
						void 0 === i.slashes && (i.slashes = a.test(e.href));
					}
					return i;
				}
				function p(e) {
					const t = s.exec(e);
					return { protocol: t[1] ? t[1].toLowerCase() : '', slashes: !!t[2], rest: t[3] };
				}
				function f(e, t, r) {
					if (!(this instanceof f)) return new f(e, t, r);
					let s;
						let a;
						let c;
						let h;
						let d;
						let y;
						const m = u.slice();
						const g = o(t);
						const v = this;
						let _ = 0;
					for (
						g !== 'object' && g !== 'string' && ((r = t), (t = null)),
							r && typeof r !== 'function' && (r = i.parse),
							t = l(t),
							s = !(a = p(e || '')).protocol && !a.slashes,
							v.slashes = a.slashes || (s && t.slashes),
							v.protocol = a.protocol || t.protocol || '',
							e = a.rest,
							a.slashes || (m[3] = [/(.*)/, 'pathname']);
						_ < m.length;
						_++
					)
						typeof (h = m[_]) !== 'function'
							? ((c = h[0]),
							  (y = h[1]),
							  c != c
									? (v[y] = e)
									: typeof c === 'string'
									? ~(d = e.indexOf(c)) &&
									  (typeof h[2] === 'number'
											? ((v[y] = e.slice(0, d)), (e = e.slice(d + h[2])))
											: ((v[y] = e.slice(d)), (e = e.slice(0, d))))
									: (d = c.exec(e)) && ((v[y] = d[1]), (e = e.slice(0, d.index))),
							  (v[y] = v[y] || (s && h[3] && t[y]) || ''),
							  h[4] && (v[y] = v[y].toLowerCase()))
							: (e = h(e));
					r && (v.query = r(v.query)),
						s &&
							t.slashes &&
							v.pathname.charAt(0) !== '/' &&
							(v.pathname !== '' || t.pathname !== '') &&
							(v.pathname = (function (e, t) {
								for (
									var r = (t || '/').split('/').slice(0, -1).concat(e.split('/')),
										o = r.length,
										n = r[o - 1],
										i = !1,
										s = 0;
									o--;

								)
									r[o] === '.'
										? r.splice(o, 1)
										: r[o] === '..'
										? (r.splice(o, 1), s++)
										: s && (o === 0 && (i = !0), r.splice(o, 1), s--);
								return i && r.unshift(''), (n !== '.' && n !== '..') || r.push(''), r.join('/');
							})(v.pathname, t.pathname)),
						n(v.port, v.protocol) || ((v.host = v.hostname), (v.port = '')),
						(v.username = v.password = ''),
						v.auth && ((h = v.auth.split(':')), (v.username = h[0] || ''), (v.password = h[1] || '')),
						(v.origin = v.protocol && v.host && v.protocol !== 'file:' ? v.protocol + '//' + v.host : 'null'),
						(v.href = v.toString());
				}
				(f.prototype = {
					set: function (e, t, r) {
						const o = this;
						switch (e) {
							case 'query':
								typeof t === 'string' && t.length && (t = (r || i.parse)(t)), (o[e] = t);
								break;
							case 'port':
								(o[e] = t),
									n(t, o.protocol) ? t && (o.host = o.hostname + ':' + t) : ((o.host = o.hostname), (o[e] = ''));
								break;
							case 'hostname':
								(o[e] = t), o.port && (t += ':' + o.port), (o.host = t);
								break;
							case 'host':
								(o[e] = t),
									/:\d+$/.test(t)
										? ((t = t.split(':')), (o.port = t.pop()), (o.hostname = t.join(':')))
										: ((o.hostname = t), (o.port = ''));
								break;
							case 'protocol':
								(o.protocol = t.toLowerCase()), (o.slashes = !r);
								break;
							case 'pathname':
							case 'hash':
								if (t) {
									const s = e === 'pathname' ? '/' : '#';
									o[e] = t.charAt(0) !== s ? s + t : t;
								} else o[e] = t;
								break;
							default:
								o[e] = t;
						}
						for (let a = 0; a < u.length; a++) {
							const c = u[a];
							c[4] && (o[c[1]] = o[c[1]].toLowerCase());
						}
						return (
							(o.origin = o.protocol && o.host && o.protocol !== 'file:' ? o.protocol + '//' + o.host : 'null'),
							(o.href = o.toString()),
							o
						);
					},
					toString: function (e) {
						(e && typeof e === 'function') || (e = i.stringify);
						let t;
							const r = this;
							let n = r.protocol;
						n && n.charAt(n.length - 1) !== ':' && (n += ':');
						let s = n + (r.slashes ? '//' : '');
						return (
							r.username && ((s += r.username), r.password && (s += ':' + r.password), (s += '@')),
							(s += r.host + r.pathname),
							(t = o(r.query) === 'object' ? e(r.query) : r.query) && (s += t.charAt(0) !== '?' ? '?' + t : t),
							r.hash && (s += r.hash),
							s
						);
					}
				}),
					(f.extractProtocol = p),
					(f.location = l),
					(f.qs = i),
					(e.exports = f);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			function o() {
				this._listeners = {};
			}
			(o.prototype.addEventListener = function (e, t) {
				e in this._listeners || (this._listeners[e] = []);
				let r = this._listeners[e];
				r.indexOf(t) === -1 && (r = r.concat([t])), (this._listeners[e] = r);
			}),
				(o.prototype.removeEventListener = function (e, t) {
					const r = this._listeners[e];
					if (r) {
						const o = r.indexOf(t);
						o === -1 ||
							(r.length > 1 ? (this._listeners[e] = r.slice(0, o).concat(r.slice(o + 1))) : delete this._listeners[e]);
					}
				}),
				(o.prototype.dispatchEvent = function () {
					const e = arguments[0];
						const t = e.type;
						const r = arguments.length === 1 ? [e] : Array.apply(null, arguments);
					if ((this['on' + t] && this['on' + t].apply(this, r), t in this._listeners))
						for (let o = this._listeners[t], n = 0; n < o.length; n++) o[n].apply(this, r);
				}),
				(e.exports = o);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(9);
				const i = r(111);
				const s = r(112);
			function a(e, t, r, o, a) {
				const u = n.addPath(e, t);
					const c = this;
				i.call(this, e, r),
					(this.poll = new s(o, u, a)),
					this.poll.on('message', function (e) {
						c.emit('message', e);
					}),
					this.poll.once('close', function (e, t) {
						(c.poll = null), c.emit('close', e, t), c.close();
					});
			}
			o(a, i),
				(a.prototype.close = function () {
					i.prototype.close.call(this), this.removeAllListeners(), this.poll && (this.poll.abort(), (this.poll = null));
				}),
				(e.exports = a);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(5).EventEmitter;
					const n = r(0);
					const i = r(14);
					const s = r(9);
					let a = t.XMLHttpRequest;
				function u(e, t, r, n) {
					const i = this;
					o.call(this),
						setTimeout(function () {
							i._start(e, t, r, n);
						}, 0);
				}
				n(u, o),
					(u.prototype._start = function (e, t, r, o) {
						const n = this;
						try {
							this.xhr = new a();
						} catch (e) {}
						if (!this.xhr) return this.emit('finish', 0, 'no xhr support'), void this._cleanup();
						(t = s.addQuery(t, 't=' + +new Date())),
							(this.unloadRef = i.unloadAdd(function () {
								n._cleanup(!0);
							}));
						try {
							this.xhr.open(e, t, !0),
								this.timeout &&
									'timeout' in this.xhr &&
									((this.xhr.timeout = this.timeout),
									(this.xhr.ontimeout = function () {
										n.emit('finish', 0, ''), n._cleanup(!1);
									}));
						} catch (e) {
							return this.emit('finish', 0, ''), void this._cleanup(!1);
						}
						if (((o && o.noCredentials) || !u.supportsCORS || (this.xhr.withCredentials = !0), o && o.headers))
							for (const c in o.headers) this.xhr.setRequestHeader(c, o.headers[c]);
						this.xhr.onreadystatechange = function () {
							if (n.xhr) {
								let e;
									let t;
									const r = n.xhr;
								switch ((r.readyState, r.readyState)) {
									case 3:
										try {
											(t = r.status), (e = r.responseText);
										} catch (e) {}
										t === 1223 && (t = 204), t === 200 && e && e.length > 0 && n.emit('chunk', t, e);
										break;
									case 4:
										(t = r.status) === 1223 && (t = 204),
											(t !== 12005 && t !== 12029) || (t = 0),
											r.responseText,
											n.emit('finish', t, r.responseText),
											n._cleanup(!1);
								}
							}
						};
						try {
							n.xhr.send(r);
						} catch (e) {
							n.emit('finish', 0, ''), n._cleanup(!1);
						}
					}),
					(u.prototype._cleanup = function (e) {
						if (this.xhr) {
							if (
								(this.removeAllListeners(),
								i.unloadDel(this.unloadRef),
								(this.xhr.onreadystatechange = function () {}),
								this.xhr.ontimeout && (this.xhr.ontimeout = null),
								e)
							)
								try {
									this.xhr.abort();
								} catch (e) {}
							this.unloadRef = this.xhr = null;
						}
					}),
					(u.prototype.close = function () {
						this._cleanup(!0);
					}),
					(u.enabled = !!a);
				const c = ['Active'].concat('Object').join('X');
				!u.enabled &&
					c in t &&
					((a = function () {
						try {
							return new t[c]('Microsoft.XMLHTTP');
						} catch (e) {
							return null;
						}
					}),
					(u.enabled = !!new a()));
				let l = !1;
				try {
					l = 'withCredentials' in new a();
				} catch (e) {}
				(u.supportsCORS = l), (e.exports = u);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(18);
				const i = r(33);
				const s = r(40);
			function a(e) {
				if (!s.enabled) throw new Error('Transport created when disabled');
				n.call(this, e, '/xhr_streaming', i, s);
			}
			o(a, n),
				(a.enabled = function (e) {
					return !e.cookie_needed && !e.nullOrigin && s.enabled && e.sameScheme;
				}),
				(a.transportName = 'xdr-streaming'),
				(a.roundTrips = 2),
				(e.exports = a);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(18);
				const i = r(113);
				const s = r(34);
				const a = r(71);
			function u(e) {
				if (!u.enabled()) throw new Error('Transport created when disabled');
				n.call(this, e, '/eventsource', i, s);
			}
			o(u, n),
				(u.enabled = function () {
					return !!a;
				}),
				(u.transportName = 'eventsource'),
				(u.roundTrips = 2),
				(e.exports = u);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				e.exports = t.EventSource;
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(12);
				const i = r(5).EventEmitter;
				const s = r(73);
				const a = r(9);
				const u = r(26);
				const c = r(14);
				const l = r(17);
			function p(e, t, r) {
				if (!p.enabled()) throw new Error('Transport created when disabled');
				i.call(this);
				const o = this;
				(this.origin = a.getOrigin(r)),
					(this.baseUrl = r),
					(this.transUrl = t),
					(this.transport = e),
					(this.windowId = l.string(8));
				const n = a.addPath(r, '/iframe.html') + '#' + this.windowId;
				(this.iframeObj = u.createIframe(n, function (e) {
					o.emit('close', 1006, 'Unable to load an iframe (' + e + ')'), o.close();
				})),
					(this.onmessageCallback = this._message.bind(this)),
					c.attachEvent('message', this.onmessageCallback);
			}
			o(p, i),
				(p.prototype.close = function () {
					if ((this.removeAllListeners(), this.iframeObj)) {
						c.detachEvent('message', this.onmessageCallback);
						try {
							this.postMessage('c');
						} catch (e) {}
						this.iframeObj.cleanup(), (this.iframeObj = null), (this.onmessageCallback = this.iframeObj = null);
					}
				}),
				(p.prototype._message = function (e) {
					if ((e.data, !a.isOriginEqual(e.origin, this.origin))) return e.origin, void this.origin;
					let t;
					try {
						t = n.parse(e.data);
					} catch (t) {
						return void e.data;
					}
					if (t.windowId !== this.windowId) return t.windowId, void this.windowId;
					switch (t.type) {
						case 's':
							this.iframeObj.loaded(),
								this.postMessage('s', n.stringify([s, this.transport, this.transUrl, this.baseUrl]));
							break;
						case 't':
							this.emit('message', t.data);
							break;
						case 'c':
							var r;
							try {
								r = n.parse(t.data);
							} catch (e) {
								return void t.data;
							}
							this.emit('close', r[0], r[1]), this.close();
					}
				}),
				(p.prototype.postMessage = function (e, t) {
					this.iframeObj.post(n.stringify({ windowId: this.windowId, type: e, data: t || '' }), this.origin);
				}),
				(p.prototype.send = function (e) {
					this.postMessage('m', e);
				}),
				(p.enabled = function () {
					return u.iframeEnabled;
				}),
				(p.transportName = 'iframe'),
				(p.roundTrips = 2),
				(e.exports = p);
		},
		function (e, t, r) {
			'use strict';
			e.exports = '1.3.0';
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(116);
				const i = r(24);
				const s = r(18);
			function a(e) {
				if (!n.enabled) throw new Error('Transport created when disabled');
				s.call(this, e, '/htmlfile', n, i);
			}
			o(a, s),
				(a.enabled = function (e) {
					return n.enabled && e.sameOrigin;
				}),
				(a.transportName = 'htmlfile'),
				(a.roundTrips = 2),
				(e.exports = a);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(18);
				const i = r(33);
				const s = r(34);
				const a = r(24);
			function u(e) {
				if (!a.enabled && !s.enabled) throw new Error('Transport created when disabled');
				n.call(this, e, '/xhr', i, s);
			}
			o(u, n),
				(u.enabled = function (e) {
					return !e.nullOrigin && (!(!a.enabled || !e.sameOrigin) || s.enabled);
				}),
				(u.transportName = 'xhr-polling'),
				(u.roundTrips = 2),
				(e.exports = u);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				e.exports = t.location || {
					origin: 'http://localhost:80',
					protocol: 'http:',
					host: 'localhost',
					port: 80,
					href: 'http://localhost/',
					hash: ''
				};
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(5).EventEmitter;
				const i = r(12);
				const s = r(24);
				const a = r(78);
			function u(e) {
				const t = this;
				n.call(this),
					(this.ir = new a(e, s)),
					this.ir.once('finish', function (e, r) {
						(t.ir = null), t.emit('message', i.stringify([e, r]));
					});
			}
			o(u, n),
				(u.transportName = 'iframe-info-receiver'),
				(u.prototype.close = function () {
					this.ir && (this.ir.close(), (this.ir = null)), this.removeAllListeners();
				}),
				(e.exports = u);
		},
		function (e, t, r) {
			'use strict';
			const o = r(5).EventEmitter;
				const n = r(0);
				const i = r(12);
				const s = r(42);
			function a(e, t) {
				o.call(this);
				const r = this;
					const n = +new Date();
				(this.xo = new t('GET', e)),
					this.xo.once('finish', function (e, t) {
						let o, a;
						if (e === 200) {
							if (((a = +new Date() - n), t))
								try {
									o = i.parse(t);
								} catch (e) {}
							s.isObject(o) || (o = {});
						}
						r.emit('finish', o, a), r.removeAllListeners();
					});
			}
			n(a, o),
				(a.prototype.close = function () {
					this.removeAllListeners(), this.xo.close();
				}),
				(e.exports = a);
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e, t) {
				const r = new Array(arguments.length - 1);
					let o = 0;
					let n = 2;
					let i = !0;
				for (; n < arguments.length; ) r[o++] = arguments[n++];
				return new Promise(function (n, s) {
					r[o] = function (e) {
						if (i)
							if (((i = !1), e)) s(e);
							else {
								for (var t = new Array(arguments.length - 1), r = 0; r < t.length; ) t[r++] = arguments[r];
								n.apply(null, t);
							}
					};
					try {
						e.apply(t || null, r);
					} catch (e) {
						i && ((i = !1), s(e));
					}
				});
			};
		},
		function (module, exports, __webpack_require__) {
			'use strict';
			function inquire(moduleName) {
				try {
					const mod = eval('quire'.replace(/^/, 're'))(moduleName);
					if (mod && (mod.length || Object.keys(mod).length)) return mod;
				} catch (e) {}
				return null;
			}
			module.exports = inquire;
		},
		function (e, t, r) {
			'use strict';
			t.Service = r(145);
		},
		function (e, t, r) {
			'use strict';
			e.exports = {};
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				for (
					var t,
						r = i.codegen(['m', 'w'], e.name + '$encode')('if(!w)')('w=Writer.create()'),
						a = e.fieldsArray.slice().sort(i.compareFieldsById),
						u = 0;
					u < a.length;
					++u
				) {
					const c = a[u].resolve();
						const l = e._fieldsArray.indexOf(c);
						const p = c.resolvedType instanceof o ? 'int32' : c.type;
						const f = n.basic[p];
					(t = 'm' + i.safeProp(c.name)),
						c.map
							? (r(
									'if(%s!=null&&m.hasOwnProperty(%j)){',
									t,
									c.name
							  )('for(var ks=Object.keys(%s),i=0;i<ks.length;++i){', t)(
									'w.uint32(%i).fork().uint32(%i).%s(ks[i])',
									((c.id << 3) | 2) >>> 0,
									8 | n.mapKey[c.keyType],
									c.keyType
							  ),
							  void 0 === f
									? r('types[%i].encode(%s[ks[i]],w.uint32(18).fork()).ldelim().ldelim()', l, t)
									: r('.uint32(%i).%s(%s[ks[i]]).ldelim()', 16 | f, p, t),
							  r('}')('}'))
							: c.repeated
							? (r('if(%s!=null&&%s.length){', t, t),
							  c.packed && void 0 !== n.packed[p]
									? r('w.uint32(%i).fork()', ((c.id << 3) | 2) >>> 0)('for(var i=0;i<%s.length;++i)', t)(
											'w.%s(%s[i])',
											p,
											t
									  )('w.ldelim()')
									: (r('for(var i=0;i<%s.length;++i)', t),
									  void 0 === f ? s(r, c, l, t + '[i]') : r('w.uint32(%i).%s(%s[i])', ((c.id << 3) | f) >>> 0, p, t)),
							  r('}'))
							: (c.optional && r('if(%s!=null&&m.hasOwnProperty(%j))', t, c.name),
							  void 0 === f ? s(r, c, l, t) : r('w.uint32(%i).%s(%s)', ((c.id << 3) | f) >>> 0, p, t));
				}
				return r('return w');
			};
			var o = r(11);
				var n = r(20);
				var i = r(4);
			function s(e, t, r, o) {
				return t.resolvedType.group
					? e('types[%i].encode(%s,w.uint32(%i)).uint32(%i)', r, o, ((t.id << 3) | 3) >>> 0, ((t.id << 3) | 4) >>> 0)
					: e('types[%i].encode(%s,w.uint32(%i).fork()).ldelim()', r, o, ((t.id << 3) | 2) >>> 0);
			}
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				const t = i.codegen(['r', 'l'], e.name + '$decode')('if(!(r instanceof Reader))')('r=Reader.create(r)')(
					'var c=l===undefined?r.len:r.pos+l,m=new this.ctor' +
						(e.fieldsArray.filter(function (e) {
							return e.map;
						}).length
							? ',k'
							: '')
				)('while(r.pos<c){')('var t=r.uint32()');
				e.group && t('if((t&7)===4)')('break');
				t('switch(t>>>3){');
				for (var r = 0; r < e.fieldsArray.length; ++r) {
					const a = e._fieldsArray[r].resolve();
						const u = a.resolvedType instanceof o ? 'int32' : a.type;
						const c = 'm' + i.safeProp(a.name);
					t('case %i:', a.id),
						a.map
							? (t('r.skip().pos++')('if(%s===util.emptyObject)', c)('%s={}', c)('k=r.%s()', a.keyType)('r.pos++'),
							  void 0 !== n.long[a.keyType]
									? void 0 === n.basic[u]
										? t('%s[typeof k==="object"?util.longToHash(k):k]=types[%i].decode(r,r.uint32())', c, r)
										: t('%s[typeof k==="object"?util.longToHash(k):k]=r.%s()', c, u)
									: void 0 === n.basic[u]
									? t('%s[k]=types[%i].decode(r,r.uint32())', c, r)
									: t('%s[k]=r.%s()', c, u))
							: a.repeated
							? (t('if(!(%s&&%s.length))', c, c)('%s=[]', c),
							  void 0 !== n.packed[u] &&
									t('if((t&7)===2){')('var c2=r.uint32()+r.pos')('while(r.pos<c2)')('%s.push(r.%s())', c, u)('}else'),
							  void 0 === n.basic[u]
									? t(
											a.resolvedType.group ? '%s.push(types[%i].decode(r))' : '%s.push(types[%i].decode(r,r.uint32()))',
											c,
											r
									  )
									: t('%s.push(r.%s())', c, u))
							: void 0 === n.basic[u]
							? t(a.resolvedType.group ? '%s=types[%i].decode(r)' : '%s=types[%i].decode(r,r.uint32())', c, r)
							: t('%s=r.%s()', c, u),
						t('break');
				}
				for (t('default:')('r.skipType(t&7)')('break')('}')('}'), r = 0; r < e._fieldsArray.length; ++r) {
					const l = e._fieldsArray[r];
					l.required && t('if(!m.hasOwnProperty(%j))', l.name)('throw util.ProtocolError(%j,{instance:m})', s(l));
				}
				return t('return m');
			};
			var o = r(11);
				var n = r(20);
				var i = r(4);
			function s(e) {
				return "missing required '" + e.name + "'";
			}
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				const t = n.codegen(['m'], e.name + '$verify')('if(typeof m!=="object"||m===null)')(
						'return%j',
						'object expected'
					);
					const r = e.oneofsArray;
					const o = {};
				r.length && t('var p={}');
				for (let u = 0; u < e.fieldsArray.length; ++u) {
					const c = e._fieldsArray[u].resolve();
						const l = 'm' + n.safeProp(c.name);
					if ((c.optional && t('if(%s!=null&&m.hasOwnProperty(%j)){', l, c.name), c.map))
						t('if(!util.isObject(%s))', l)('return%j', i(c, 'object'))('var k=Object.keys(%s)', l)(
							'for(var i=0;i<k.length;++i){'
						),
							a(t, c, 'k[i]'),
							s(t, c, u, l + '[k[i]]')('}');
					else if (c.repeated)
						t('if(!Array.isArray(%s))', l)('return%j', i(c, 'array'))('for(var i=0;i<%s.length;++i){', l),
							s(t, c, u, l + '[i]')('}');
					else {
						if (c.partOf) {
							const p = n.safeProp(c.partOf.name);
							o[c.partOf.name] === 1 && t('if(p%s===1)', p)('return%j', c.partOf.name + ': multiple values'),
								(o[c.partOf.name] = 1),
								t('p%s=1', p);
						}
						s(t, c, u, l);
					}
					c.optional && t('}');
				}
				return t('return null');
			};
			const o = r(11);
				var n = r(4);
			function i(e, t) {
				return (
					e.name +
					': ' +
					t +
					(e.repeated && t !== 'array' ? '[]' : e.map && t !== 'object' ? '{k:' + e.keyType + '}' : '') +
					' expected'
				);
			}
			function s(e, t, r, n) {
				if (t.resolvedType)
					if (t.resolvedType instanceof o) {
						e('switch(%s){', n)('default:')('return%j', i(t, 'enum value'));
						for (let s = Object.keys(t.resolvedType.values), a = 0; a < s.length; ++a)
							e('case %i:', t.resolvedType.values[s[a]]);
						e('break')('}');
					} else e('{')('var e=types[%i].verify(%s);', r, n)('if(e)')('return%j+e', t.name + '.')('}');
				else
					switch (t.type) {
						case 'int32':
						case 'uint32':
						case 'sint32':
						case 'fixed32':
						case 'sfixed32':
							e('if(!util.isInteger(%s))', n)('return%j', i(t, 'integer'));
							break;
						case 'int64':
						case 'uint64':
						case 'sint64':
						case 'fixed64':
						case 'sfixed64':
							e(
								'if(!util.isInteger(%s)&&!(%s&&util.isInteger(%s.low)&&util.isInteger(%s.high)))',
								n,
								n,
								n,
								n
							)('return%j', i(t, 'integer|Long'));
							break;
						case 'float':
						case 'double':
							e('if(typeof %s!=="number")', n)('return%j', i(t, 'number'));
							break;
						case 'bool':
							e('if(typeof %s!=="boolean")', n)('return%j', i(t, 'boolean'));
							break;
						case 'string':
							e('if(!util.isString(%s))', n)('return%j', i(t, 'string'));
							break;
						case 'bytes':
							e('if(!(%s&&typeof %s.length==="number"||util.isString(%s)))', n, n, n)('return%j', i(t, 'buffer'));
					}
				return e;
			}
			function a(e, t, r) {
				switch (t.keyType) {
					case 'int32':
					case 'uint32':
					case 'sint32':
					case 'fixed32':
					case 'sfixed32':
						e('if(!util.key32Re.test(%s))', r)('return%j', i(t, 'integer key'));
						break;
					case 'int64':
					case 'uint64':
					case 'sint64':
					case 'fixed64':
					case 'sfixed64':
						e('if(!util.key64Re.test(%s))', r)('return%j', i(t, 'integer|Long key'));
						break;
					case 'bool':
						e('if(!util.key2Re.test(%s))', r)('return%j', i(t, 'boolean key'));
				}
				return e;
			}
		},
		function (e, t, r) {
			'use strict';
			const o = t;
				const n = r(11);
				const i = r(4);
			function s(e, t, r, o) {
				if (t.resolvedType)
					if (t.resolvedType instanceof n) {
						e('switch(d%s){', o);
						for (let i = t.resolvedType.values, s = Object.keys(i), a = 0; a < s.length; ++a)
							t.repeated && i[s[a]] === t.typeDefault && e('default:'),
								e('case%j:', s[a])('case %i:', i[s[a]])('m%s=%j', o, i[s[a]])('break');
						e('}');
					} else
						e('if(typeof d%s!=="object")', o)('throw TypeError(%j)', t.fullName + ': object expected')(
							'm%s=types[%i].fromObject(d%s)',
							o,
							r,
							o
						);
				else {
					let u = !1;
					switch (t.type) {
						case 'double':
						case 'float':
							e('m%s=Number(d%s)', o, o);
							break;
						case 'uint32':
						case 'fixed32':
							e('m%s=d%s>>>0', o, o);
							break;
						case 'int32':
						case 'sint32':
						case 'sfixed32':
							e('m%s=d%s|0', o, o);
							break;
						case 'uint64':
							u = !0;
						case 'int64':
						case 'sint64':
						case 'fixed64':
						case 'sfixed64':
							e('if(util.Long)')('(m%s=util.Long.fromValue(d%s)).unsigned=%j', o, o, u)(
								'else if(typeof d%s==="string")',
								o
							)(
								'm%s=parseInt(d%s,10)',
								o,
								o
							)('else if(typeof d%s==="number")', o)(
								'm%s=d%s',
								o,
								o
							)('else if(typeof d%s==="object")', o)(
								'm%s=new util.LongBits(d%s.low>>>0,d%s.high>>>0).toNumber(%s)',
								o,
								o,
								o,
								u ? 'true' : ''
							);
							break;
						case 'bytes':
							e('if(typeof d%s==="string")', o)(
								'util.base64.decode(d%s,m%s=util.newBuffer(util.base64.length(d%s)),0)',
								o,
								o,
								o
							)('else if(d%s.length)', o)('m%s=d%s', o, o);
							break;
						case 'string':
							e('m%s=String(d%s)', o, o);
							break;
						case 'bool':
							e('m%s=Boolean(d%s)', o, o);
					}
				}
				return e;
			}
			function a(e, t, r, o) {
				if (t.resolvedType)
					t.resolvedType instanceof n
						? e('d%s=o.enums===String?types[%i].values[m%s]:m%s', o, r, o, o)
						: e('d%s=types[%i].toObject(m%s,o)', o, r, o);
				else {
					let i = !1;
					switch (t.type) {
						case 'double':
						case 'float':
							e('d%s=o.json&&!isFinite(m%s)?String(m%s):m%s', o, o, o, o);
							break;
						case 'uint64':
							i = !0;
						case 'int64':
						case 'sint64':
						case 'fixed64':
						case 'sfixed64':
							e('if(typeof m%s==="number")', o)('d%s=o.longs===String?String(m%s):m%s', o, o, o)('else')(
								'd%s=o.longs===String?util.Long.prototype.toString.call(m%s):o.longs===Number?new util.LongBits(m%s.low>>>0,m%s.high>>>0).toNumber(%s):m%s',
								o,
								o,
								o,
								o,
								i ? 'true' : '',
								o
							);
							break;
						case 'bytes':
							e(
								'd%s=o.bytes===String?util.base64.encode(m%s,0,m%s.length):o.bytes===Array?Array.prototype.slice.call(m%s):m%s',
								o,
								o,
								o,
								o,
								o
							);
							break;
						default:
							e('d%s=m%s', o, o);
					}
				}
				return e;
			}
			(o.fromObject = function (e) {
				const t = e.fieldsArray;
					const r = i.codegen(['d'], e.name + '$fromObject')('if(d instanceof this.ctor)')('return d');
				if (!t.length) return r('return new this.ctor');
				r('var m=new this.ctor');
				for (let o = 0; o < t.length; ++o) {
					const a = t[o].resolve();
						const u = i.safeProp(a.name);
					a.map
						? (r('if(d%s){', u)('if(typeof d%s!=="object")', u)(
								'throw TypeError(%j)',
								a.fullName + ': object expected'
						  )('m%s={}', u)('for(var ks=Object.keys(d%s),i=0;i<ks.length;++i){', u),
						  s(r, a, o, u + '[ks[i]]')('}')('}'))
						: a.repeated
						? (r('if(d%s){', u)('if(!Array.isArray(d%s))', u)('throw TypeError(%j)', a.fullName + ': array expected')(
								'm%s=[]',
								u
						  )('for(var i=0;i<d%s.length;++i){', u),
						  s(r, a, o, u + '[i]')('}')('}'))
						: (a.resolvedType instanceof n || r('if(d%s!=null){', u),
						  s(r, a, o, u),
						  a.resolvedType instanceof n || r('}'));
				}
				return r('return m');
			}),
				(o.toObject = function (e) {
					const t = e.fieldsArray.slice().sort(i.compareFieldsById);
					if (!t.length) return i.codegen()('return {}');
					for (
						var r = i.codegen(['m', 'o'], e.name + '$toObject')('if(!o)')('o={}')('var d={}'),
							o = [],
							s = [],
							u = [],
							c = 0;
						c < t.length;
						++c
					)
						t[c].partOf || (t[c].resolve().repeated ? o : t[c].map ? s : u).push(t[c]);
					if (o.length) {
						for (r('if(o.arrays||o.defaults){'), c = 0; c < o.length; ++c) r('d%s=[]', i.safeProp(o[c].name));
						r('}');
					}
					if (s.length) {
						for (r('if(o.objects||o.defaults){'), c = 0; c < s.length; ++c) r('d%s={}', i.safeProp(s[c].name));
						r('}');
					}
					if (u.length) {
						for (r('if(o.defaults){'), c = 0; c < u.length; ++c) {
							var l = u[c];
								var p = i.safeProp(l.name);
							if (l.resolvedType instanceof n)
								r('d%s=o.enums===String?%j:%j', p, l.resolvedType.valuesById[l.typeDefault], l.typeDefault);
							else if (l.long)
								r('if(util.Long){')(
									'var n=new util.Long(%i,%i,%j)',
									l.typeDefault.low,
									l.typeDefault.high,
									l.typeDefault.unsigned
								)(
									'd%s=o.longs===String?n.toString():o.longs===Number?n.toNumber():n',
									p
								)('}else')('d%s=o.longs===String?%j:%i', p, l.typeDefault.toString(), l.typeDefault.toNumber());
							else if (l.bytes) {
								const f = '[' + Array.prototype.slice.call(l.typeDefault).join(',') + ']';
								r('if(o.bytes===String)d%s=%j', p, String.fromCharCode.apply(String, l.typeDefault))('else{')(
									'd%s=%s',
									p,
									f
								)(
									'if(o.bytes!==Array)d%s=util.newBuffer(d%s)',
									p,
									p
								)('}');
							} else r('d%s=%j', p, l.typeDefault);
						}
						r('}');
					}
					let h = !1;
					for (c = 0; c < t.length; ++c) {
						l = t[c];
						const d = e._fieldsArray.indexOf(l);
						p = i.safeProp(l.name);
						l.map
							? (h || ((h = !0), r('var ks2')),
							  r('if(m%s&&(ks2=Object.keys(m%s)).length){', p, p)('d%s={}', p)('for(var j=0;j<ks2.length;++j){'),
							  a(r, l, d, p + '[ks2[j]]')('}'))
							: l.repeated
							? (r('if(m%s&&m%s.length){', p, p)('d%s=[]', p)('for(var j=0;j<m%s.length;++j){', p),
							  a(r, l, d, p + '[j]')('}'))
							: (r('if(m%s!=null&&m.hasOwnProperty(%j)){', p, l.name),
							  a(r, l, d, p),
							  l.partOf && r('if(o.oneofs)')('d%s=%j', i.safeProp(l.partOf.name), l.name)),
							r('}');
					}
					return r('return d');
				});
		},
		function (e, t, r) {
			'use strict';
			const o = t;
				const n = r(50);
			o['.google.protobuf.Any'] = {
				fromObject: function (e) {
					if (e && e['@type']) {
						const t = this.lookup(e['@type']);
						if (t) {
							const r = e['@type'].charAt(0) === '.' ? e['@type'].substr(1) : e['@type'];
							return this.create({ type_url: '/' + r, value: t.encode(t.fromObject(e)).finish() });
						}
					}
					return this.fromObject(e);
				},
				toObject: function (e, t) {
					if (t && t.json && e.type_url && e.value) {
						const r = e.type_url.substring(e.type_url.lastIndexOf('/') + 1);
							const o = this.lookup(r);
						o && (e = o.decode(e.value));
					}
					if (!(e instanceof this.ctor) && e instanceof n) {
						const i = e.$type.toObject(e, t);
						return (i['@type'] = e.$type.fullName), i;
					}
					return this.toObject(e, t);
				}
			};
		},
		function (e, t, r) {
			'use strict';
			e.exports = h;
			const o = /[\s{}=;:[\],'"()<>]/g;
				const n = /(?:"([^"\\]*(?:\\.[^"\\]*)*)")/g;
				const i = /(?:'([^'\\]*(?:\\.[^'\\]*)*)')/g;
				const s = /^ *[*/]+ */;
				const a = /^\s*\*?\/*/;
				const u = /\n/g;
				const c = /\s/;
				const l = /\\(.?)/g;
				const p = { 0: '\0', r: '\r', n: '\n', t: '\t' };
			function f(e) {
				return e.replace(l, function (e, t) {
					switch (t) {
						case '\\':
						case '':
							return t;
						default:
							return p[t] || '';
					}
				});
			}
			function h(e, t) {
				e = e.toString();
				let r = 0;
					const l = e.length;
					let p = 1;
					let h = null;
					let d = null;
					let y = 0;
					let m = !1;
					const g = [];
					let v = null;
				function _(e) {
					return Error('illegal ' + e + ' (line ' + p + ')');
				}
				function b(t) {
					return e.charAt(t);
				}
				function E(r, o) {
					(h = e.charAt(r++)), (y = p), (m = !1);
					let n;
						let i = r - (t ? 2 : 3);
					do {
						if (--i < 0 || (n = e.charAt(i)) === '\n') {
							m = !0;
							break;
						}
					} while (n === ' ' || n === '\t');
					for (var c = e.substring(r, o).split(u), l = 0; l < c.length; ++l) c[l] = c[l].replace(t ? a : s, '').trim();
					d = c.join('\n').trim();
				}
				function O(t) {
					const r = N(t);
						const o = e.substring(t, r);
					return /^\s*\/{1,2}/.test(o);
				}
				function N(e) {
					for (var t = e; t < l && b(t) !== '\n'; ) t++;
					return t;
				}
				function T() {
					if (g.length > 0) return g.shift();
					if (v)
						return (function () {
							const t = v === "'" ? i : n;
							t.lastIndex = r - 1;
							const o = t.exec(e);
							if (!o) throw _('string');
							return (r = t.lastIndex), S(v), (v = null), f(o[1]);
						})();
					let s, a, u, h, d;
					do {
						if (r === l) return null;
						for (s = !1; c.test((u = b(r))); ) if ((u === '\n' && ++p, ++r === l)) return null;
						if (b(r) === '/') {
							if (++r === l) throw _('comment');
							if (b(r) === '/')
								if (t) {
									if (((h = r), (d = !1), O(r))) {
										d = !0;
										do {
											if ((r = N(r)) === l) break;
											r++;
										} while (O(r));
									} else r = Math.min(l, N(r) + 1);
									d && E(h, r), p++, (s = !0);
								} else {
									for (d = b((h = r + 1)) === '/'; b(++r) !== '\n'; ) if (r === l) return null;
									++r, d && E(h, r - 1), ++p, (s = !0);
								}
							else {
								if ((u = b(r)) !== '*') return '/';
								(h = r + 1), (d = t || b(h) === '*');
								do {
									if ((u === '\n' && ++p, ++r === l)) throw _('comment');
									(a = u), (u = b(r));
								} while (a !== '*' || u !== '/');
								++r, d && E(h, r - 2), (s = !0);
							}
						}
					} while (s);
					let y = r;
					if (((o.lastIndex = 0), !o.test(b(y++)))) for (; y < l && !o.test(b(y)); ) ++y;
					const m = e.substring(r, (r = y));
					return (m !== '"' && m !== "'") || (v = m), m;
				}
				function S(e) {
					g.push(e);
				}
				function I() {
					if (!g.length) {
						const e = T();
						if (e === null) return null;
						S(e);
					}
					return g[0];
				}
				return Object.defineProperty(
					{
						next: T,
						peek: I,
						push: S,
						skip: function (e, t) {
							const r = I();
							if (r === e) return T(), !0;
							if (!t) throw _("token '" + r + "', '" + e + "' expected");
							return !1;
						},
						cmnt: function (e) {
							let r = null;
							return (
								void 0 === e
									? y === p - 1 && (t || h === '*' || m) && (r = d)
									: (y < e && I(), y !== e || m || (!t && h !== '/') || (r = d)),
								r
							);
						}
					},
					'line',
					{
						get: function () {
							return p;
						}
					}
				);
			}
			h.unescape = f;
		},
		,
		,
		,
		,
		,
		,
		,
		,
		,
		,
		,
		,
		,
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			const n = o(r(103));
				const i = o(r(35));
				const s = o(r(133));
				const a = o(r(52));
				const u = o(r(8));
				const c = o(r(60));
				const l = o(r(151));
				const p = (0, o(r(7)).default)();
				const f = (0, c.default)();
			(s.default.util.Long = u.default), s.default.configure();
			let h;
				const d = s.default.Root.fromJSON(f);
			a.default.connection.prototype.getParams({ root: d, utils: l.default });
			const y = function (e, t, r) {
				for (var o = '', n = 0; n < e.length; n++) {
					o += String.fromCharCode(e[n]);
				}
				if (((o = i.default.btoa(o)), r)) return o;
				try {
					h.send(o);
				} catch (e) {
					t.onError({ type: p.WEBIM_CONNCTION_USER_NOT_ASSIGN_ERROR, msg: e });
				}
			};
			function m(e) {
				if (e.isHttpDNS) {
					const t = e.xmppHosts[e.xmppIndex];
						const r = t.domain;
						const o = t.ip;
						let i = '';
					if (o) {
						i = o;
						const s = t.port;
						s != '80' && (i += ':' + s);
					} else i = r;
					i && (e.url = '//' + i + '/ws');
				}
				return new n.default(e.url);
			}
			(a.default.connection.prototype._base64transform = y),
				(a.default.connection.prototype._getSock = m),
				(a.default.connection.prototype._login = function (e, t) {
					e &&
						((h = m(t)),
						(a.default.connection.prototype.sock = h),
						(h.onopen = function () {
							(t.autoReconnectInterval = 0), (t.times = 1), (t.autoReconnectNumTotal = 0);
							const r = [];
								const o = new Date().valueOf();
								const n = d.lookup('easemob.pb.Provision');
								let i = n.decode(r);
							(t.context.jid.clientResource = t.deviceId + '_' + o.toString()),
								(i.compressType = t.compressType),
								(i.encryptType = t.encryptType),
								(i.osType = t.osType),
								(i.version = t.version),
								(i.deviceName = t.deviceId),
								(i.resource = t.deviceId + '_' + o.toString()),
								(i.deviceUuid = o.toString()),
								(i.auth = '$t$' + e.access_token),
								(i = n.encode(i).finish());
							const s = d.lookup('easemob.pb.MSync');
								let a = s.decode(r);
							if (
								((a.version = t.version),
								(a.guid = t.context.jid),
								(a.auth = '$t$' + e.access_token),
								(a.command = 3),
								(a.deviceId = t.deviceId),
								(a.encryptType = t.encryptType),
								(a.payload = i),
								(a = s.encode(a).finish()),
								y(a, t),
								(t.logOut = !1),
								(t.offLineSendConnecting = !1),
								t.unSendMsgArr.length > 0)
							)
								for (const u in t.unSendMsgArr) {
									const c = t.unSendMsgArr[u];
									t.sendMSync(c), delete t.unSendMsgArr[u];
								}
							t.onOpened();
						}),
						(h.onclose = function (e) {
							if (
								!t.logOut &&
								t.autoReconnectNumTotal < t.autoReconnectNumMax &&
								((t.autoReconnectNumTotal <= t.xmppHosts.length && t.isHttpDNS) || !t.isHttpDNS)
							) {
								t.reconnect();
								var r = { type: p.WEBIM_CONNCTION_DISCONNECTED };
								t.onError(r);
							} else if (t.logOut) t.clear(), t.onClosed();
							else {
								r = { type: p.WEBIM_CONNCTION_DISCONNECTED };
								t.onError(r), t.onClosed();
							}
						}),
						(h.onmessage = function (e) {
							for (var r = i.default.atob(e.data), o = [], n = 0, s = r.length; n < s; ++n) o.push(r.charCodeAt(n));
							const a = d.lookup('easemob.pb.MSync').decode(o);
							switch ((t.isDebug && console.log('下行MSync：', a), a.command)) {
								case 0:
									var c = d.lookup('easemob.pb.CommSyncDL');
									c = c.decode(a.payload);
									var f = new u.default(c.serverId.low, c.serverId.high, c.serverId.unsigned).toString();
										var h = new u.default(c.metaId.low, c.metaId.high, c.metaId.unsigned).toString();
									if ((t.isDebug && console.log('下行CommSyncDLMessage：', c), c.metas.length !== 0))
										t._metapayload(c.metas, c.status, t), t._lastsession(c.nextKey, c.queue, t);
									else if (c.isLast) {
										const y = l.default.checkArray(t._queues, c.queue);
										!1 !== y && t._queues.splice(y, 1),
											t._queues.length > 0 && (t._backqueue(t._queues[0], t), this.qTimer && clearTimeout(this.qTimer));
									} else if (c.status && c.status.errorCode === 0) {
										if (t._msgHash[h]) {
											try {
												t._msgHash[h].success instanceof Function && t._msgHash[h].success(h, f);
											} catch (e) {
												t.onError({ type: p.WEBIM_CONNCTION_CALLBACK_INNER_ERROR, data: e });
											}
											delete t._msgHash[h];
										}
										t.onReceivedMessage({ id: h, mid: f });
									} else if (c.status && c.status.errorCode === 15) t.onMutedMessage({ mid: f });
									else if (c.status && c.status.errorCode === 1) {
										let m = '';
										switch (c.status.reason) {
											case 'blocked':
												m = p.PERMISSION_DENIED;
												break;
											case 'group not found':
												m = p.GROUP_NOT_EXIST;
												break;
											case 'not in group or chatroom':
												m = p.GROUP_NOT_JOINED;
												break;
											case 'exceed recall time limit':
												m = p.MESSAGE_RECALL_TIME_LIMIT;
												break;
											case 'message recall disabled':
												m = p.SERVICE_NOT_ENABLED;
												break;
											case 'not in group or chatroom white list':
												m = p.SERVICE_NOT_ALLOW_MESSAGING;
												break;
											default:
												m = p.SERVER_UNKNOWN_ERROR;
										}
										t.onError({ type: m, reason: c.status.reason ? c.status.reason : '', data: { id: h, mid: f } });
									} else if (c.status && c.status.errorCode === 7 && c.status.reason === 'sensitive words')
										t.onError({ type: p.MESSAGE_INCLUDE_ILLEGAL_CONTENT, data: { id: h, mid: f } });
									else {
										if (t._msgHash[h]) {
											try {
												t._msgHash[h].fail instanceof Function && t._msgHash[h].fail(h, f);
											} catch (e) {
												t.onError({ type: p.WEBIM_CONNCTION_CALLBACK_INNER_ERROR, data: e });
											}
											delete t._msgHash[h];
										}
										t.onError({
											type: p.WEBIM_LOAD_MSG_ERROR,
											data: { errorCode: c.status && c.status.errorCode, reason: c.status && c.status.reason }
										});
									}
									break;
								case 1:
									var g = d.lookup('easemob.pb.CommUnreadDL');
									if (
										((g = g.decode(a.payload)),
										t.isDebug && console.log('下行CommUnreadDLMessage：', g),
										g.unread.length === 0)
									);
									else for (n = 0; n < g.unread.length; n++) t._backqueue(g.unread[n].queue, t);
									t._rebuild();
									break;
								case 2:
									var v = d.lookup('easemob.pb.CommNotice').decode(a.payload);
									if (
										(t.isDebug && console.log('下行noticeMessage：', v),
										!1 !== l.default.checkArray(t._queues, v.queue))
									)
										return;
									t._queues.push(v.queue),
										this.qTimer && clearTimeout(this.qTimer),
										(this.qTimer = setTimeout(function () {
											const e = v.queue;
											!1 !== l.default.checkArray(t._queues, e) &&
												(t._backqueue(e, t), t.isDebug && console.log('上行q', e));
										}, 2e4)),
										t._queues.length == 1 && t._backqueue(v.queue, t);
									break;
								case 3:
									t._receiveProvision(a, t);
							}
						}),
						(e.access_token || '') != ''
							? (t.context.accessToken = e.access_token)
							: t.onError({ type: p.WEBIM_CONNCTION_OPEN_USERGRID_ERROR, data: e }));
				}),
				(window.WebIM = a.default);
			const g = a.default;
			t.default = g;
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(104);
				(e.exports = r(121)(o)), '_sockjs_onload' in t && setTimeout(t._sockjs_onload, 1);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			e.exports = [
				r(105),
				r(110),
				r(69),
				r(70),
				r(41)(r(70)),
				r(74),
				r(41)(r(74)),
				r(75),
				r(117),
				r(41)(r(75)),
				r(118)
			];
		},
		function (e, t, r) {
			'use strict';
			const o = r(14);
				const n = r(9);
				const i = r(0);
				const s = r(5).EventEmitter;
				const a = r(109);
			function u(e, t, r) {
				if (!u.enabled()) throw new Error('Transport created when disabled');
				s.call(this);
				const i = this;
					let c = n.addPath(e, '/websocket');
				(c = c.slice(0, 5) === 'https' ? 'wss' + c.slice(5) : 'ws' + c.slice(4)),
					(this.url = c),
					(this.ws = new a(this.url, [], r)),
					(this.ws.onmessage = function (e) {
						e.data, i.emit('message', e.data);
					}),
					(this.unloadRef = o.unloadAdd(function () {
						i.ws.close();
					})),
					(this.ws.onclose = function (e) {
						e.code, e.reason, i.emit('close', e.code, e.reason), i._cleanup();
					}),
					(this.ws.onerror = function (e) {
						i.emit('close', 1006, 'WebSocket connection broken'), i._cleanup();
					});
			}
			i(u, s),
				(u.prototype.send = function (e) {
					const t = '[' + e + ']';
					this.ws.send(t);
				}),
				(u.prototype.close = function () {
					const e = this.ws;
					this._cleanup(), e && e.close();
				}),
				(u.prototype._cleanup = function () {
					const e = this.ws;
					e && (e.onmessage = e.onclose = e.onerror = null),
						o.unloadDel(this.unloadRef),
						(this.unloadRef = this.ws = null),
						this.removeAllListeners();
				}),
				(u.enabled = function () {
					return !!a;
				}),
				(u.transportName = 'websocket'),
				(u.roundTrips = 2),
				(e.exports = u);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				t.crypto && t.crypto.getRandomValues
					? (e.exports.randomBytes = function (e) {
							const r = new Uint8Array(e);
							return t.crypto.getRandomValues(r), r;
					  })
					: (e.exports.randomBytes = function (e) {
							for (var t = new Array(e), r = 0; r < e; r++) t[r] = Math.floor(256 * Math.random());
							return t;
					  });
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e, t) {
				if (((t = t.split(':')[0]), !(e = +e))) return !1;
				switch (t) {
					case 'http':
					case 'ws':
						return e !== 80;
					case 'https':
					case 'wss':
						return e !== 443;
					case 'ftp':
						return e !== 21;
					case 'gopher':
						return e !== 70;
					case 'file':
						return !1;
				}
				return e !== 0;
			};
		},
		function (e, t, r) {
			'use strict';
			const o = Object.prototype.hasOwnProperty;
			function n(e) {
				try {
					return decodeURIComponent(e.replace(/\+/g, ' '));
				} catch (e) {
					return null;
				}
			}
			(t.stringify = function (e, t) {
				t = t || '';
				let r;
					let n;
					const i = [];
				for (n in (typeof t !== 'string' && (t = '?'), e))
					if (o.call(e, n)) {
						if (
							((r = e[n]) || (r != null && !isNaN(r)) || (r = ''),
							(n = encodeURIComponent(n)),
							(r = encodeURIComponent(r)),
							n === null || r === null)
						)
							continue;
						i.push(n + '=' + r);
					}
				return i.length ? t + i.join('&') : '';
			}),
				(t.parse = function (e) {
					for (var t, r = /([^=?&]+)=?([^&]*)/g, o = {}; (t = r.exec(e)); ) {
						const i = n(t[1]);
							const s = n(t[2]);
						i === null || s === null || i in o || (o[i] = s);
					}
					return o;
				});
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const r = t.WebSocket || t.MozWebSocket;
				e.exports = r
					? function (e) {
							return new r(e);
					  }
					: void 0;
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(0);
					const n = r(18);
					const i = r(33);
					const s = r(34);
					const a = r(24);
					const u = r(25);
				function c(e) {
					if (!a.enabled && !s.enabled) throw new Error('Transport created when disabled');
					n.call(this, e, '/xhr_streaming', i, s);
				}
				o(c, n),
					(c.enabled = function (e) {
						return !e.nullOrigin && !u.isOpera() && s.enabled;
					}),
					(c.transportName = 'xhr-streaming'),
					(c.roundTrips = 2),
					(c.needBody = !!t.document),
					(e.exports = c);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(5).EventEmitter;
			function i(e, t) {
				n.call(this), (this.sendBuffer = []), (this.sender = t), (this.url = e);
			}
			o(i, n),
				(i.prototype.send = function (e) {
					this.sendBuffer.push(e), this.sendStop || this.sendSchedule();
				}),
				(i.prototype.sendScheduleWait = function () {
					let e;
						const t = this;
					(this.sendStop = function () {
						(t.sendStop = null), clearTimeout(e);
					}),
						(e = setTimeout(function () {
							(t.sendStop = null), t.sendSchedule();
						}, 25));
				}),
				(i.prototype.sendSchedule = function () {
					this.sendBuffer.length;
					const e = this;
					if (this.sendBuffer.length > 0) {
						const t = '[' + this.sendBuffer.join(',') + ']';
						(this.sendStop = this.sender(this.url, t, function (t) {
							(e.sendStop = null),
								t ? (e.emit('close', t.code || 1006, 'Sending error: ' + t), e.close()) : e.sendScheduleWait();
						})),
							(this.sendBuffer = []);
					}
				}),
				(i.prototype._cleanup = function () {
					this.removeAllListeners();
				}),
				(i.prototype.close = function () {
					this._cleanup(), this.sendStop && (this.sendStop(), (this.sendStop = null));
				}),
				(e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(5).EventEmitter;
			function i(e, t, r) {
				n.call(this), (this.Receiver = e), (this.receiveUrl = t), (this.AjaxObject = r), this._scheduleReceiver();
			}
			o(i, n),
				(i.prototype._scheduleReceiver = function () {
					const e = this;
						let t = (this.poll = new this.Receiver(this.receiveUrl, this.AjaxObject));
					t.on('message', function (t) {
						e.emit('message', t);
					}),
						t.once('close', function (r, o) {
							e.pollIsClosing,
								(e.poll = t = null),
								e.pollIsClosing ||
									(o === 'network' ? e._scheduleReceiver() : (e.emit('close', r || 1006, o), e.removeAllListeners()));
						});
				}),
				(i.prototype.abort = function () {
					this.removeAllListeners(), (this.pollIsClosing = !0), this.poll && this.poll.abort();
				}),
				(e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(5).EventEmitter;
				const i = r(71);
			function s(e) {
				n.call(this);
				const t = this;
					const r = (this.es = new i(e));
				(r.onmessage = function (e) {
					e.data, t.emit('message', decodeURI(e.data));
				}),
					(r.onerror = function (e) {
						r.readyState;
						const o = r.readyState !== 2 ? 'network' : 'permanent';
						t._cleanup(), t._close(o);
					});
			}
			o(s, n),
				(s.prototype.abort = function () {
					this._cleanup(), this._close('user');
				}),
				(s.prototype._cleanup = function () {
					const e = this.es;
					e && ((e.onmessage = e.onerror = null), e.close(), (this.es = null));
				}),
				(s.prototype._close = function (e) {
					const t = this;
					setTimeout(function () {
						t.emit('close', null, e), t.removeAllListeners();
					}, 200);
				}),
				(e.exports = s);
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				return (
					e.webpackPolyfill ||
						((e.deprecate = function () {}),
						(e.paths = []),
						e.children || (e.children = []),
						Object.defineProperty(e, 'loaded', {
							enumerable: !0,
							get: function () {
								return e.l;
							}
						}),
						Object.defineProperty(e, 'id', {
							enumerable: !0,
							get: function () {
								return e.i;
							}
						}),
						(e.webpackPolyfill = 1)),
					e
				);
			};
		},
		function (e, t) {
			(function (t) {
				e.exports = t;
			}).call(this, {});
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(0);
					const n = r(26);
					const i = r(9);
					const s = r(5).EventEmitter;
					const a = r(17);
				function u(e) {
					s.call(this);
					const r = this;
					n.polluteGlobalNamespace(),
						(this.id = 'a' + a.string(6)),
						(e = i.addQuery(e, 'c=' + decodeURIComponent(n.WPrefix + '.' + this.id))),
						u.htmlfileEnabled;
					const o = u.htmlfileEnabled ? n.createHtmlfile : n.createIframe;
					(t[n.WPrefix][this.id] = {
						start: function () {
							r.iframeObj.loaded();
						},
						message: function (e) {
							r.emit('message', e);
						},
						stop: function () {
							r._cleanup(), r._close('network');
						}
					}),
						(this.iframeObj = o(e, function () {
							r._cleanup(), r._close('permanent');
						}));
				}
				o(u, s),
					(u.prototype.abort = function () {
						this._cleanup(), this._close('user');
					}),
					(u.prototype._cleanup = function () {
						this.iframeObj && (this.iframeObj.cleanup(), (this.iframeObj = null)), delete t[n.WPrefix][this.id];
					}),
					(u.prototype._close = function (e) {
						this.emit('close', null, e), this.removeAllListeners();
					}),
					(u.htmlfileEnabled = !1);
				const c = ['Active'].concat('Object').join('X');
				if (c in t)
					try {
						u.htmlfileEnabled = !!new t[c]('htmlfile');
					} catch (e) {}
				(u.enabled = u.htmlfileEnabled || n.iframeEnabled), (e.exports = u);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(18);
				const i = r(69);
				const s = r(33);
				const a = r(40);
			function u(e) {
				if (!a.enabled) throw new Error('Transport created when disabled');
				n.call(this, e, '/xhr', s, a);
			}
			o(u, n), (u.enabled = i.enabled), (u.transportName = 'xdr-polling'), (u.roundTrips = 2), (e.exports = u);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(0);
					const n = r(67);
					const i = r(119);
					const s = r(120);
				function a(e) {
					if (!a.enabled()) throw new Error('Transport created when disabled');
					n.call(this, e, '/jsonp', s, i);
				}
				o(a, n),
					(a.enabled = function () {
						return !!t.document;
					}),
					(a.transportName = 'jsonp-polling'),
					(a.roundTrips = 1),
					(a.needBody = !0),
					(e.exports = a);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(26);
					const n = r(17);
					const i = r(25);
					const s = r(9);
					const a = r(0);
					const u = r(5).EventEmitter;
				function c(e) {
					const r = this;
					u.call(this), o.polluteGlobalNamespace(), (this.id = 'a' + n.string(6));
					const i = s.addQuery(e, 'c=' + encodeURIComponent(o.WPrefix + '.' + this.id));
					(t[o.WPrefix][this.id] = this._callback.bind(this)),
						this._createScript(i),
						(this.timeoutId = setTimeout(function () {
							r._abort(new Error('JSONP script loaded abnormally (timeout)'));
						}, c.timeout));
				}
				a(c, u),
					(c.prototype.abort = function () {
						if (t[o.WPrefix][this.id]) {
							const e = new Error('JSONP user aborted read');
							(e.code = 1e3), this._abort(e);
						}
					}),
					(c.timeout = 35e3),
					(c.scriptErrorTimeout = 1e3),
					(c.prototype._callback = function (e) {
						this._cleanup(),
							this.aborting ||
								(e && this.emit('message', e), this.emit('close', null, 'network'), this.removeAllListeners());
					}),
					(c.prototype._abort = function (e) {
						this._cleanup(), (this.aborting = !0), this.emit('close', e.code, e.message), this.removeAllListeners();
					}),
					(c.prototype._cleanup = function () {
						if (
							(clearTimeout(this.timeoutId),
							this.script2 && (this.script2.parentNode.removeChild(this.script2), (this.script2 = null)),
							this.script)
						) {
							const e = this.script;
							e.parentNode.removeChild(e),
								(e.onreadystatechange = e.onerror = e.onload = e.onclick = null),
								(this.script = null);
						}
						delete t[o.WPrefix][this.id];
					}),
					(c.prototype._scriptError = function () {
						const e = this;
						this.errorTimer ||
							(this.errorTimer = setTimeout(function () {
								e.loadedOkay || e._abort(new Error('JSONP script loaded abnormally (onerror)'));
							}, c.scriptErrorTimeout));
					}),
					(c.prototype._createScript = function (e) {
						let r;
							const o = this;
							const s = (this.script = t.document.createElement('script'));
						if (
							((s.id = 'a' + n.string(8)),
							(s.src = e),
							(s.type = 'text/javascript'),
							(s.charset = 'UTF-8'),
							(s.onerror = this._scriptError.bind(this)),
							(s.onload = function () {
								o._abort(new Error('JSONP script loaded abnormally (onload)'));
							}),
							(s.onreadystatechange = function () {
								if ((s.readyState, /loaded|closed/.test(s.readyState))) {
									if (s && s.htmlFor && s.onclick) {
										o.loadedOkay = !0;
										try {
											s.onclick();
										} catch (e) {}
									}
									s && o._abort(new Error('JSONP script loaded abnormally (onreadystatechange)'));
								}
							}),
							void 0 === s.async && t.document.attachEvent)
						)
							if (i.isOpera())
								((r = this.script2 = t.document.createElement('script')).text =
									"try{var a = document.getElementById('" + s.id + "'); if(a)a.onerror();}catch(x){};"),
									(s.async = r.async = !1);
							else {
								try {
									(s.htmlFor = s.id), (s.event = 'onclick');
								} catch (e) {}
								s.async = !0;
							}
						void 0 !== s.async && (s.async = !0);
						const a = t.document.getElementsByTagName('head')[0];
						a.insertBefore(s, a.firstChild), r && a.insertBefore(r, a.firstChild);
					}),
					(e.exports = c);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				let o;
					let n;
					const i = r(17);
					const s = r(9);
				e.exports = function (e, r, a) {
					o ||
						(((o = t.document.createElement('form')).style.display = 'none'),
						(o.style.position = 'absolute'),
						(o.method = 'POST'),
						(o.enctype = 'application/x-www-form-urlencoded'),
						(o.acceptCharset = 'UTF-8'),
						((n = t.document.createElement('textarea')).name = 'd'),
						o.appendChild(n),
						t.document.body.appendChild(o));
					const u = 'a' + i.string(8);
					(o.target = u), (o.action = s.addQuery(s.addPath(e, '/jsonp_send'), 'i=' + u));
					let c = (function (e) {
						try {
							return t.document.createElement('<iframe name="' + e + '">');
						} catch (o) {
							const r = t.document.createElement('iframe');
							return (r.name = e), r;
						}
					})(u);
					(c.id = u), (c.style.display = 'none'), o.appendChild(c);
					try {
						n.value = r;
					} catch (e) {}
					o.submit();
					const l = function (e) {
						c.onerror &&
							((c.onreadystatechange = c.onerror = c.onload = null),
							setTimeout(function () {
								c.parentNode.removeChild(c), (c = null);
							}, 500),
							(n.value = ''),
							a(e));
					};
					return (
						(c.onerror = function () {
							l();
						}),
						(c.onload = function () {
							l();
						}),
						(c.onreadystatechange = function (e) {
							c.readyState, c.readyState === 'complete' && l();
						}),
						function () {
							l(new Error('Aborted'));
						}
					);
				};
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				r(122);
				let o;
					const n = r(65);
					const i = r(0);
					const s = r(12);
					const a = r(17);
					const u = r(123);
					const c = r(9);
					const l = r(14);
					const p = r(124);
					const f = r(42);
					const h = r(25);
					const d = r(125);
					const y = r(43);
					const m = r(66);
					const g = r(76);
					const v = r(126);
					const _ = r(127);
					const b = r(128);
				function E(e, t, r) {
					if (!(this instanceof E)) return new E(e, t, r);
					if (arguments.length < 1)
						throw new TypeError("Failed to construct 'SockJS: 1 argument required, but only 0 present");
					m.call(this),
						(this.readyState = E.CONNECTING),
						(this.extensions = ''),
						(this.protocol = ''),
						(r = r || {}).protocols_whitelist &&
							d.warn("'protocols_whitelist' is DEPRECATED. Use 'transports' instead."),
						(this._transportsWhitelist = r.transports),
						(this._transportOptions = r.transportOptions || {});
					const o = r.sessionId || 8;
					if (typeof o === 'function') this._generateSessionId = o;
					else {
						if (typeof o !== 'number')
							throw new TypeError('If sessionId is used in the options, it needs to be a number or a function.');
						this._generateSessionId = function () {
							return a.string(o);
						};
					}
					this._server = r.server || a.numberString(1e3);
					const i = new n(e);
					if (!i.host || !i.protocol) throw new SyntaxError("The URL '" + e + "' is invalid");
					if (i.hash) throw new SyntaxError('The URL must not contain a fragment');
					if (i.protocol !== 'http:' && i.protocol !== 'https:')
						throw new SyntaxError(
							"The URL's scheme must be either 'http:' or 'https:'. '" + i.protocol + "' is not allowed."
						);
					const s = i.protocol === 'https:';
					if (g.protocol === 'https:' && !s)
						throw new Error(
							'SecurityError: An insecure SockJS connection may not be initiated from a page loaded over HTTPS'
						);
					t ? Array.isArray(t) || (t = [t]) : (t = []);
					const u = t.sort();
					u.forEach(function (e, t) {
						if (!e) throw new SyntaxError("The protocols entry '" + e + "' is invalid.");
						if (t < u.length - 1 && e === u[t + 1])
							throw new SyntaxError("The protocols entry '" + e + "' is duplicated.");
					});
					const l = c.getOrigin(g.href);
					(this._origin = l ? l.toLowerCase() : null),
						i.set('pathname', i.pathname.replace(/\/+$/, '')),
						(this.url = i.href),
						this.url,
						(this._urlInfo = {
							nullOrigin: !h.hasDomain(),
							sameOrigin: c.isOriginEqual(this.url, g.href),
							sameScheme: c.isSchemeEqual(this.url, g.href)
						}),
						(this._ir = new b(this.url, this._urlInfo)),
						this._ir.once('finish', this._receiveInfo.bind(this));
				}
				function O(e) {
					return e === 1e3 || (e >= 3e3 && e <= 4999);
				}
				i(E, m),
					(E.prototype.close = function (e, t) {
						if (e && !O(e)) throw new Error('InvalidAccessError: Invalid code');
						if (t && t.length > 123) throw new SyntaxError('reason argument has an invalid length');
						if (this.readyState !== E.CLOSING && this.readyState !== E.CLOSED) {
							this._close(e || 1e3, t || 'Normal closure', !0);
						}
					}),
					(E.prototype.send = function (e) {
						if ((typeof e !== 'string' && (e = '' + e), this.readyState === E.CONNECTING))
							throw new Error('InvalidStateError: The connection has not been established yet');
						this.readyState === E.OPEN && this._transport.send(u.quote(e));
					}),
					(E.version = r(73)),
					(E.CONNECTING = 0),
					(E.OPEN = 1),
					(E.CLOSING = 2),
					(E.CLOSED = 3),
					(E.prototype._receiveInfo = function (e, t) {
						if (((this._ir = null), e)) {
							(this._rto = this.countRTO(t)),
								(this._transUrl = e.base_url ? e.base_url : this.url),
								(e = f.extend(e, this._urlInfo));
							const r = o.filterToEnabled(this._transportsWhitelist, e);
							(this._transports = r.main), this._transports.length, this._connect();
						} else this._close(1002, 'Cannot connect to server');
					}),
					(E.prototype._connect = function () {
						for (let e = this._transports.shift(); e; e = this._transports.shift()) {
							if (
								(e.transportName,
								e.needBody &&
									(!t.document.body ||
										(void 0 !== t.document.readyState &&
											t.document.readyState !== 'complete' &&
											t.document.readyState !== 'interactive')))
							)
								return this._transports.unshift(e), void l.attachEvent('load', this._connect.bind(this));
							const r = this._rto * e.roundTrips || 5e3;
							this._transportTimeoutId = setTimeout(this._transportTimeout.bind(this), r);
							const o = c.addPath(this._transUrl, '/' + this._server + '/' + this._generateSessionId());
								const n = this._transportOptions[e.transportName];
								const i = new e(o, this._transUrl, n);
							return (
								i.on('message', this._transportMessage.bind(this)),
								i.once('close', this._transportClose.bind(this)),
								(i.transportName = e.transportName),
								void (this._transport = i)
							);
						}
						this._close(2e3, 'All transports failed', !1);
					}),
					(E.prototype._transportTimeout = function () {
						this.readyState === E.CONNECTING &&
							(this._transport && this._transport.close(), this._transportClose(2007, 'Transport timed out'));
					}),
					(E.prototype._transportMessage = function (e) {
						let t;
							const r = this;
							const o = e.slice(0, 1);
							const n = e.slice(1);
						switch (o) {
							case 'o':
								return void this._open();
							case 'h':
								return this.dispatchEvent(new y('heartbeat')), void this.transport;
						}
						if (n)
							try {
								t = s.parse(n);
							} catch (e) {}
						if (void 0 !== t)
							switch (o) {
								case 'a':
									Array.isArray(t) &&
										t.forEach(function (e) {
											r.transport, r.dispatchEvent(new _(e));
										});
									break;
								case 'm':
									this.transport, this.dispatchEvent(new _(t));
									break;
								case 'c':
									Array.isArray(t) && t.length === 2 && this._close(t[0], t[1], !0);
							}
					}),
					(E.prototype._transportClose = function (e, t) {
						this.transport,
							this._transport &&
								(this._transport.removeAllListeners(), (this._transport = null), (this.transport = null)),
							O(e) || e === 2e3 || this.readyState !== E.CONNECTING ? this._close(e, t) : this._connect();
					}),
					(E.prototype._open = function () {
						this._transport.transportName,
							this.readyState,
							this.readyState === E.CONNECTING
								? (this._transportTimeoutId &&
										(clearTimeout(this._transportTimeoutId), (this._transportTimeoutId = null)),
								  (this.readyState = E.OPEN),
								  (this.transport = this._transport.transportName),
								  this.dispatchEvent(new y('open')),
								  this.transport)
								: this._close(1006, 'Server lost session');
					}),
					(E.prototype._close = function (e, t, r) {
						this.transport, this.readyState;
						let o = !1;
						if (
							(this._ir && ((o = !0), this._ir.close(), (this._ir = null)),
							this._transport && (this._transport.close(), (this._transport = null), (this.transport = null)),
							this.readyState === E.CLOSED)
						)
							throw new Error('InvalidStateError: SockJS has already been closed');
						(this.readyState = E.CLOSING),
							setTimeout(
								function () {
									(this.readyState = E.CLOSED), o && this.dispatchEvent(new y('error'));
									const n = new v('close');
									(n.wasClean = r || !1),
										(n.code = e || 1e3),
										(n.reason = t),
										this.dispatchEvent(n),
										(this.onmessage = this.onclose = this.onerror = null);
								}.bind(this),
								0
							);
					}),
					(E.prototype.countRTO = function (e) {
						return e > 100 ? 4 * e : 300 + e;
					}),
					(e.exports = function (e) {
						return (o = p(e)), r(131)(E, e), E;
					});
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (o =
					typeof Symbol === 'function' && typeof Symbol.iterator === 'symbol'
						? function (e) {
								return typeof e;
						  }
						: function (e) {
								return e && typeof Symbol === 'function' && e.constructor === Symbol && e !== Symbol.prototype
									? 'symbol'
									: typeof e;
						  })(e);
			}
			let n;
				const i = Array.prototype;
				const s = Object.prototype;
				const a = Function.prototype;
				const u = String.prototype;
				const c = i.slice;
				const l = s.toString;
				const p = function (e) {
					return s.toString.call(e) === '[object Function]';
				};
				const f = function (e) {
					return l.call(e) === '[object String]';
				};
				const h =
					Object.defineProperty &&
					(function () {
						try {
							return Object.defineProperty({}, 'x', {}), !0;
						} catch (e) {
							return !1;
						}
					})();
			n = h
				? function (e, t, r, o) {
						(!o && t in e) || Object.defineProperty(e, t, { configurable: !0, enumerable: !1, writable: !0, value: r });
				  }
				: function (e, t, r, o) {
						(!o && t in e) || (e[t] = r);
				  };
			const d = function (e, t, r) {
					for (const o in t) s.hasOwnProperty.call(t, o) && n(e, o, t[o], r);
				};
				const y = function (e) {
					if (e == null) throw new TypeError("can't convert " + e + ' to object');
					return Object(e);
				};
			function m(e) {
				let t = +e;
				return (
					t != t ? (t = 0) : t !== 0 && t !== 1 / 0 && t !== -1 / 0 && (t = (t > 0 || -1) * Math.floor(Math.abs(t))), t
				);
			}
			function g() {}
			d(a, {
				bind: function (e) {
					const t = this;
					if (!p(t)) throw new TypeError('Function.prototype.bind called on incompatible ' + t);
					for (
						var r = c.call(arguments, 1),
							o = function () {
								if (this instanceof a) {
									const o = t.apply(this, r.concat(c.call(arguments)));
									return Object(o) === o ? o : this;
								}
								return t.apply(e, r.concat(c.call(arguments)));
							},
							n = Math.max(0, t.length - r.length),
							i = [],
							s = 0;
						s < n;
						s++
					)
						i.push('$' + s);
					var a = Function(
						'binder',
						'return function (' + i.join(',') + '){ return binder.apply(this, arguments); }'
					)(o);
					return t.prototype && ((g.prototype = t.prototype), (a.prototype = new g()), (g.prototype = null)), a;
				}
			}),
				d(Array, {
					isArray: function (e) {
						return l.call(e) === '[object Array]';
					}
				});
			let v;
				let _;
				let b;
				const E = Object('a');
				const O = E[0] !== 'a' || !(0 in E);
			d(
				i,
				{
					forEach: function (e) {
						const t = y(this);
							const r = O && f(this) ? this.split('') : t;
							const o = arguments[1];
							let n = -1;
							const i = r.length >>> 0;
						if (!p(e)) throw new TypeError();
						for (; ++n < i; ) n in r && e.call(o, r[n], n, t);
					}
				},
				((v = i.forEach),
				(_ = !0),
				(b = !0),
				v &&
					(v.call('foo', function (e, t, r) {
						o(r) !== 'object' && (_ = !1);
					}),
					v.call(
						[1],
						function () {
							b = typeof this === 'string';
						},
						'x'
					)),
				!(v && _ && b))
			);
			const N = Array.prototype.indexOf && [0, 1].indexOf(1, 2) !== -1;
			d(
				i,
				{
					indexOf: function (e) {
						const t = O && f(this) ? this.split('') : y(this);
							const r = t.length >>> 0;
						if (!r) return -1;
						let o = 0;
						for (arguments.length > 1 && (o = m(arguments[1])), o = o >= 0 ? o : Math.max(0, r + o); o < r; o++)
							if (o in t && t[o] === e) return o;
						return -1;
					}
				},
				N
			);
			let T;
				const S = u.split;
			'ab'.split(/(?:ab)*/).length !== 2 ||
			'.'.split(/(.?)(.?)/).length !== 4 ||
			'tesst'.split(/(s)*/)[1] === 't' ||
			'test'.split(/(?:)/, -1).length !== 4 ||
			''.split(/.?/).length ||
			'.'.split(/()()/).length > 1
				? ((T = void 0 === /()??/.exec('')[1]),
				  (u.split = function (e, t) {
						let r = this;
						if (void 0 === e && t === 0) return [];
						if (l.call(e) !== '[object RegExp]') return S.call(this, e, t);
						let o;
							let n;
							let s;
							let a;
							const u = [];
							const c =
								(e.ignoreCase ? 'i' : '') + (e.multiline ? 'm' : '') + (e.extended ? 'x' : '') + (e.sticky ? 'y' : '');
							let p = 0;
						for (
							e = new RegExp(e.source, c + 'g'),
								r += '',
								T || (o = new RegExp('^' + e.source + '$(?!\\s)', c)),
								t = void 0 === t ? -1 >>> 0 : t >>> 0;
							(n = e.exec(r)) &&
							!(
								(s = n.index + n[0].length) > p &&
								(u.push(r.slice(p, n.index)),
								!T &&
									n.length > 1 &&
									n[0].replace(o, function () {
										for (let e = 1; e < arguments.length - 2; e++) void 0 === arguments[e] && (n[e] = void 0);
									}),
								n.length > 1 && n.index < r.length && i.push.apply(u, n.slice(1)),
								(a = n[0].length),
								(p = s),
								u.length >= t)
							);

						)
							e.lastIndex === n.index && e.lastIndex++;
						return (
							p === r.length ? (!a && e.test('')) || u.push('') : u.push(r.slice(p)), u.length > t ? u.slice(0, t) : u
						);
				  }))
				: '0'.split(void 0, 0).length &&
				  (u.split = function (e, t) {
						return void 0 === e && t === 0 ? [] : S.call(this, e, t);
				  });
			const I = u.substr;
				const w = ''.substr && '0b'.substr(-1) !== 'b';
			d(
				u,
				{
					substr: function (e, t) {
						return I.call(this, e < 0 && (e = this.length + e) < 0 ? 0 : e, t);
					}
				},
				w
			);
		},
		function (e, t, r) {
			'use strict';
			let o;
				const n = r(12);
				const i =
					/[\x00-\x1f\ud800-\udfff\ufffe\uffff\u0300-\u0333\u033d-\u0346\u034a-\u034c\u0350-\u0352\u0357-\u0358\u035c-\u0362\u0374\u037e\u0387\u0591-\u05af\u05c4\u0610-\u0617\u0653-\u0654\u0657-\u065b\u065d-\u065e\u06df-\u06e2\u06eb-\u06ec\u0730\u0732-\u0733\u0735-\u0736\u073a\u073d\u073f-\u0741\u0743\u0745\u0747\u07eb-\u07f1\u0951\u0958-\u095f\u09dc-\u09dd\u09df\u0a33\u0a36\u0a59-\u0a5b\u0a5e\u0b5c-\u0b5d\u0e38-\u0e39\u0f43\u0f4d\u0f52\u0f57\u0f5c\u0f69\u0f72-\u0f76\u0f78\u0f80-\u0f83\u0f93\u0f9d\u0fa2\u0fa7\u0fac\u0fb9\u1939-\u193a\u1a17\u1b6b\u1cda-\u1cdb\u1dc0-\u1dcf\u1dfc\u1dfe\u1f71\u1f73\u1f75\u1f77\u1f79\u1f7b\u1f7d\u1fbb\u1fbe\u1fc9\u1fcb\u1fd3\u1fdb\u1fe3\u1feb\u1fee-\u1fef\u1ff9\u1ffb\u1ffd\u2000-\u2001\u20d0-\u20d1\u20d4-\u20d7\u20e7-\u20e9\u2126\u212a-\u212b\u2329-\u232a\u2adc\u302b-\u302c\uaab2-\uaab3\uf900-\ufa0d\ufa10\ufa12\ufa15-\ufa1e\ufa20\ufa22\ufa25-\ufa26\ufa2a-\ufa2d\ufa30-\ufa6d\ufa70-\ufad9\ufb1d\ufb1f\ufb2a-\ufb36\ufb38-\ufb3c\ufb3e\ufb40-\ufb41\ufb43-\ufb44\ufb46-\ufb4e\ufff0-\uffff]/g;
			e.exports = {
				quote: function (e) {
					const t = n.stringify(e);
					return (
						(i.lastIndex = 0),
						i.test(t)
							? (o ||
									(o = (function (e) {
										let t;
											const r = {};
											const o = [];
										for (t = 0; t < 65536; t++) o.push(String.fromCharCode(t));
										return (
											(e.lastIndex = 0),
											o.join('').replace(e, function (e) {
												return (r[e] = '\\u' + ('0000' + e.charCodeAt(0).toString(16)).slice(-4)), '';
											}),
											(e.lastIndex = 0),
											r
										);
									})(i)),
							  t.replace(i, function (e) {
									return o[e];
							  }))
							: t
					);
				}
			};
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e) {
				return {
					filterToEnabled: function (t, r) {
						const o = { main: [], facade: [] };
						return (
							t ? typeof t === 'string' && (t = [t]) : (t = []),
							e.forEach(function (e) {
								e &&
									((e.transportName === 'websocket' && !1 === r.websocket) ||
										(t.length && t.indexOf(e.transportName) === -1
											? e.transportName
											: e.enabled(r)
											? (e.transportName, o.main.push(e), e.facadeTransport && o.facade.push(e.facadeTransport))
											: e.transportName));
							}),
							o
						);
					}
				};
			};
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const r = {};
				['log', 'debug', 'warn'].forEach(function (e) {
					let o;
					try {
						o = t.console && t.console[e] && t.console[e].apply;
					} catch (e) {}
					r[e] = o
						? function () {
								return t.console[e].apply(t.console, arguments);
						  }
						: e === 'log'
						? function () {}
						: r.log;
				}),
					(e.exports = r);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(43);
			function i() {
				n.call(this), this.initEvent('close', !1, !1), (this.wasClean = !1), (this.code = 0), (this.reason = '');
			}
			o(i, n), (e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			const o = r(0);
				const n = r(43);
			function i(e) {
				n.call(this), this.initEvent('message', !1, !1), (this.data = e);
			}
			o(i, n), (e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			const o = r(5).EventEmitter;
				const n = r(0);
				const i = r(9);
				const s = r(40);
				const a = r(34);
				const u = r(24);
				const c = r(129);
				const l = r(130);
				const p = r(78);
			function f(e, t) {
				const r = this;
				o.call(this),
					setTimeout(function () {
						r.doXhr(e, t);
					}, 0);
			}
			n(f, o),
				(f._getReceiver = function (e, t, r) {
					return r.sameOrigin
						? new p(t, u)
						: a.enabled
						? new p(t, a)
						: s.enabled && r.sameScheme
						? new p(t, s)
						: l.enabled()
						? new l(e, t)
						: new p(t, c);
				}),
				(f.prototype.doXhr = function (e, t) {
					const r = this;
						const o = i.addPath(e, '/info');
					(this.xo = f._getReceiver(e, o, t)),
						(this.timeoutRef = setTimeout(function () {
							r._cleanup(!1), r.emit('finish');
						}, f.timeout)),
						this.xo.once('finish', function (e, t) {
							r._cleanup(!0), r.emit('finish', e, t);
						});
				}),
				(f.prototype._cleanup = function (e) {
					clearTimeout(this.timeoutRef), (this.timeoutRef = null), !e && this.xo && this.xo.close(), (this.xo = null);
				}),
				(f.prototype.close = function () {
					this.removeAllListeners(), this._cleanup(!1);
				}),
				(f.timeout = 8e3),
				(e.exports = f);
		},
		function (e, t, r) {
			'use strict';
			const o = r(5).EventEmitter;
			function n() {
				const e = this;
				o.call(this),
					(this.to = setTimeout(function () {
						e.emit('finish', 200, '{}');
					}, n.timeout));
			}
			r(0)(n, o),
				(n.prototype.close = function () {
					clearTimeout(this.to);
				}),
				(n.timeout = 2e3),
				(e.exports = n);
		},
		function (e, t, r) {
			'use strict';
			(function (t) {
				const o = r(5).EventEmitter;
					const n = r(0);
					const i = r(12);
					const s = r(14);
					const a = r(72);
					const u = r(77);
				function c(e, r) {
					const n = this;
					o.call(this);
					const c = function () {
						const t = (n.ifr = new a(u.transportName, r, e));
						t.once('message', function (e) {
							if (e) {
								let t;
								try {
									t = i.parse(e);
								} catch (e) {
									return n.emit('finish'), void n.close();
								}
								const r = t[0];
									const o = t[1];
								n.emit('finish', r, o);
							}
							n.close();
						}),
							t.once('close', function () {
								n.emit('finish'), n.close();
							});
					};
					t.document.body ? c() : s.attachEvent('load', c);
				}
				n(c, o),
					(c.enabled = function () {
						return a.enabled();
					}),
					(c.prototype.close = function () {
						this.ifr && this.ifr.close(), this.removeAllListeners(), (this.ifr = null);
					}),
					(e.exports = c);
			}).call(this, r(3));
		},
		function (e, t, r) {
			'use strict';
			const o = r(9);
				const n = r(14);
				const i = r(12);
				const s = r(132);
				const a = r(77);
				const u = r(26);
				const c = r(76);
			e.exports = function (e, t) {
				let r;
					const l = {};
				t.forEach(function (e) {
					e.facadeTransport && (l[e.facadeTransport.transportName] = e.facadeTransport);
				}),
					(l[a.transportName] = a),
					(e.bootstrap_iframe = function () {
						let t;
						u.currentWindowId = c.hash.slice(1);
						n.attachEvent('message', function (n) {
							if (n.source === parent && (void 0 === r && (r = n.origin), n.origin === r)) {
								let a;
								try {
									a = i.parse(n.data);
								} catch (e) {
									return void n.data;
								}
								if (a.windowId === u.currentWindowId)
									switch (a.type) {
										case 's':
											var p;
											try {
												p = i.parse(a.data);
											} catch (e) {
												a.data;
												break;
											}
											var f = p[0];
												var h = p[1];
												var d = p[2];
												var y = p[3];
											if (f !== e.version)
												throw new Error(
													'Incompatible SockJS! Main site uses: "' + f + '", the iframe: "' + e.version + '".'
												);
											if (!o.isOriginEqual(d, c.href) || !o.isOriginEqual(y, c.href))
												throw new Error(
													"Can't connect to different domain from within an iframe. (" +
														c.href +
														', ' +
														d +
														', ' +
														y +
														')'
												);
											t = new s(new l[h](d, y));
											break;
										case 'm':
											t._send(a.data);
											break;
										case 'c':
											t && t._close(), (t = null);
									}
							}
						}),
							u.postMessage('s');
					});
			};
		},
		function (e, t, r) {
			'use strict';
			const o = r(12);
				const n = r(26);
			function i(e) {
				(this._transport = e),
					e.on('message', this._transportMessage.bind(this)),
					e.on('close', this._transportClose.bind(this));
			}
			(i.prototype._transportClose = function (e, t) {
				n.postMessage('c', o.stringify([e, t]));
			}),
				(i.prototype._transportMessage = function (e) {
					n.postMessage('t', e);
				}),
				(i.prototype._send = function (e) {
					this._transport.send(e);
				}),
				(i.prototype._close = function () {
					this._transport.close(), this._transport.removeAllListeners();
				}),
				(e.exports = i);
		},
		function (e, t, r) {
			'use strict';
			e.exports = r(134);
		},
		function (e, t, r) {
			'use strict';
			const o = (e.exports = r(135));
			(o.build = 'full'),
				(o.tokenize = r(88)),
				(o.parse = r(149)),
				(o.common = r(150)),
				o.Root._configure(o.Type, o.parse, o.common);
		},
		function (e, t, r) {
			'use strict';
			const o = (e.exports = r(136));
			(o.build = 'light'),
				(o.load = function (e, t, r) {
					return typeof t === 'function' ? ((r = t), (t = new o.Root())) : t || (t = new o.Root()), t.load(e, r);
				}),
				(o.loadSync = function (e, t) {
					return t || (t = new o.Root()), t.loadSync(e);
				}),
				(o.encoder = r(83)),
				(o.decoder = r(84)),
				(o.verifier = r(85)),
				(o.converter = r(86)),
				(o.ReflectionObject = r(19)),
				(o.Namespace = r(27)),
				(o.Root = r(51)),
				(o.Enum = r(11)),
				(o.Type = r(46)),
				(o.Field = r(16)),
				(o.OneOf = r(36)),
				(o.MapField = r(47)),
				(o.Service = r(48)),
				(o.Method = r(49)),
				(o.Message = r(50)),
				(o.wrappers = r(87)),
				(o.types = r(20)),
				(o.util = r(4)),
				o.ReflectionObject._configure(o.Root),
				o.Namespace._configure(o.Type, o.Service, o.Enum),
				o.Root._configure(o.Type),
				o.Field._configure(o.Type);
		},
		function (e, t, r) {
			'use strict';
			const o = t;
			function n() {
				o.Reader._configure(o.BufferReader), o.util._configure();
			}
			(o.build = 'minimal'),
				(o.Writer = r(44)),
				(o.BufferWriter = r(143)),
				(o.Reader = r(45)),
				(o.BufferReader = r(144)),
				(o.util = r(13)),
				(o.rpc = r(81)),
				(o.roots = r(82)),
				(o.configure = n),
				o.Writer._configure(o.BufferWriter),
				n();
		},
		function (e, t, r) {
			'use strict';
			const o = t;
			o.length = function (e) {
				let t = e.length;
				if (!t) return 0;
				for (var r = 0; --t % 4 > 1 && e.charAt(t) === '='; ) ++r;
				return Math.ceil(3 * e.length) / 4 - r;
			};
			for (var n = new Array(64), i = new Array(123), s = 0; s < 64; )
				i[(n[s] = s < 26 ? s + 65 : s < 52 ? s + 71 : s < 62 ? s - 4 : (s - 59) | 43)] = s++;
			o.encode = function (e, t, r) {
				for (var o, i = null, s = [], a = 0, u = 0; t < r; ) {
					const c = e[t++];
					switch (u) {
						case 0:
							(s[a++] = n[c >> 2]), (o = (3 & c) << 4), (u = 1);
							break;
						case 1:
							(s[a++] = n[o | (c >> 4)]), (o = (15 & c) << 2), (u = 2);
							break;
						case 2:
							(s[a++] = n[o | (c >> 6)]), (s[a++] = n[63 & c]), (u = 0);
					}
					a > 8191 && ((i || (i = [])).push(String.fromCharCode.apply(String, s)), (a = 0));
				}
				return (
					u && ((s[a++] = n[o]), (s[a++] = 61), u === 1 && (s[a++] = 61)),
					i
						? (a && i.push(String.fromCharCode.apply(String, s.slice(0, a))), i.join(''))
						: String.fromCharCode.apply(String, s.slice(0, a))
				);
			};
			(o.decode = function (e, t, r) {
				for (var o, n = r, s = 0, a = 0; a < e.length; ) {
					let u = e.charCodeAt(a++);
					if (u === 61 && s > 1) break;
					if (void 0 === (u = i[u])) throw Error('invalid encoding');
					switch (s) {
						case 0:
							(o = u), (s = 1);
							break;
						case 1:
							(t[r++] = (o << 2) | ((48 & u) >> 4)), (o = u), (s = 2);
							break;
						case 2:
							(t[r++] = ((15 & o) << 4) | ((60 & u) >> 2)), (o = u), (s = 3);
							break;
						case 3:
							(t[r++] = ((3 & o) << 6) | u), (s = 0);
					}
				}
				if (s === 1) throw Error('invalid encoding');
				return r - n;
			}),
				(o.test = function (e) {
					return /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(e);
				});
		},
		function (e, t, r) {
			'use strict';
			function o() {
				this._listeners = {};
			}
			(e.exports = o),
				(o.prototype.on = function (e, t, r) {
					return (this._listeners[e] || (this._listeners[e] = [])).push({ fn: t, ctx: r || this }), this;
				}),
				(o.prototype.off = function (e, t) {
					if (void 0 === e) this._listeners = {};
					else if (void 0 === t) this._listeners[e] = [];
					else for (let r = this._listeners[e], o = 0; o < r.length; ) r[o].fn === t ? r.splice(o, 1) : ++o;
					return this;
				}),
				(o.prototype.emit = function (e) {
					const t = this._listeners[e];
					if (t) {
						for (var r = [], o = 1; o < arguments.length; ) r.push(arguments[o++]);
						for (o = 0; o < t.length; ) t[o].fn.apply(t[o++].ctx, r);
					}
					return this;
				});
		},
		function (e, t, r) {
			'use strict';
			function o(e) {
				return (
					typeof Float32Array !== 'undefined'
						? (function () {
								const t = new Float32Array([-0]);
									const r = new Uint8Array(t.buffer);
									const o = r[3] === 128;
								function n(e, o, n) {
									(t[0] = e), (o[n] = r[0]), (o[n + 1] = r[1]), (o[n + 2] = r[2]), (o[n + 3] = r[3]);
								}
								function i(e, o, n) {
									(t[0] = e), (o[n] = r[3]), (o[n + 1] = r[2]), (o[n + 2] = r[1]), (o[n + 3] = r[0]);
								}
								function s(e, o) {
									return (r[0] = e[o]), (r[1] = e[o + 1]), (r[2] = e[o + 2]), (r[3] = e[o + 3]), t[0];
								}
								function a(e, o) {
									return (r[3] = e[o]), (r[2] = e[o + 1]), (r[1] = e[o + 2]), (r[0] = e[o + 3]), t[0];
								}
								(e.writeFloatLE = o ? n : i),
									(e.writeFloatBE = o ? i : n),
									(e.readFloatLE = o ? s : a),
									(e.readFloatBE = o ? a : s);
						  })()
						: (function () {
								function t(e, t, r, o) {
									const n = t < 0 ? 1 : 0;
									if ((n && (t = -t), t === 0)) e(1 / t > 0 ? 0 : 2147483648, r, o);
									else if (isNaN(t)) e(2143289344, r, o);
									else if (t > 34028234663852886e22) e(((n << 31) | 2139095040) >>> 0, r, o);
									else if (t < 11754943508222875e-54) e(((n << 31) | Math.round(t / 1401298464324817e-60)) >>> 0, r, o);
									else {
										const i = Math.floor(Math.log(t) / Math.LN2);
										e(
											((n << 31) | ((i + 127) << 23) | (8388607 & Math.round(t * Math.pow(2, -i) * 8388608))) >>> 0,
											r,
											o
										);
									}
								}
								function r(e, t, r) {
									const o = e(t, r);
										const n = 2 * (o >> 31) + 1;
										const i = (o >>> 23) & 255;
										const s = 8388607 & o;
									return i === 255
										? s
											? NaN
											: n * (1 / 0)
										: i === 0
										? 1401298464324817e-60 * n * s
										: n * Math.pow(2, i - 150) * (s + 8388608);
								}
								(e.writeFloatLE = t.bind(null, n)),
									(e.writeFloatBE = t.bind(null, i)),
									(e.readFloatLE = r.bind(null, s)),
									(e.readFloatBE = r.bind(null, a));
						  })(),
					typeof Float64Array !== 'undefined'
						? (function () {
								const t = new Float64Array([-0]);
									const r = new Uint8Array(t.buffer);
									const o = r[7] === 128;
								function n(e, o, n) {
									(t[0] = e),
										(o[n] = r[0]),
										(o[n + 1] = r[1]),
										(o[n + 2] = r[2]),
										(o[n + 3] = r[3]),
										(o[n + 4] = r[4]),
										(o[n + 5] = r[5]),
										(o[n + 6] = r[6]),
										(o[n + 7] = r[7]);
								}
								function i(e, o, n) {
									(t[0] = e),
										(o[n] = r[7]),
										(o[n + 1] = r[6]),
										(o[n + 2] = r[5]),
										(o[n + 3] = r[4]),
										(o[n + 4] = r[3]),
										(o[n + 5] = r[2]),
										(o[n + 6] = r[1]),
										(o[n + 7] = r[0]);
								}
								function s(e, o) {
									return (
										(r[0] = e[o]),
										(r[1] = e[o + 1]),
										(r[2] = e[o + 2]),
										(r[3] = e[o + 3]),
										(r[4] = e[o + 4]),
										(r[5] = e[o + 5]),
										(r[6] = e[o + 6]),
										(r[7] = e[o + 7]),
										t[0]
									);
								}
								function a(e, o) {
									return (
										(r[7] = e[o]),
										(r[6] = e[o + 1]),
										(r[5] = e[o + 2]),
										(r[4] = e[o + 3]),
										(r[3] = e[o + 4]),
										(r[2] = e[o + 5]),
										(r[1] = e[o + 6]),
										(r[0] = e[o + 7]),
										t[0]
									);
								}
								(e.writeDoubleLE = o ? n : i),
									(e.writeDoubleBE = o ? i : n),
									(e.readDoubleLE = o ? s : a),
									(e.readDoubleBE = o ? a : s);
						  })()
						: (function () {
								function t(e, t, r, o, n, i) {
									const s = o < 0 ? 1 : 0;
									if ((s && (o = -o), o === 0)) e(0, n, i + t), e(1 / o > 0 ? 0 : 2147483648, n, i + r);
									else if (isNaN(o)) e(0, n, i + t), e(2146959360, n, i + r);
									else if (o > 17976931348623157e292) e(0, n, i + t), e(((s << 31) | 2146435072) >>> 0, n, i + r);
									else {
										let a;
										if (o < 22250738585072014e-324)
											e((a = o / 5e-324) >>> 0, n, i + t), e(((s << 31) | (a / 4294967296)) >>> 0, n, i + r);
										else {
											let u = Math.floor(Math.log(o) / Math.LN2);
											u === 1024 && (u = 1023),
												e((4503599627370496 * (a = o * Math.pow(2, -u))) >>> 0, n, i + t),
												e(((s << 31) | ((u + 1023) << 20) | ((1048576 * a) & 1048575)) >>> 0, n, i + r);
										}
									}
								}
								function r(e, t, r, o, n) {
									const i = e(o, n + t);
										const s = e(o, n + r);
										const a = 2 * (s >> 31) + 1;
										const u = (s >>> 20) & 2047;
										const c = 4294967296 * (1048575 & s) + i;
									return u === 2047
										? c
											? NaN
											: a * (1 / 0)
										: u === 0
										? 5e-324 * a * c
										: a * Math.pow(2, u - 1075) * (c + 4503599627370496);
								}
								(e.writeDoubleLE = t.bind(null, n, 0, 4)),
									(e.writeDoubleBE = t.bind(null, i, 4, 0)),
									(e.readDoubleLE = r.bind(null, s, 0, 4)),
									(e.readDoubleBE = r.bind(null, a, 4, 0));
						  })(),
					e
				);
			}
			function n(e, t, r) {
				(t[r] = 255 & e), (t[r + 1] = (e >>> 8) & 255), (t[r + 2] = (e >>> 16) & 255), (t[r + 3] = e >>> 24);
			}
			function i(e, t, r) {
				(t[r] = e >>> 24), (t[r + 1] = (e >>> 16) & 255), (t[r + 2] = (e >>> 8) & 255), (t[r + 3] = 255 & e);
			}
			function s(e, t) {
				return (e[t] | (e[t + 1] << 8) | (e[t + 2] << 16) | (e[t + 3] << 24)) >>> 0;
			}
			function a(e, t) {
				return ((e[t] << 24) | (e[t + 1] << 16) | (e[t + 2] << 8) | e[t + 3]) >>> 0;
			}
			e.exports = o(o);
		},
		function (e, t, r) {
			'use strict';
			const o = t;
			(o.length = function (e) {
				for (var t = 0, r = 0, o = 0; o < e.length; ++o)
					(r = e.charCodeAt(o)) < 128
						? (t += 1)
						: r < 2048
						? (t += 2)
						: (64512 & r) == 55296 && (64512 & e.charCodeAt(o + 1)) == 56320
						? (++o, (t += 4))
						: (t += 3);
				return t;
			}),
				(o.read = function (e, t, r) {
					if (r - t < 1) return '';
					for (var o, n = null, i = [], s = 0; t < r; )
						(o = e[t++]) < 128
							? (i[s++] = o)
							: o > 191 && o < 224
							? (i[s++] = ((31 & o) << 6) | (63 & e[t++]))
							: o > 239 && o < 365
							? ((o = (((7 & o) << 18) | ((63 & e[t++]) << 12) | ((63 & e[t++]) << 6) | (63 & e[t++])) - 65536),
							  (i[s++] = 55296 + (o >> 10)),
							  (i[s++] = 56320 + (1023 & o)))
							: (i[s++] = ((15 & o) << 12) | ((63 & e[t++]) << 6) | (63 & e[t++])),
							s > 8191 && ((n || (n = [])).push(String.fromCharCode.apply(String, i)), (s = 0));
					return n
						? (s && n.push(String.fromCharCode.apply(String, i.slice(0, s))), n.join(''))
						: String.fromCharCode.apply(String, i.slice(0, s));
				}),
				(o.write = function (e, t, r) {
					for (var o, n, i = r, s = 0; s < e.length; ++s)
						(o = e.charCodeAt(s)) < 128
							? (t[r++] = o)
							: o < 2048
							? ((t[r++] = (o >> 6) | 192), (t[r++] = (63 & o) | 128))
							: (64512 & o) == 55296 && (64512 & (n = e.charCodeAt(s + 1))) == 56320
							? ((o = 65536 + ((1023 & o) << 10) + (1023 & n)),
							  ++s,
							  (t[r++] = (o >> 18) | 240),
							  (t[r++] = ((o >> 12) & 63) | 128),
							  (t[r++] = ((o >> 6) & 63) | 128),
							  (t[r++] = (63 & o) | 128))
							: ((t[r++] = (o >> 12) | 224), (t[r++] = ((o >> 6) & 63) | 128), (t[r++] = (63 & o) | 128));
					return r - i;
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = function (e, t, r) {
				const o = r || 8192;
					const n = o >>> 1;
					let i = null;
					let s = o;
				return function (r) {
					if (r < 1 || r > n) return e(r);
					s + r > o && ((i = e(o)), (s = 0));
					const a = t.call(i, s, (s += r));
					return 7 & s && (s = 1 + (7 | s)), a;
				};
			};
		},
		function (e, t, r) {
			'use strict';
			e.exports = n;
			const o = r(13);
			function n(e, t) {
				(this.lo = e >>> 0), (this.hi = t >>> 0);
			}
			const i = (n.zero = new n(0, 0));
			(i.toNumber = function () {
				return 0;
			}),
				(i.zzEncode = i.zzDecode =
					function () {
						return this;
					}),
				(i.length = function () {
					return 1;
				});
			const s = (n.zeroHash = '\0\0\0\0\0\0\0\0');
			(n.fromNumber = function (e) {
				if (e === 0) return i;
				const t = e < 0;
				t && (e = -e);
				let r = e >>> 0;
					let o = ((e - r) / 4294967296) >>> 0;
				return (
					t && ((o = ~o >>> 0), (r = ~r >>> 0), ++r > 4294967295 && ((r = 0), ++o > 4294967295 && (o = 0))), new n(r, o)
				);
			}),
				(n.from = function (e) {
					if (typeof e === 'number') return n.fromNumber(e);
					if (o.isString(e)) {
						if (!o.Long) return n.fromNumber(parseInt(e, 10));
						e = o.Long.fromString(e);
					}
					return e.low || e.high ? new n(e.low >>> 0, e.high >>> 0) : i;
				}),
				(n.prototype.toNumber = function (e) {
					if (!e && this.hi >>> 31) {
						const t = (1 + ~this.lo) >>> 0;
							let r = ~this.hi >>> 0;
						return t || (r = (r + 1) >>> 0), -(t + 4294967296 * r);
					}
					return this.lo + 4294967296 * this.hi;
				}),
				(n.prototype.toLong = function (e) {
					return o.Long
						? new o.Long(0 | this.lo, 0 | this.hi, Boolean(e))
						: { low: 0 | this.lo, high: 0 | this.hi, unsigned: Boolean(e) };
				});
			const a = String.prototype.charCodeAt;
			(n.fromHash = function (e) {
				return e === s
					? i
					: new n(
							(a.call(e, 0) | (a.call(e, 1) << 8) | (a.call(e, 2) << 16) | (a.call(e, 3) << 24)) >>> 0,
							(a.call(e, 4) | (a.call(e, 5) << 8) | (a.call(e, 6) << 16) | (a.call(e, 7) << 24)) >>> 0
					  );
			}),
				(n.prototype.toHash = function () {
					return String.fromCharCode(
						255 & this.lo,
						(this.lo >>> 8) & 255,
						(this.lo >>> 16) & 255,
						this.lo >>> 24,
						255 & this.hi,
						(this.hi >>> 8) & 255,
						(this.hi >>> 16) & 255,
						this.hi >>> 24
					);
				}),
				(n.prototype.zzEncode = function () {
					const e = this.hi >> 31;
					return (
						(this.hi = (((this.hi << 1) | (this.lo >>> 31)) ^ e) >>> 0), (this.lo = ((this.lo << 1) ^ e) >>> 0), this
					);
				}),
				(n.prototype.zzDecode = function () {
					const e = -(1 & this.lo);
					return (
						(this.lo = (((this.lo >>> 1) | (this.hi << 31)) ^ e) >>> 0), (this.hi = ((this.hi >>> 1) ^ e) >>> 0), this
					);
				}),
				(n.prototype.length = function () {
					const e = this.lo;
						const t = ((this.lo >>> 28) | (this.hi << 4)) >>> 0;
						const r = this.hi >>> 24;
					return r === 0
						? t === 0
							? e < 16384
								? e < 128
									? 1
									: 2
								: e < 2097152
								? 3
								: 4
							: t < 16384
							? t < 128
								? 5
								: 6
							: t < 2097152
							? 7
							: 8
						: r < 128
						? 9
						: 10;
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = s;
			const o = r(44);
			(s.prototype = Object.create(o.prototype)).constructor = s;
			const n = r(13);
				const i = n.Buffer;
			function s() {
				o.call(this);
			}
			s.alloc = function (e) {
				return (s.alloc = n._Buffer_allocUnsafe)(e);
			};
			const a =
				i && i.prototype instanceof Uint8Array && i.prototype.set.name === 'set'
					? function (e, t, r) {
							t.set(e, r);
					  }
					: function (e, t, r) {
							if (e.copy) e.copy(t, r, 0, e.length);
							else for (let o = 0; o < e.length; ) t[r++] = e[o++];
					  };
			function u(e, t, r) {
				e.length < 40 ? n.utf8.write(e, t, r) : t.utf8Write(e, r);
			}
			(s.prototype.bytes = function (e) {
				n.isString(e) && (e = n._Buffer_from(e, 'base64'));
				const t = e.length >>> 0;
				return this.uint32(t), t && this._push(a, t, e), this;
			}),
				(s.prototype.string = function (e) {
					const t = i.byteLength(e);
					return this.uint32(t), t && this._push(u, t, e), this;
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = i;
			const o = r(45);
			(i.prototype = Object.create(o.prototype)).constructor = i;
			const n = r(13);
			function i(e) {
				o.call(this, e);
			}
			n.Buffer && (i.prototype._slice = n.Buffer.prototype.slice),
				(i.prototype.string = function () {
					const e = this.uint32();
					return this.buf.utf8Slice(this.pos, (this.pos = Math.min(this.pos + e, this.len)));
				});
		},
		function (e, t, r) {
			'use strict';
			e.exports = n;
			const o = r(13);
			function n(e, t, r) {
				if (typeof e !== 'function') throw TypeError('rpcImpl must be a function');
				o.EventEmitter.call(this),
					(this.rpcImpl = e),
					(this.requestDelimited = Boolean(t)),
					(this.responseDelimited = Boolean(r));
			}
			((n.prototype = Object.create(o.EventEmitter.prototype)).constructor = n),
				(n.prototype.rpcCall = function e(t, r, n, i, s) {
					if (!i) throw TypeError('request must be specified');
					const a = this;
					if (!s) return o.asPromise(e, a, t, r, n, i);
					if (a.rpcImpl)
						try {
							return a.rpcImpl(t, r[a.requestDelimited ? 'encodeDelimited' : 'encode'](i).finish(), function (e, r) {
								if (e) return a.emit('error', e, t), s(e);
								if (r !== null) {
									if (!(r instanceof n))
										try {
											r = n[a.responseDelimited ? 'decodeDelimited' : 'decode'](r);
										} catch (e) {
											return a.emit('error', e, t), s(e);
										}
									return a.emit('data', r, t), s(null, r);
								}
								a.end(!0);
							});
						} catch (e) {
							return (
								a.emit('error', e, t),
								void setTimeout(function () {
									s(e);
								}, 0)
							);
						}
					else
						setTimeout(function () {
							s(Error('already ended'));
						}, 0);
				}),
				(n.prototype.end = function (e) {
					return (
						this.rpcImpl && (e || this.rpcImpl(null, null, null), (this.rpcImpl = null), this.emit('end').off()), this
					);
				});
		},
		function (e, t, r) {
			'use strict';
			function o(e, t) {
				typeof e === 'string' && ((t = e), (e = void 0));
				const r = [];
				function n(e) {
					if (typeof e !== 'string') {
						let t = i();
						if ((o.verbose && console.log('codegen: ' + t), (t = 'return ' + t), e)) {
							for (var s = Object.keys(e), a = new Array(s.length + 1), u = new Array(s.length), c = 0; c < s.length; )
								(a[c] = s[c]), (u[c] = e[s[c++]]);
							return (a[c] = t), Function.apply(null, a).apply(null, u);
						}
						return Function(t)();
					}
					for (var l = new Array(arguments.length - 1), p = 0; p < l.length; ) l[p] = arguments[++p];
					if (
						((p = 0),
						(e = e.replace(/%([%dfijs])/g, function (e, t) {
							const r = l[p++];
							switch (t) {
								case 'd':
								case 'f':
									return String(Number(r));
								case 'i':
									return String(Math.floor(r));
								case 'j':
									return JSON.stringify(r);
								case 's':
									return String(r);
							}
							return '%';
						})),
						p !== l.length)
					)
						throw Error('parameter count mismatch');
					return r.push(e), n;
				}
				function i(o) {
					return 'function ' + (o || t || '') + '(' + ((e && e.join(',')) || '') + '){\n  ' + r.join('\n  ') + '\n}';
				}
				return (n.toString = i), n;
			}
			(e.exports = o), (o.verbose = !1);
		},
		function (e, t, r) {
			'use strict';
			e.exports = i;
			const o = r(79);
				const n = r(80)('fs');
			function i(e, t, r) {
				return (
					typeof t === 'function' ? ((r = t), (t = {})) : t || (t = {}),
					r
						? !t.xhr && n && n.readFile
							? n.readFile(e, function (o, n) {
									return o && typeof XMLHttpRequest !== 'undefined'
										? i.xhr(e, t, r)
										: o
										? r(o)
										: r(null, t.binary ? n : n.toString('utf8'));
							  })
							: i.xhr(e, t, r)
						: o(i, this, e, t)
				);
			}
			i.xhr = function (e, t, r) {
				const o = new XMLHttpRequest();
				(o.onreadystatechange = function () {
					if (o.readyState === 4) {
						if (o.status !== 0 && o.status !== 200) return r(Error('status ' + o.status));
						if (t.binary) {
							let e = o.response;
							if (!e) {
								e = [];
								for (let n = 0; n < o.responseText.length; ++n) e.push(255 & o.responseText.charCodeAt(n));
							}
							return r(null, typeof Uint8Array !== 'undefined' ? new Uint8Array(e) : e);
						}
						return r(null, o.responseText);
					}
				}),
					t.binary &&
						('overrideMimeType' in o && o.overrideMimeType('text/plain; charset=x-user-defined'),
						(o.responseType = 'arraybuffer')),
					o.open('GET', e),
					o.send();
			};
		},
		function (e, t, r) {
			'use strict';
			const o = t;
				const n = (o.isAbsolute = function (e) {
					return /^(?:\/|\w+:)/.test(e);
				});
				const i = (o.normalize = function (e) {
					const t = (e = e.replace(/\\/g, '/').replace(/\/{2,}/g, '/')).split('/');
						const r = n(e);
						let o = '';
					r && (o = t.shift() + '/');
					for (let i = 0; i < t.length; )
						t[i] === '..'
							? i > 0 && t[i - 1] !== '..'
								? t.splice(--i, 2)
								: r
								? t.splice(i, 1)
								: ++i
							: t[i] === '.'
							? t.splice(i, 1)
							: ++i;
					return o + t.join('/');
				});
			o.resolve = function (e, t, r) {
				return (
					r || (t = i(t)),
					n(t) ? t : (r || (e = i(e)), (e = e.replace(/(?:\/|^)[^/]+$/, '')).length ? i(e + '/' + t) : t)
				);
			};
		},
		function (e, t, r) {
			'use strict';
			(e.exports = T), (T.filename = null), (T.defaults = { keepCase: !1 });
			const o = r(88);
				const n = r(51);
				const i = r(46);
				const s = r(16);
				const a = r(47);
				const u = r(36);
				const c = r(11);
				const l = r(48);
				const p = r(49);
				const f = r(20);
				const h = r(4);
				const d = /^[1-9][0-9]*$/;
				const y = /^-?[1-9][0-9]*$/;
				const m = /^0[x][0-9a-fA-F]+$/;
				const g = /^-?0[x][0-9a-fA-F]+$/;
				const v = /^0[0-7]+$/;
				const _ = /^-?0[0-7]+$/;
				const b = /^(?![eE])[0-9]*(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?$/;
				const E = /^[a-zA-Z_][a-zA-Z_0-9]*$/;
				const O = /^(?:\.?[a-zA-Z_][a-zA-Z_0-9]*)(?:\.[a-zA-Z_][a-zA-Z_0-9]*)*$/;
				const N = /^(?:\.[a-zA-Z_][a-zA-Z_0-9]*)+$/;
			function T(e, t, r) {
				t instanceof n || ((r = t), (t = new n())), r || (r = T.defaults);
				let S;
					let I;
					let w;
					let C;
					let R;
					const x = o(e, r.alternateCommentMode || !1);
					const A = x.next;
					const j = x.push;
					const k = x.peek;
					const M = x.skip;
					const U = x.cmnt;
					let B = !0;
					let L = !1;
					let D = t;
					const P = r.keepCase
						? function (e) {
								return e;
						  }
						: h.camelCase;
				function F(e, t, r) {
					const o = T.filename;
					return (
						r || (T.filename = null),
						Error('illegal ' + (t || 'token') + " '" + e + "' (" + (o ? o + ', ' : '') + 'line ' + x.line + ')')
					);
				}
				function W() {
					let e;
						const t = [];
					do {
						if ((e = A()) !== '"' && e !== "'") throw F(e);
						t.push(A()), M(e), (e = k());
					} while (e === '"' || e === "'");
					return t.join('');
				}
				function G(e) {
					const t = A();
					switch (t) {
						case "'":
						case '"':
							return j(t), W();
						case 'true':
						case 'TRUE':
							return !0;
						case 'false':
						case 'FALSE':
							return !1;
					}
					try {
						return (function (e, t) {
							let r = 1;
							e.charAt(0) === '-' && ((r = -1), (e = e.substring(1)));
							switch (e) {
								case 'inf':
								case 'INF':
								case 'Inf':
									return r * (1 / 0);
								case 'nan':
								case 'NAN':
								case 'Nan':
								case 'NaN':
									return NaN;
								case '0':
									return 0;
							}
							if (d.test(e)) return r * parseInt(e, 10);
							if (m.test(e)) return r * parseInt(e, 16);
							if (v.test(e)) return r * parseInt(e, 8);
							if (b.test(e)) return r * parseFloat(e);
							throw F(e, 'number', t);
						})(t, !0);
					} catch (r) {
						if (e && O.test(t)) return t;
						throw F(t, 'value');
					}
				}
				function q(e, t) {
					let r, o;
					do {
						!t || ((r = k()) !== '"' && r !== "'") ? e.push([(o = z(A())), M('to', !0) ? z(A()) : o]) : e.push(W());
					} while (M(',', !0));
					M(';');
				}
				function z(e, t) {
					switch (e) {
						case 'max':
						case 'MAX':
						case 'Max':
							return 536870911;
						case '0':
							return 0;
					}
					if (!t && e.charAt(0) === '-') throw F(e, 'id');
					if (y.test(e)) return parseInt(e, 10);
					if (g.test(e)) return parseInt(e, 16);
					if (_.test(e)) return parseInt(e, 8);
					throw F(e, 'id');
				}
				function J() {
					if (void 0 !== S) throw F('package');
					if (((S = A()), !O.test(S))) throw F(S, 'name');
					(D = D.define(S)), M(';');
				}
				function H() {
					let e;
						let t = k();
					switch (t) {
						case 'weak':
							(e = w || (w = [])), A();
							break;
						case 'public':
							A();
						default:
							e = I || (I = []);
					}
					(t = W()), M(';'), e.push(t);
				}
				function K() {
					if ((M('='), (C = W()), !(L = C === 'proto3') && C !== 'proto2')) throw F(C, 'syntax');
					M(';');
				}
				function V(e, t) {
					switch (t) {
						case 'option':
							return Z(e, t), M(';'), !0;
						case 'message':
							return (
								(function (e, t) {
									if (!E.test((t = A()))) throw F(t, 'type name');
									const r = new i(t);
									$(r, function (e) {
										if (!V(r, e))
											switch (e) {
												case 'map':
													!(function (e) {
														M('<');
														const t = A();
														if (void 0 === f.mapKey[t]) throw F(t, 'type');
														M(',');
														const r = A();
														if (!O.test(r)) throw F(r, 'type');
														M('>');
														const o = A();
														if (!E.test(o)) throw F(o, 'name');
														M('=');
														const n = new a(P(o), z(A()), t, r);
														$(
															n,
															function (e) {
																if (e !== 'option') throw F(e);
																Z(n, e), M(';');
															},
															function () {
																ee(n);
															}
														),
															e.add(n);
													})(r);
													break;
												case 'required':
												case 'optional':
												case 'repeated':
													X(r, e);
													break;
												case 'oneof':
													!(function (e, t) {
														if (!E.test((t = A()))) throw F(t, 'name');
														const r = new u(P(t));
														$(r, function (e) {
															e === 'option' ? (Z(r, e), M(';')) : (j(e), X(r, 'optional'));
														}),
															e.add(r);
													})(r, e);
													break;
												case 'extensions':
													q(r.extensions || (r.extensions = []));
													break;
												case 'reserved':
													q(r.reserved || (r.reserved = []), !0);
													break;
												default:
													if (!L || !O.test(e)) throw F(e);
													j(e), X(r, 'optional');
											}
									}),
										e.add(r);
								})(e, t),
								!0
							);
						case 'enum':
							return (
								(function (e, t) {
									if (!E.test((t = A()))) throw F(t, 'name');
									const r = new c(t);
									$(r, function (e) {
										switch (e) {
											case 'option':
												Z(r, e), M(';');
												break;
											case 'reserved':
												q(r.reserved || (r.reserved = []), !0);
												break;
											default:
												!(function (e, t) {
													if (!E.test(t)) throw F(t, 'name');
													M('=');
													const r = z(A(), !0);
														const o = {};
													$(
														o,
														function (e) {
															if (e !== 'option') throw F(e);
															Z(o, e), M(';');
														},
														function () {
															ee(o);
														}
													),
														e.add(t, r, o.comment);
												})(r, e);
										}
									}),
										e.add(r);
								})(e, t),
								!0
							);
						case 'service':
							return (
								(function (e, t) {
									if (!E.test((t = A()))) throw F(t, 'service name');
									const r = new l(t);
									$(r, function (e) {
										if (!V(r, e)) {
											if (e !== 'rpc') throw F(e);
											!(function (e, t) {
												const r = t;
												if (!E.test((t = A()))) throw F(t, 'name');
												let o;
													let n;
													let i;
													let s;
													const a = t;
												M('('), M('stream', !0) && (n = !0);
												if (!O.test((t = A()))) throw F(t);
												(o = t), M(')'), M('returns'), M('('), M('stream', !0) && (s = !0);
												if (!O.test((t = A()))) throw F(t);
												(i = t), M(')');
												const u = new p(a, r, o, i, n, s);
												$(u, function (e) {
													if (e !== 'option') throw F(e);
													Z(u, e), M(';');
												}),
													e.add(u);
											})(r, e);
										}
									}),
										e.add(r);
								})(e, t),
								!0
							);
						case 'extend':
							return (
								(function (e, t) {
									if (!O.test((t = A()))) throw F(t, 'reference');
									const r = t;
									$(null, function (t) {
										switch (t) {
											case 'required':
											case 'repeated':
											case 'optional':
												X(e, t, r);
												break;
											default:
												if (!L || !O.test(t)) throw F(t);
												j(t), X(e, 'optional', r);
										}
									});
								})(e, t),
								!0
							);
					}
					return !1;
				}
				function $(e, t, r) {
					const o = x.line;
					if ((e && ((e.comment = U()), (e.filename = T.filename)), M('{', !0))) {
						for (var n; (n = A()) !== '}'; ) t(n);
						M(';', !0);
					} else r && r(), M(';'), e && typeof e.comment !== 'string' && (e.comment = U(o));
				}
				function X(e, t, r) {
					const o = A();
					if (o !== 'group') {
						if (!O.test(o)) throw F(o, 'type');
						let n = A();
						if (!E.test(n)) throw F(n, 'name');
						(n = P(n)), M('=');
						const a = new s(n, z(A()), o, t, r);
						$(
							a,
							function (e) {
								if (e !== 'option') throw F(e);
								Z(a, e), M(';');
							},
							function () {
								ee(a);
							}
						),
							e.add(a),
							L || !a.repeated || (void 0 === f.packed[o] && void 0 !== f.basic[o]) || a.setOption('packed', !1, !0);
					} else
						!(function (e, t) {
							let r = A();
							if (!E.test(r)) throw F(r, 'name');
							const o = h.lcFirst(r);
							r === o && (r = h.ucFirst(r));
							M('=');
							const n = z(A());
								const a = new i(r);
							a.group = !0;
							const u = new s(o, n, r, t);
							(u.filename = T.filename),
								$(a, function (e) {
									switch (e) {
										case 'option':
											Z(a, e), M(';');
											break;
										case 'required':
										case 'optional':
										case 'repeated':
											X(a, e);
											break;
										default:
											throw F(e);
									}
								}),
								e.add(a).add(u);
						})(e, t);
				}
				function Z(e, t) {
					const r = M('(', !0);
					if (!O.test((t = A()))) throw F(t, 'name');
					let o = t;
					r && (M(')'), (o = '(' + o + ')'), (t = k()), N.test(t) && ((o += t), A())), M('='), Y(e, o);
				}
				function Y(e, t) {
					if (M('{', !0))
						do {
							if (!E.test((R = A()))) throw F(R, 'name');
							k() === '{' ? Y(e, t + '.' + R) : (M(':'), k() === '{' ? Y(e, t + '.' + R) : Q(e, t + '.' + R, G(!0))),
								M(',', !0);
						} while (!M('}', !0));
					else Q(e, t, G(!0));
				}
				function Q(e, t, r) {
					e.setOption && e.setOption(t, r);
				}
				function ee(e) {
					if (M('[', !0)) {
						do {
							Z(e, 'option');
						} while (M(',', !0));
						M(']');
					}
					return e;
				}
				for (; (R = A()) !== null; )
					switch (R) {
						case 'package':
							if (!B) throw F(R);
							J();
							break;
						case 'import':
							if (!B) throw F(R);
							H();
							break;
						case 'syntax':
							if (!B) throw F(R);
							K();
							break;
						case 'option':
							if (!B) throw F(R);
							Z(D, R), M(';');
							break;
						default:
							if (V(D, R)) {
								B = !1;
								continue;
							}
							throw F(R);
					}
				return (T.filename = null), { package: S, imports: I, weakImports: w, syntax: C, root: t };
			}
		},
		function (e, t, r) {
			'use strict';
			e.exports = i;
			let o;
				const n = /\/|\./;
			function i(e, t) {
				n.test(e) ||
					((e = 'google/protobuf/' + e + '.proto'),
					(t = { nested: { google: { nested: { protobuf: { nested: t } } } } })),
					(i[e] = t);
			}
			i('any', { Any: { fields: { type_url: { type: 'string', id: 1 }, value: { type: 'bytes', id: 2 } } } }),
				i('duration', {
					Duration: (o = { fields: { seconds: { type: 'int64', id: 1 }, nanos: { type: 'int32', id: 2 } } })
				}),
				i('timestamp', { Timestamp: o }),
				i('empty', { Empty: { fields: {} } }),
				i('struct', {
					Struct: { fields: { fields: { keyType: 'string', type: 'Value', id: 1 } } },
					Value: {
						oneofs: {
							kind: { oneof: ['nullValue', 'numberValue', 'stringValue', 'boolValue', 'structValue', 'listValue'] }
						},
						fields: {
							nullValue: { type: 'NullValue', id: 1 },
							numberValue: { type: 'double', id: 2 },
							stringValue: { type: 'string', id: 3 },
							boolValue: { type: 'bool', id: 4 },
							structValue: { type: 'Struct', id: 5 },
							listValue: { type: 'ListValue', id: 6 }
						}
					},
					NullValue: { values: { NULL_VALUE: 0 } },
					ListValue: { fields: { values: { rule: 'repeated', type: 'Value', id: 1 } } }
				}),
				i('wrappers', {
					DoubleValue: { fields: { value: { type: 'double', id: 1 } } },
					FloatValue: { fields: { value: { type: 'float', id: 1 } } },
					Int64Value: { fields: { value: { type: 'int64', id: 1 } } },
					UInt64Value: { fields: { value: { type: 'uint64', id: 1 } } },
					Int32Value: { fields: { value: { type: 'int32', id: 1 } } },
					UInt32Value: { fields: { value: { type: 'uint32', id: 1 } } },
					BoolValue: { fields: { value: { type: 'bool', id: 1 } } },
					StringValue: { fields: { value: { type: 'string', id: 1 } } },
					BytesValue: { fields: { value: { type: 'bytes', id: 1 } } }
				}),
				i('field_mask', { FieldMask: { fields: { paths: { rule: 'repeated', type: 'string', id: 1 } } } }),
				(i.get = function (e) {
					return i[e] || null;
				});
		},
		function (e, t, r) {
			'use strict';
			const o = r(1);
			Object.defineProperty(t, '__esModule', { value: !0 }), (t.default = void 0);
			let n;
				let i;
				let s;
				let a;
				const u = o(r(6));
				const c = o(r(7));
				const l = function () {};
				const p = (0, c.default)();
				const f = function (e) {
					e = e || !0;
					const t =
						(function () {
							try {
								return new window.XMLHttpRequest();
							} catch (e) {
								return !1;
							}
						})() ||
						(function () {
							try {
								return new window.ActiveXObject('Microsoft.XMLHTTP');
							} catch (e) {
								return !1;
							}
						})();
					if ('withCredentials' in t) return t;
					if (!e) return t;
					if (void 0 === window.XDomainRequest) return t;
					const r = new XDomainRequest();
					return (
						(r.readyState = 0),
						(r.status = 100),
						(r.onreadystatechange = l),
						(r.onload = function () {
							(r.readyState = 4), (r.status = 200);
							const e = new ActiveXObject('Microsoft.XMLDOM');
							(e.async = 'false'),
								e.loadXML(r.responseText),
								(r.responseXML = e),
								(r.response = r.responseText),
								r.onreadystatechange();
						}),
						(r.ontimeout = r.onerror =
							function () {
								(r.readyState = 4), (r.status = 500), r.onreadystatechange();
							}),
						r
					);
				};
				const h = (function () {
					if ('ActiveXObject' in window)
						try {
							return new ActiveXObject('ShockwaveFlash.ShockwaveFlash');
						} catch (e) {
							return 0;
						}
					else if (navigator.plugins && navigator.plugins.length > 0) return navigator.plugins['Shockwave Flash'];
					return 0;
				})();
				const d = f();
				const y = typeof FormData !== 'undefined';
				const m = typeof Blob !== 'undefined';
				const g = d.setRequestHeader || !1;
				const v = d.overrideMimeType || !1;
				const _ = g && y;
				const b = _ || h;
				const E = g && (m || v);
			Object.keys ||
				(Object.keys =
					((n = Object.prototype.hasOwnProperty),
					(i = !{ toString: null }.propertyIsEnumerable('toString')),
					(a = (s = [
						'toString',
						'toLocaleString',
						'valueOf',
						'hasOwnProperty',
						'isPrototypeOf',
						'propertyIsEnumerable',
						'constructor'
					]).length),
					function (e) {
						if ((0, u.default)(e) !== 'object' && (typeof e !== 'function' || e === null))
							throw new TypeError('Object.keys called on non-object');
						let t;
							let r;
							const o = [];
						for (t in e) n.call(e, t) && o.push(t);
						if (i) for (r = 0; r < a; r++) n.call(e, s[r]) && o.push(s[r]);
						return o;
					}));
			let O;
				let N;
				var T = {
					hasFormData: y,
					hasBlob: m,
					emptyfn: l,
					isCanSetRequestHeader: g,
					hasOverrideMimeType: v,
					isCanUploadFileAsync: _,
					isCanUploadFile: b,
					isCanDownLoadFile: E,
					isSupportWss: (function () {
						const e = [/MQQBrowser[\/]5([.]\d+)?\sTBS/];
						if (!window.WebSocket) return !1;
						for (let t = window.navigator.userAgent, r = 0, o = e.length; r < o; r++) if (e[r].test(t)) return !1;
						return !0;
					})(),
					getIEVersion:
						((N = navigator.userAgent),
						(O = N.match(/MSIE (\d+)/i)) && O[1]
							? +O[1]
							: ((O = N.match(/Trident\/(\d+)/i)) && O[1] && { 4: 8, 5: 9, 6: 10, 7: 11 }[O[1]]) || null),
					stringify: function (e) {
						if (typeof JSON !== 'undefined' && JSON.stringify) return JSON.stringify(e);
						let t = '';
							const r = [];
						return (function e(o) {
							let n = !1;
							for (const i in (Object.prototype.toString.call(o) === '[object Array]'
								? (r.push(']', '['), (n = !0))
								: Object.prototype.toString.call(o) === '[object Object]' && r.push('}', '{'),
							o))
								Object.prototype.toString.call(o[i]) === '[object Null]'
									? (o[i] = 'null')
									: Object.prototype.toString.call(o[i]) === '[object Undefined]' && (o[i] = 'undefined'),
									o[i] && (0, u.default)(o[i]) === 'object'
										? (t += ',' + (n ? '' : '"' + i + '":' + (n ? '"' : '')) + e(o[i]))
										: (t += ',"' + (n ? '' : i + '":"') + o[i] + '"');
							return t != '' && (t = t.slice(1)), r.pop() + t + r.pop();
						})(e);
					},
					login: function (e) {
						const t = (e = e || {}).success || l;
							const r = e.error || l;
							const o = (e.appKey || '').split('#');
						if (o.length !== 2) return r({ type: p.WEBIM_CONNCTION_APPKEY_NOT_ASSIGN_ERROR }), !1;
						const n = o[0];
							const i = o[1];
							var s = s || e.https;
							const a = e.user || '';
							const u = e.pwd || '';
							const c = e.apiUrl;
							const f = { grant_type: 'password', username: a, password: u, timestamp: +new Date() };
						e = { url: c + '/' + n + '/' + i + '/token', dataType: 'json', data: T.stringify(f), success: t, error: r };
						return T.ajax(e);
					},
					getFileUrl: function (e) {
						const t = { url: '', filename: '', filetype: '', data: '' };
							const r = typeof e === 'string' ? document.getElementById(e) : e;
						if (!T.isCanUploadFileAsync || !r) return t;
						try {
							if (window.URL.createObjectURL) {
								const o = r.files;
								if (o.length > 0) {
									var n = o.item(0);
									(t.data = n), (t.url = window.URL.createObjectURL(n)), (t.filename = n.name || '');
								}
							} else {
								n = document.getElementById(e).value;
								t.url = n;
								const i = n.lastIndexOf('/');
									const s = n.lastIndexOf('\\');
									const a = Math.max(i, s);
								t.filename = a < 0 ? n : n.substring(a + 1);
							}
							const u = t.filename.lastIndexOf('.');
							return u != -1 && (t.filetype = t.filename.substring(u + 1).toLowerCase()), t;
						} catch (e) {
							throw e;
						}
					},
					getFileSize: function (e) {
						let t = this.getFileLength(e);
						if (t > 1e7) return !1;
						const r = Math.round(t / 1e3);
						if (r < 1e3) t = r + ' KB';
						else if (r >= 1e3) {
							const o = r / 1e3;
							if (o < 1e3) t = o.toFixed(1) + ' MB';
							else t = (o / 1e3).toFixed(1) + ' GB';
						}
						return t;
					},
					getFileLength: function (e) {
						let t = 0;
						if (e)
							if (e.files) e.files.length > 0 && (t = e.files[0].size);
							else if (e.select && 'ActiveXObject' in window) {
								e.select(), (t = (e = new ActiveXObject('Scripting.FileSystemObject').GetFile(e.value)).Size);
							}
						return t;
					},
					hasFlash: h,
					trim: function (e) {
						return (e = typeof e === 'string' ? e : '').trim ? e.trim() : e.replace(/^\s|\s$/g, '');
					},
					parseEmoji: function (e) {
						if (void 0 === WebIM.Emoji || void 0 === WebIM.Emoji.map) return e;
						const t = WebIM.Emoji;
						for (const r in t.map)
							if (t.map.hasOwnProperty(r))
								for (; e.indexOf(r) > -1; ) e = e.replace(r, '<img class="emoji" src="' + t.path + t.map[r] + '" />');
						return e;
					},
					parseLink: function (e) {
						return (e = e.replace(
							/(https?\:\/\/|www\.)([a-zA-Z0-9-]+(\.[a-zA-Z0-9]+)+)(\:[0-9]{2,4})?\/?((\.[:_0-9a-zA-Z-]+)|[:_0-9a-zA-Z-]*\/?)*\??[:_#@*&%0-9a-zA-Z-/=]*/gm,
							function (e) {
								return "<a href='" + (/^https?/gm.test(e) ? e : '//' + e) + "' target='_blank'>" + e + '</a>';
							}
						));
					},
					parseJSON: function (e) {
						if (window.JSON && window.JSON.parse) return window.JSON.parse(e + '');
						let t;
							let r = null;
							const o = T.trim(e + '');
						return o &&
							!T.trim(
								o.replace(
									/(,)|(\[|{)|(}|])|"(?:[^"\\\r\n]|\\["\\\/bfnrt]|\\u[\da-fA-F]{4})*"\s*:?|true|false|null|-?(?!0\d)\d+(?:\.\d+|)(?:[eE][+-]?\d+|)/g,
									function (e, o, n, i) {
										return t && o && (r = 0), r === 0 ? e : ((t = n || o), (r += !i - !n), '');
									}
								)
							)
							? Function('return ' + o)()
							: Function('Invalid JSON: ' + e)();
					},
					parseUploadResponse: function (e) {
						return e.indexOf('callback') > -1 ? e.slice(9, -1) : e;
					},
					parseDownloadResponse: function (e) {
						return (e && e.type && e.type === 'application/json') ||
							Object.prototype.toString.call(e).indexOf('Blob') < 0
							? this.url + '?token='
							: window.URL.createObjectURL(e);
					},
					uploadFile: function (e) {
						((e = e || {}).onFileUploadProgress = e.onFileUploadProgress || l),
							(e.onFileUploadComplete = e.onFileUploadComplete || l),
							(e.onFileUploadError = e.onFileUploadError || l),
							(e.onFileUploadCanceled = e.onFileUploadCanceled || l);
						const t = e.accessToken || this.context.accessToken;
						if (t) {
							let r;
								let o;
								let n;
								const i = e.appKey || this.context.appKey || '';
							if ((i && ((r = (n = i.split('#'))[0]), (o = n[1])), r || o)) {
								let s = e.apiUrl;
								this.isHttpDNS && (s = this.apiUrl);
								const a = e.uploadUrl || s + '/' + r + '/' + o + '/chatfiles';
								if (T.isCanUploadFileAsync)
									if ((e.file.data ? e.file.data.size : void 0) <= 0)
										e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_ERROR, id: e.id });
									else {
										const u = T.xmlrequest();
										u.upload && u.upload.addEventListener('progress', e.onFileUploadProgress, !1),
											u.addEventListener
												? (u.addEventListener('abort', e.onFileUploadCanceled, !1),
												  u.addEventListener(
														'load',
														function (t) {
															try {
																const r = T.parseJSON(u.responseText);
																if (u.status === 400 && r.error === 'content improper')
																	return e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_ERROR, data: r }), !1;
																try {
																	e.onFileUploadComplete(r);
																} catch (t) {
																	e.onFileUploadError({ type: p.WEBIM_CONNCTION_CALLBACK_INNER_ERROR, data: t });
																}
															} catch (t) {
																e.onFileUploadError({
																	type: p.WEBIM_UPLOADFILE_ERROR,
																	data: u.responseText,
																	id: e.id,
																	xhr: u
																});
															}
														},
														!1
												  ),
												  u.addEventListener(
														'error',
														function (t) {
															e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_ERROR, id: e.id, xhr: u });
														},
														!1
												  ))
												: u.onreadystatechange &&
												  (u.onreadystatechange = function () {
														if (u.readyState === 4)
															if (ajax.status === 200)
																try {
																	const t = T.parseJSON(u.responseText);
																	if (u.status === 400 && t.error === 'content improper')
																		return e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_ERROR, data: t }), !1;
																	e.onFileUploadComplete(t);
																} catch (t) {
																	e.onFileUploadError({
																		type: p.WEBIM_UPLOADFILE_ERROR,
																		data: u.responseText,
																		id: e.id,
																		xhr: u
																	});
																}
															else
																e.onFileUploadError({
																	type: p.WEBIM_UPLOADFILE_ERROR,
																	data: u.responseText,
																	id: e.id,
																	xhr: u
																});
														else u.abort(), e.onFileUploadCanceled();
												  }),
											u.open('POST', a),
											u.setRequestHeader('restrict-access', 'true'),
											u.setRequestHeader('Accept', '*/*'),
											u.setRequestHeader('Authorization', 'Bearer ' + t);
										const c = new FormData();
										c.append('file', e.file.data), window.XDomainRequest && (u.readyState = 2), u.send(c);
									}
								else
									T.hasFlash && typeof e.flashUpload === 'function'
										? e.flashUpload && e.flashUpload(a, e)
										: e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_BROWSER_ERROR, id: e.id });
							} else e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_ERROR, id: e.id });
						} else e.onFileUploadError({ type: p.WEBIM_UPLOADFILE_NO_LOGIN, id: e.id });
					},
					download: function (e) {
						(e.onFileDownloadComplete = e.onFileDownloadComplete || l),
							(e.onFileDownloadError = e.onFileDownloadError || l);
						const t = e.accessToken || this.context.accessToken;
						if (t) {
							if (T.isCanDownLoadFile) {
								const r = T.xmlrequest();
								'addEventListener' in r
									? (r.addEventListener(
											'load',
											function (t) {
												e.onFileDownloadComplete(r.response, r);
											},
											!1
									  ),
									  r.addEventListener(
											'error',
											function (t) {
												e.onFileDownloadError({ type: p.WEBIM_DOWNLOADFILE_ERROR, id: e.id, xhr: r });
											},
											!1
									  ))
									: 'onreadystatechange' in r &&
									  (r.onreadystatechange = function () {
											r.readyState === 4
												? ajax.status === 200
													? e.onFileDownloadComplete(r.response, r)
													: e.onFileDownloadError({ type: p.WEBIM_DOWNLOADFILE_ERROR, id: e.id, xhr: r })
												: (r.abort(), e.onFileDownloadError({ type: p.WEBIM_DOWNLOADFILE_ERROR, id: e.id, xhr: r }));
									  });
								const o = e.method || 'GET';
									const n = e.responseType || 'blob';
									const i = e.mimeType || 'text/plain; charset=x-user-defined';
								r.open(o, e.url), typeof Blob !== 'undefined' ? (r.responseType = n) : r.overrideMimeType(i);
								const s = {
										'X-Requested-With': 'XMLHttpRequest',
										Accept: 'application/octet-stream',
										'share-secret': e.secret,
										Authorization: 'Bearer ' + t
									};
									const a = e.headers || {};
								for (var u in a) s[u] = a[u];
								for (var u in s) s[u] && r.setRequestHeader(u, s[u]);
								window.XDomainRequest && (r.readyState = 2), r.send(null);
							} else e.onFileDownloadComplete();
						} else e.onFileDownloadError({ type: p.WEBIM_DOWNLOADFILE_NO_LOGIN, id: e.id });
					},
					parseTextMessage: function (e, t) {
						if (typeof e === 'string') {
							if (Object.prototype.toString.call(t) !== '[object Object]')
								return { isemoji: !1, body: [{ type: 'txt', data: e }] };
							let r = e;
								const o = [];
								const n = r.match(/\[[^[\]]{2,3}\]/gm);
							if (!n || n.length < 1) return { isemoji: !1, body: [{ type: 'txt', data: e }] };
							for (var i = !1, s = 0; s < n.length; s++) {
								const a = r.substring(0, r.indexOf(n[s]));
									const u = WebIM.Emoji.map[n[s]];
								if ((a && o.push({ type: 'txt', data: a }), u)) {
									const c = WebIM.Emoji.map ? WebIM.Emoji.path + u : null;
									c ? ((i = !0), o.push({ type: 'emoji', data: c })) : o.push({ type: 'txt', data: n[s] });
									const l = r.indexOf(n[s]) + n[s].length;
									r = r.substring(l);
								} else o.push({ type: 'txt', data: n[s] });
							}
							return (
								r && o.push({ type: 'txt', data: r }),
								i ? { isemoji: i, body: o } : { isemoji: !1, body: [{ type: 'txt', data: e }] }
							);
						}
					},
					parseUri: function () {
						const e = {};
						if (window.location.search) {
							const t = window.location.search.match(/([^\?|&])\w+=([^&]+)/g);
							for (const r in t) {
								const o = t[r];
									const n = o.indexOf('=');
									const i = o.substr(0, n);
									const s = o.substr(n + 1);
								e[i] = s;
							}
						}
						return e;
					},
					parseHrefHash: function () {
						const e = {};
						if (window.location.hash) {
							const t = window.location.hash.match(/([^\#|&])\w+=([^&]+)/g);
							for (const r in t) {
								const o = t[r];
									const n = o.indexOf('=');
									const i = o.substr(0, n);
									const s = o.substr(n + 1);
								e[i] = s;
							}
						}
						return e;
					},
					xmlrequest: f,
					getXmlFirstChild: function (e, t) {
						const r = e.getElementsByTagName(t);
						return r.length == 0 ? null : r[0];
					},
					wxRequest: function (e) {
						const t = e.success || l;
							const r = e.error || l;
							const o = e.type || 'POST';
							let n = e.data || null;
							let i = '';
						if (o.toLowerCase() === 'get' && n) {
							for (const s in n) n.hasOwnProperty(s) && (i += s + '=' + n[s] + '&');
							(i = i ? i.slice(0, -1) : i),
								(e.url += (e.url.indexOf('?') > 0 ? '&' : '?') + (i ? i + '&' : i) + '_v=' + new Date().getTime()),
								(n = null),
								(i = null);
						}
						console.log('wx.request', e.url),
							wx.request({
								url: e.url,
								data: e.data,
								header: e.headers,
								method: o,
								success: function (e) {
									console.log('wx.request.success', arguments), e.statusCode == '200' ? t(e.data) : r(e);
								},
								complete: function () {
									console.log('wx.request.complete', arguments);
								},
								fail: function () {
									console.log('wx.request.fail', arguments);
								}
							});
					},
					ajax: function (e) {
						const t = e.dataType || 'text';
							const r = e.success || l;
							const o = e.error || l;
							const n = T.xmlrequest();
						(n.onreadystatechange = function () {
							if (n.readyState !== 4)
								n.readyState === 0 && o({ type: p.WEBIM_CONNCTION_AJAX_ERROR, data: n.responseText });
							else {
								if ((n.status || 0) === 200) {
									try {
										switch (t) {
											case 'text':
												return void r(n.responseText);
											case 'json':
												var e = T.parseJSON(n.responseText);
												return void r(e, n);
											case 'xml':
												return void (n.responseXML && n.responseXML.documentElement
													? r(n.responseXML.documentElement, n)
													: o({ type: p.WEBIM_CONNCTION_AJAX_ERROR, data: n.responseText }));
										}
										r(n.response || n.responseText, n);
									} catch (e) {}
									return;
								}
								o({ type: p.WEBIM_CONNCTION_AJAX_ERROR, data: n.responseText });
							}
						}),
							e.responseType && n.responseType && (n.responseType = e.responseType),
							e.mimeType && T.hasOverrideMimeType && n.overrideMimeType(e.mimeType);
						const i = e.type || 'POST';
							let s = e.data || null;
							let a = '';
						if (i.toLowerCase() === 'get' && s) {
							for (const u in s) s.hasOwnProperty(u) && (a += u + '=' + s[u] + '&');
							(a = a ? a.slice(0, -1) : a),
								(e.url += (e.url.indexOf('?') > 0 ? '&' : '?') + (a ? a + '&' : a) + '_v=' + new Date().getTime()),
								(s = null),
								(a = null);
						}
						if ((n.open(i, e.url, T.isCanSetRequestHeader), T.isCanSetRequestHeader)) {
							const c = e.headers || {};
							for (const f in c) c.hasOwnProperty(f) && n.setRequestHeader(f, c[f]);
						}
						return window.XDomainRequest && (n.readyState = 2), n.send(s), n;
					},
					ts: function () {
						const e = new Date();
							const t = e.getHours();
							const r = e.getMinutes();
							const o = e.getSeconds();
						return (
							(t < 10 ? '0' + t : t) +
							':' +
							(r < 10 ? '0' + r : r) +
							':' +
							(o < 10 ? '0' + o : o) +
							':' +
							e.getMilliseconds() +
							' '
						);
					},
					getObjectKey: function (e, t) {
						for (const r in e) if (e[r] == t) return r;
						return '';
					},
					sprintf: function () {
						let e;
							let t;
							const r = arguments;
							let o = r[0] || '';
						for (e = 1, t = r.length; e < t; e++) o = o.replace(/%s/, r[e]);
						return o;
					},
					setCookie: function (e, t, r) {
						let o = e + '=' + encodeURIComponent(t);
						typeof r === 'number' && (o += '; max-age: ' + 60 * r * 60 * 24), (document.cookie = o);
					},
					getCookie: function () {
						const e = {};
							const t = document.cookie;
						if (t === '') return e;
						for (let r = t.split('; '), o = 0; o < r.length; o++) {
							const n = r[o];
								const i = n.indexOf('=');
								const s = n.substring(0, i);
								let a = n.substring(i + 1);
							(a = decodeURIComponent(a)), (e[s] = a);
						}
						return e;
					},
					reverse: function (e) {
						let t = [];
						if (Array.prototype.reverse) t = e.reverse();
						else for (let r = 0; r < e.length; r++) t.unshift(e[r]);
						return t;
					}
				};
			(T.useWxProgram = function () {
				T.ajax = T.wxRequest;
			}),
				(T.getEnv = function () {
					let e = !0;
					try {
						e = !window || !navigator;
					} catch (t) {
						e = !0;
					}
					return e;
				}),
				(T.checkArray = function (e, t) {
					let r = 'off';
					if (
						(e.forEach(function (e, o) {
							if (e.name === t.name) return (r = 'on'), o;
						}),
						r == 'off')
					)
						return !1;
				}),
				(T._listenNetwork = function (e, t) {
					window.addEventListener
						? (window.addEventListener('online', e), window.addEventListener('offline', t))
						: window.attachEvent &&
						  (document.body
								? (document.body.attachEvent('ononline', e), document.body.attachEvent('onoffline', t))
								: window.attachEvent('load', function () {
										document.body.attachEvent('ononline', e), document.body.attachEvent('onoffline', t);
								  }));
				});
			const S = T;
			t.default = S;
		}
	]);
});
