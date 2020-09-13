/* eslint-disable @typescript-eslint/explicit-module-boundary-types */
/* eslint-disable @typescript-eslint/no-explicit-any */
import * as qs from 'querystring';
import * as Moment from 'moment';
import * as _ from 'lodash';
import { escape } from 'influx';

export interface ParserOptions {
	dateFormat?: any;
	whitelist?: string[]; // list of fields allowed to be in the filter
	blacklist?: string[]; // list of fields disallowed to be in the filter
	casters?: { [key: string]: (val: string) => any };
	castParams?: { [key: string]: string };
	measurements?: string;
	// rename the keys
	fieldsKey?: string;
	sortKey?: string;
	limitKey?: string;
	filterKey?: string;
	aggregateKey?: string;
	fillKey?: string;
	// should the parser automatically cast booleans and arrays?
	parseBoolean?: boolean;
	parseArray?: boolean;
}

export interface QueryOptions {
	filter: any;
	sort?: string | Record<string, any>;
	limit?: string;
	fields?: string | Record<string, any>;
	aggregate: { groupBy: string; agg: string };
	fill?: string;
}

export class InfluxDbQueryParser {
	private readonly _defaultDateFormat = [Moment.ISO_8601];

	private readonly _builtInCaster = {
		string: val => String(val),
		number: val => Number(val),
		boolean: val => ('' + val).toLowerCase() === 'true',
		date: val => {
			const shortcuts = {
				startOfYear: (key, mod, date) => date.startOf('year').add(Number(mod || '0'), 'years'),
				endOfYear: (key, mod, date) => date.endOf('year').add(Number(mod || '0'), 'years'),
				startOfQuarter: (key, mod, date) => date.startOf('quarter').add(Number(mod || '0'), 'quarters'),
				endOfQuarter: (key, mod, date) => date.endOf('quarter').add(Number(mod || '0'), 'quarters'),
				startOfMonth: (key, mod, date) => date.startOf('month').add(Number(mod || '0'), 'months'),
				endOfMonth: (key, mod, date) => date.endOf('month').add(Number(mod || '0'), 'months'),
				startOfWeek: (key, mod, date) => date.startOf('isoWeek').add(Number(mod || '0'), 'weeks'),
				endOfWeek: (key, mod, date) => date.endOf('isoWeek').add(Number(mod || '0'), 'weeks'),
				year: (key, mod, date) => date.add(Number(mod || '0'), 'years'),
				quarter: (key, mod, date) => date.add(Number(mod || '0'), 'quarters'),
				month: (key, mod, date) => date.add(Number(mod || '0'), 'months'),
				week: (key, mod, date) => date.add(Number(mod || '0'), 'weeks'),
				day: (key, mod, date) => date.add(Number(mod || '0'), 'days'),
			};
			//const [, key, mod] = /(^[a-zA-Z]+$)|^([a-zA-Z]+):(.+)$/.exec(val);
			const matches = val.match(/^([a-zA-Z]+):?([0-9-.]*):?([0-9-.]*)$/);
			if (matches) {
				if (shortcuts[matches[1]]) {
					const modDate = matches[3] ? Moment.utc(matches[3], this._options.dateFormat) : Moment.utc();
					return shortcuts[matches[1]](matches[1], matches[2], modDate.isValid() ? modDate : Moment.utc())
						.toDate()
						.toISOString();
				} else {
					throw new Error(`Unknown date shortcut: ${matches[1]}`);
				}
			}
			const m = Moment.utc(val, this._options.dateFormat);
			if (m.isValid()) {
				return m.toISOString();
			} else {
				throw new Error(`Invalid date string: ${val}`);
			}
		},
	};

	private readonly _operators = [
		{ operator: 'fields', method: this.castFields, defaultKey: 'fields' },
		{ operator: 'sort', method: this.castSort, defaultKey: 'sort' },
		{ operator: 'limit', method: this.castLimit, defaultKey: 'limit' },
		{ operator: 'filter', method: this.castFilter, defaultKey: 'filter' },
		{ operator: 'aggregate', method: this.castAggregate, defaultKey: 'aggregate' },
		{ operator: 'fill', method: this.castFill, defaultKey: 'fill' },
	];

	constructor(private _options: ParserOptions = {}) {
		// add default date format as ISO_8601
		this._options.dateFormat = _options.dateFormat || this._defaultDateFormat;

		// add builtInCaster
		this._options.casters = Object.assign(this._builtInCaster, _options.casters);

		// build blacklist
		this._options.blacklist = _options.blacklist || [];
		this._operators.forEach(({ operator, defaultKey }) => {
			this._options.blacklist.push(this._options[`${operator}Key`] || defaultKey);
		});
	}

