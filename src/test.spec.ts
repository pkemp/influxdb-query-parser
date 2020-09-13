/* eslint-disable @typescript-eslint/no-explicit-any */
import { suite, test } from '@testdeck/mocha';
import { assert } from 'chai';

import { InfluxDbQueryParser } from './';

@suite('Tester')
// eslint-disable-next-line @typescript-eslint/no-unused-vars
class Tester {
	@test('should parse general query')
	generalParse1() {
		const parser = new InfluxDbQueryParser();
		const qry =
			'date=2016-01-01&boolean=true&integer=10&regexp=/foobar/i&null=null&startTime>2020-06-16&type=note,task&limit=,10&sort=type,-startTime&fields=startTime,endTime';
		const parsed = parser.parse(qry);
		assert.isNotNull(parsed.filter);
	}

	@test('should parse more complex query')
	generalParse2() {
		const parser = new InfluxDbQueryParser();
		const parsed = parser.parse('timestamp>2017-10-01&timestamp<2020-01-01&author.firstName=/frederick/i&limit=50,100&sort=-timestamp&fields=name');
		assert.strictEqual(parsed.filter.filters, "WHERE timestamp > '2017-10-01' AND timestamp < '2020-01-01' AND author.firstName =~ '/frederick/i'");
		assert.isOk(parsed.limit == 'LIMIT 50 OFFSET 100');
		assert.isNotNull(parsed.sort);
		assert.isNotNull(parsed.fields);
	}

	@test('should parse multiple option query')
	generalParse3() {
		const parser = new InfluxDbQueryParser({ parseArray: true });
		const qry = 'author=William,Frederick,Durst';
		const parsed = parser.parse(qry);
		assert.strictEqual(parsed.filter.filters, "WHERE (author = 'William' OR author = 'Frederick' OR author = 'Durst')");
	}

	@test('should parse built in casters')
	builtInCastersTest() {
		const parser = new InfluxDbQueryParser();
		const qry = 'key1=string(10)&key2=date(2017-10-01)&key3=string(null)&key4=123&key5=boolean(true)';
		const parsed = parser.parse(qry);
		assert.strictEqual(parsed.filter.filters, "WHERE key1 = '10' AND key2 = '2017-10-01T00:00:00.000Z' AND key3 = 'null' AND key4 = 123 AND key5 = true");
	}

	@test('should parse only whitelist fields')
	parseWhitelist() {
		const parser = new InfluxDbQueryParser({ whitelist: ['firstName', 'lastName'] });
		const parsed = parser.parse('firstName=William&middleName=Frederick&lastName=Durst&password=secret');
		assert.strictEqual(parsed.filter.filters, "WHERE firstName = 'William' AND lastName = 'Durst'");
	}

	@test('should not parse blacklisted fields')
	parseBlacklist() {
		const parser = new InfluxDbQueryParser({ blacklist: ['middleName', 'password'] });
		const parsed = parser.parse('firstName=William&middleName=Frederick&lastName=Durst&password=secret');
		assert.strictEqual(parsed.filter.filters, "WHERE firstName = 'William' AND lastName = 'Durst'");
	}

	@test('should create equal query for filters')
	parseQuery1() {
		const parser = new InfluxDbQueryParser({ measurements: 'events', parseBoolean: false });
		const parsed = parser.parse('startTime>2020-06-16&private=false');
		const query = parser.createQuery(parsed);
		assert.equal(query, "SELECT * FROM events WHERE startTime > '2020-06-16' AND private = 'false'");
	}

	@test('should create equal query for filters, limit and sort')
	parseQuery2() {
		const parser = new InfluxDbQueryParser({ measurements: 'events', parseBoolean: true });
		const parsed = parser.parse('startTime>2020-06-16&private=false&limit=10&sort=startTime');
		const query = parser.createQuery(parsed);
		assert.equal(query, "SELECT * FROM events WHERE startTime > '2020-06-16' AND private = false ORDER BY startTime LIMIT 10");
	}

	@test('should create query only for whitelisted fields')
	parseQueryWhiteList() {
		const parser = new InfluxDbQueryParser({ measurements: 'users', whitelist: ['firstName', 'lastName'] });
		const parsed = parser.parse('fields=firstName,middleName,lastName,password');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT firstName,lastName FROM users');
	}

