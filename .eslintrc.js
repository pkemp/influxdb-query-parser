module.exports = {
	parser: '@typescript-eslint/parser', // Specifies the ESLint parser
	parserOptions: {
		ecmaVersion: 2020, // Allows for the parsing of modern ECMAScript features
		sourceType: 'module', // Allows for the use of imports
	},
	extends: [
		'plugin:@typescript-eslint/recommended', // Uses the recommended rules from the @typescript-eslint/eslint-plugin
		'prettier/@typescript-eslint', // Uses eslint-config-prettier to disable ESLint rules from @typescript-eslint/eslint-plugin that would conflict with prettier
		'plugin:prettier/recommended', // Enables eslint-plugin-prettier and eslint-config-prettier. This will display prettier errors as ESLint errors. Make sure this is always the last configuration in the extends array.
	],
	rules: {
		'no-multiple-empty-lines': ['warn'],
		'prefer-spread': ['warn'],
		'@typescript-eslint/no-var-requires': ['warn'],
		'@typescript-eslint/explicit-function-return-type': ['off'],
		'@typescript-eslint/no-this-alias': ['warn'],
		'@typescript-eslint/no-var-requires': ['warn'],
		'@typescript-eslint/no-use-before-define': ['warn'],
		'@typescript-eslint/no-empty-function': ['warn'],
		'@typescript-eslint/naming-convention': [
			'warn',
			{ selector: 'default', format: ['camelCase'] },
			{ selector: 'function', format: ['camelCase', 'PascalCase'] },
			{ selector: 'variable', format: ['camelCase', 'UPPER_CASE', 'PascalCase'] },
			{ selector: 'parameter', format: ['camelCase'], leadingUnderscore: 'allow' },
			{ selector: 'memberLike', modifiers: ['private'], format: ['camelCase'], leadingUnderscore: 'require' },
			{ selector: 'typeLike', format: ['PascalCase'] },
		],
		'@typescript-eslint/no-unused-vars': [
			'warn',
			{
				argsIgnorePattern: '^_',
				caughtErrorsIgnorePattern: '^ignore',
			},
		],
	},
};