	/**
	 * parses query string/object to QueryOptions
	 * @param {string | Object} query
	 * @param {Object} [context]
	 * @return {string}
	 */
	parse(query: string | Record<string, any>): QueryOptions {
		const params = _.isString(query) ? qs.parse(query) : query;
		const options = this._options;
		const result = {
			fields: '*',
		};

		this._operators.forEach(({ operator, method, defaultKey }) => {
			const key = options[`${operator}Key`] || defaultKey;
			const value = params[key];

			if (value || operator === 'filter') {
				result[operator] = method.call(this, value, params);
			}
		}, this);

		return result as QueryOptions;
	}

	/**
	 * parses query string/object to InfluxDB query
	 * @param {string | Object} query
	 * @return {string}
	 */
	parseQuery(query: string | Record<string, any>): string {
		const result = this.parse(query);
		return this.createQuery(result);
	}

	/**
	 * create AQL query from QueryOptions
	 * @param qo QueryOptions
	 * @return {string} AQL query
	 */
	createQuery(qo: QueryOptions): string {
		const options = this._options;
		let result = 'SELECT ' + (qo.aggregate?.agg || qo.fields || '*') + ' FROM ' + options.measurements;
		result += qo.filter.filters ? ' ' + qo.filter.filters : '';
		result += qo.aggregate && qo.aggregate.groupBy ? ' ' + qo.aggregate.groupBy : '';
		result += qo.fill ? ' ' + qo.fill : '';
		result += qo.sort ? ' ' + qo.sort : '';
		result += qo.limit ? ' ' + qo.limit : '';
		return result;
	}

	/**
	 * parses string to typed values
	 * This methods will apply auto type casting on Number, RegExp, Date, Boolean and null
	 * Also, it will apply defined casters in given options of the instance
	 * @param {string} value
	 * @param {string} key
	 * @return {any} typed value
	 */
	parseValue(value: string, key?: string): any {
		const options = this._options;

		// Apply casters
		// Match type casting operators like: string(true), _caster(123), $('test')
		const casters = options.casters;
		const casting = value.match(/^([a-zA-Z_$][0-9a-zA-Z_$]*)\((.*)\)$/);
		if (casting && casters[casting[1]]) {
			return casters[casting[1]](casting[2]);
		}

		// Apply casters per params
		if (key && options.castParams && options.castParams[key] && casters[options.castParams[key]]) {
			return casters[options.castParams[key]](value);
		}

		// cast array
		if (options.parseArray && value.includes(',')) {
			return value.split(',').map(val => this.parseValue(val, key));
		}

		// Apply type casting for Number, RegExp, Date, Boolean and null
		// Match regex operators like /foo_\d+/i
		const regex = value.match(/^\/(.*)\/(i?)$/);
		if (regex) {
			return new RegExp(regex[1], regex[2]);
		}

		// Match boolean values
		if (options.parseBoolean && value === 'true') {
			return true;
		}
		if (options.parseBoolean && value === 'false') {
			return false;
		}

		// Match null
		if (value === 'null') {
			return null;
		}

		// Match numbers (string padded with zeros are not numbers)
		if (value !== '' && !isNaN(Number(value)) && !/^0[0-9]+/.test(value)) {
			return Number(value);
		}

		return value;
	}

	castFilter(filter, params): any {
		const options = this._options;
		const parsedFilter = filter ? this.parseFilter(filter) : {};
		return (
			Object.keys(params)
				.map(val => {
					const join = params[val] ? `${val}=${params[val]}` : val;
					// Separate key, operators and value
					const [, prefix, key, op, value] = join.match(/(!?)([^><!=]+)([><=]=?|!?=|)(.*)/);
					return { prefix, key, op: this.parseOperator(op), value: this.parseValue(value, key) };
				})
				.filter(({ key }) => !options.whitelist || options.whitelist.indexOf(key) > -1)
				.filter(({ key }) => options.blacklist.indexOf(key) === -1)
				// eslint-disable-next-line @typescript-eslint/no-unused-vars
				.reduce((result, { prefix, key, op, value }) => {
					if (Array.isArray(value)) {
						result.filters = typeof result.filters == 'string' ? result.filters + ' AND ' : 'WHERE ';
						if (op == '!=') {
							result.filters +=
								'(' + value.reduce((acc, curr) => (acc ? acc + ' AND ' : '') + key + ' != ' + escape.stringLit(curr), undefined) + ')';
							return result;
						} else {
							result.filters +=
								'(' + value.reduce((acc, curr) => (acc ? acc + ' OR ' : '') + key + ' = ' + escape.stringLit(curr), undefined) + ')';
							return result;
						}
					} else if (value instanceof RegExp) {
						op = op == '!=' ? '!~' : '=~';
					}
					result.filters = typeof result.filters == 'string' ? result.filters + ' AND ' : 'WHERE ';
					if (typeof value == 'number' || typeof value == 'boolean') {
						result.filters += `${key} ${op} ${value}`;
					} else {
						result.filters += `${key} ${op} ${escape.stringLit(value)}`;
					}
					return result;
				}, parsedFilter)
		);
	}