	@test('should not create query for blacklisted fields')
	parseQueryBlacklist() {
		const parser = new InfluxDbQueryParser({ measurements: 'users', blacklist: ['middleName', 'password'] });
		const parsed = parser.parse('fields=firstName,middleName,lastName,password');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT firstName,lastName FROM users');
	}

	@test('should create grouped aggregates')
	parseAggregate1() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=owner,status:totalPrice sum price,averagePrice mean price,priceCount count price');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT SUM(price) AS totalPrice, MEAN(price) AS averagePrice, COUNT(price) AS priceCount FROM deals GROUP BY owner, status');
	}

	@test('should create total aggregates')
	parseAggregate2() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=totalPrice sum price,averagePrice mean price,priceCount count price');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT SUM(price) AS totalPrice, MEAN(price) AS averagePrice, COUNT(price) AS priceCount FROM deals');
	}

	@test('should create time aggregates')
	parseAggregate3() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=time 5m,totalPrice sum price,averagePrice mean price,priceCount count price');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT SUM(price) AS totalPrice, MEAN(price) AS averagePrice, COUNT(price) AS priceCount FROM deals GROUP BY time(5m)');
	}

	@test('should create time aggregates with grouping')
	parseAggregate4() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=owner:time 5m,totalPrice sum price,averagePrice mean price,priceCount count price');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT SUM(price) AS totalPrice, MEAN(price) AS averagePrice, COUNT(price) AS priceCount FROM deals GROUP BY owner, time(5m)');
	}

	@test('should create time aggregates with grouping and fill')
	parseAggregate5() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=owner:time 5m,totalPrice sum price,averagePrice mean price,priceCount count price&fill=previous');
		const query = parser.createQuery(parsed);
		assert.equal(
			query,
			'SELECT SUM(price) AS totalPrice, MEAN(price) AS averagePrice, COUNT(price) AS priceCount FROM deals GROUP BY owner, time(5m) fill(previous)'
		);
	}

	@test('should create grouped aggregates with order and limit')
	parseAggregate6() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse('aggregate=time 10m,meanSpeed mean speed&fill=previous&sort=time&limit=5');
		const query = parser.createQuery(parsed);
		assert.equal(query, 'SELECT MEAN(speed) AS meanSpeed FROM deals GROUP BY time(10m) fill(previous) ORDER BY time LIMIT 5');
	}

	@test('should parse date shortcuts')
	parseDateShortcuts1() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse(
			'thisYearStarts=date(startOfYear)&thisYearEnds=date(endOfYear)&thisMonthStarts=date(startOfMonth)&thisMonthEnds=date(endOfMonth)&thisQuarterStarts=date(startOfQuarter)&thisQuarterEnds=date(endOfQuarter)'
		);
		const query = parser.createQuery(parsed);
		assert.equal(
			query,
			"SELECT * FROM deals WHERE thisYearStarts = '2020-01-01T00:00:00.000Z' AND thisYearEnds = '2020-12-31T23:59:59.999Z' AND thisMonthStarts = '2020-09-01T00:00:00.000Z' AND thisMonthEnds = '2020-09-30T23:59:59.999Z' AND thisQuarterStarts = '2020-07-01T00:00:00.000Z' AND thisQuarterEnds = '2020-09-30T23:59:59.999Z'"
		);
	}

	@test('should parse date shortcuts with modifiers')
	parseDateShortcuts2() {
		const parser = new InfluxDbQueryParser({ measurements: 'deals' });
		const parsed = parser.parse(
			'previousYearStarts=date(startOfYear:-1)&previousYearEnds=date(endOfYear:-1)&nextMonthStarts=date(startOfMonth:1)&nextMonthEnds=date(endOfMonth:1)'
		);
		const query = parser.createQuery(parsed);
		assert.equal(
			query,
			"SELECT * FROM deals WHERE previousYearStarts = '2019-01-01T00:00:00.000Z' AND previousYearEnds = '2019-12-31T23:59:59.999Z' AND nextMonthStarts = '2020-10-01T00:00:00.000Z' AND nextMonthEnds = '2020-10-30T23:59:59.999Z'"
		);
	}
}
