# influxdb-query-parser

Convert url query string to InfluxDB database InfluxQL query.

## Features

Supports most of the InfluxDB operators and features including filters, sorting, limit, offset and aggregations.

Note: as this library allows to create heavy and/or unintentional database queries use it with caution in public environments!

## Installation
```
npm install influxdb-query-parser
```

## Usage

### API
```
import { InfluxDbQueryParser } from 'influxdb-query-parser';

const parser = new InfluxDbQueryParser(options?: ParserOptions)
const queryOptions = parser.parse(query: string) : QueryOptions

parser.createQuery(queryOptions);
```

### Constructor
Initialize parser with given options.

#### Arguments
- `ParserOptions`: Object for advanced options:
	- `dateFormat`: Date format, default is ISO-8601 (YYYY-MM-DD)
	- `whitelist`: String array of fields allowed to be in the filter
	- `blacklist`: String array of fields disallowed to be in the filter
	- `casters`: Custom casters
	- `castParams`: Caster parameters
	- `measurements`: Names of the measurements for query
	- `fieldsKey`: Name of the query parameter used for selected fields
	- `sortKey`: Name of the query parameter used for sorting
	- `limitKey`: Name of the query parameter for result count limit and skip
	- `filterKey`: Name of the query parameter for filters
	- `aggregateKey`: Name of the query parameter for aggregations
	- `fillKey`: Name of the query parameter for aggregate fill
	- `parseArray`: Set to true if you want to automatically split comma seperated strings to array
	- `parseBoolean`: Set to true if you want to automatically cast true/false to boolean, otherwise you need to use boolean(true) caster

### parser.parse(query)

Parses the query parameters into a QueryOptions object.

#### Arguments
- `query`: query string part of the requested API URL (ie, `firstName=John&limit=10`). [required]

#### Returns
- `QueryOptions`: object contains the following properties:
    - `filter.filters` contains the query string
    - `fields` contains the query projection
    - `sort`, 
	- `limit` contains the cursor modifiers for paging purposes
	- `aggregate` contains the parsed aggregations
	- `fill` contains the parsed aggregate fill.

#### Filters
All other query parameters are considered to be filters. Example:
```
?firstName=Frederick&lastName=Durst
```

Specifies filters for firstName and lastName fields. Several values can be separated with comma for alternatives (OR):

```
?firstName=Frederick,Bernie,Jack
```

Value can be a regular expression:

```
?firstName=/frederick/i
```

Other signs for number and date fields:

```
?price<1000      // price is larger than 1000
?price!=1000     // price is not 1000
?price>=1000     // price is larger or equal to 1000
```

#### Casters
Filter values can be casted or modified with special caster functions. Default casters:
- `date` cast value to date. Caster takes parameters in format `value:modifier?:date?` where value can be a date string or key:
	- shortcuts: startOfYear, startOfQuarter, startOfMonth, startOfWeek, endOfYear, endOfQuarter, endOfWeek
	- Examples:
		- Start of current year: `startOfYear` or `startOfYear:0`
		- Start of next year: `startOfYear:1`
		- Start of previous year: `startOfYear:-1`
	- Optional date parameter can be used for example: `startOfYear:0:2019-10-01` to return start of year for the given date.
	- Other shortcuts to adjust from current or given date by modifier: year, quarter, month, week, day
	- Examples: 
		- `day:2019-10-01:1` to return the next day
		- `day:-10` date for 10 days ago
		- `month:1` date for one month to future

- boolean caster to cast parameter to boolean:

```
?enabled=boolean(true)
```
- string caster to explicitly cast parameter to string:

```
?key=string(123)
```

- number caster to cast parameter to number:

```
?key=number(1.34)
```

#### Fields
Result fields can be specified in the format:
```
?fields=firstName,lastName
```

#### Limit
Result limits can be specified in the format:
```
?limit=10
```

will return 10 items. Optionally you can add starting offset:

```
?limit=10,30
```

will return 10 items starting from 30.

#### Sorting
Sorting can be specified in the format:
```
?sort=creationDate,-price
```
will sort first by creationDate ascending and then by price descending.

#### Aggregations
Aggregations can be specified in the format:
```
?aggregate=field,field2:as func field3
```

Where 
- `field` and `field2` are the grouping fields
- `as` is the name of the aggregation
- `func` is the aggregation function (sum, count, distict, integral, mean, median, mode, spread, stddev, bottom, first, last, max, min, percentile, sample, top)
- `field3` is the name of the aggregated field

Example:
```
?aggregate=owner,status:totalPrice sum price,averagePrice avg price,priceCount count price
```

You can leave out the grouping fields:
```
?aggregate=totalCount count owner
```

will create query for aggregation without grouping.

InfluxDB specific time aggregations can be specified with syntax:

```
?aggregate=field,field2:time duration
```
Where 
- `field` and `field2` are the grouping fields
- `time` is static key
top)
- `duration` is InfluxDB duration (5m = 5 minutes, 3d = 3 days, 4mo = 4 months etc.) ([See InfluxDB Documentation](https://docs.influxdata.com/influxdb/v2.0/reference/flux/language/lexical-elements/#duration-literals))

By default InfluxDB returns null for missing aggregated values. Behaviour can be changed with the `fill` parameter, example:

```
?aggregate=user:time 5m&fill=previous
```


### parser.createQuery(queryOptions)

#### Arguments
- `queryOptions`: query options created by parse method. [required]

#### Returns
- `query`: InfluxQL query (as string) created from the query options.

## License
[MIT](LICENSE)

## Thanks
This library is heavily based on [mongoose-query-parser](https://github.com/leodinas-hao/mongoose-query-parser) by Leodinas Hao