	parseFilter(filter) {
		try {
			if (typeof filter === 'object') {
				return filter;
			}
			return JSON.parse(filter);
		} catch (err) {
			throw new Error(`Invalid JSON string: ${filter}`);
		}
	}

	parseOperator(operator) {
		if (operator === '=') {
			return '=';
		} else if (operator === '!=') {
			return '!=';
		} else if (operator === '>') {
			return '>';
		} else if (operator === '>=') {
			return '>=';
		} else if (operator === '<') {
			return '<';
		} else if (operator === '<=') {
			return '<=';
		} else if (!operator) {
			return '!';
		}
	}

	/**
	 * cast fields query to list of fields
	 * fields=email,phone
	 * =>
	 * email,phone
	 * @param val
	 */
	castFields(val): string {
		const options = this._options;
		const result = val
			.split(',')
			.filter(field => !options.whitelist || options.whitelist.indexOf(field) > -1)
			.filter(field => options.blacklist.indexOf(field) === -1);
		return result.join(',');
	}

	/**
	 * cast sort query to string
	 * sort=-firstName
	 * =>
	 * ORDER BY firstName DESC
	 *
	 * @param sort
	 */
	castSort(sort: string) {
		const arr = _.isString(sort) ? sort.split(',') : sort;
		const r: Array<any> = arr.map(x => x.match(/^(\+|-)?(.*)/));

		return r.reduce((result, [, dir, key]) => {
			if (key && /^[a-zA-Z0-9_]*$/.test(key)) {
				result = (_.isString(result) && result != '' ? result + ', ' : 'ORDER BY ') + key.trim() + (dir === '-' ? ' DESC' : '');
			}
			return result;
		}, '');
	}

	/**
	 * cast aggregate query to string
	 * aggregate=country,city:totalPrice sum price,averagePrice avg price,priceCount count price
	 * =>
	 * COLLECT country=o.country, city = o.city
	 * AGGREGATE totalPrice = SUM(o.price), averagePrice = AVG(o.price), priceCount = COUNT(o.price)
	 * @param aggregate
	 */
	castAggregate(aggregate: string) {
		let [collFields, aggregations] = aggregate.split(':', 2);
		let groupBy;
		let agg;
		const types = [
			'sum',
			'count',
			'distict',
			'integral',
			'mean',
			'median',
			'mode',
			'spread',
			'stddev',
			'bottom',
			'first',
			'last',
			'max',
			'min',
			'percentile',
			'sample',
			'top',
		];

		if (!collFields && !aggregations) {
			return '';
		}

		if (!aggregations) {
			aggregations = collFields;
			collFields = '';
		}

		for (const field of collFields.split(',')) {
			if (field && /^[a-zA-Z0-9_]*$/.test(field)) {
				groupBy = (groupBy ? groupBy + ', ' : 'GROUP BY ') + field;
			}
		}
		for (const a of aggregations.split(',')) {
			const [as, type, field] = a.split(' ');
			if (as == 'time') {
				groupBy = (groupBy ? groupBy + ', time(' : 'GROUP BY time(') + type + ')';
			} else if (as && type && field && /^[a-zA-Z0-9_]*$/.test(field) && types.includes(type)) {
				agg = (agg ? agg + ', ' : '') + type.toUpperCase() + '(' + field + ') AS ' + as;
			}
		}

		return { groupBy, agg };
	}

	/**
	 * cast fill parameter
	 * fill=100
	 * =>
	 * fill(100)
	 * @param fill
	 */
	castFill(fill: string) {
		let result = '';
		if (/^[a-z0-9]*$/.test(fill)) {
			result = 'fill(' + fill + ')';
		}
		return result;
	}

	/**
	 * cast limit query to object like
	 * limit=50,100
	 * =>
	 * LIMIT 50 OFFSET 100
	 * @param limit
	 */
	castLimit(limit: string) {
		const matches = limit.match(/^([0-9]*),?([0-9]*)$/);
		let result = '';
		if (matches) {
			result = matches[1] != '' ? 'LIMIT ' + matches[1] : '';
			result += matches[2] != '' ? ' OFFSET ' + matches[2] : '';
		}
		return result;
	}
}
