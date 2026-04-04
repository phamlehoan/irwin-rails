declare module 'pluralize' {
  interface PluralizeOptions {
    uncountable?: string[] | { [key: string]: boolean };
    irregular?: string[] | { [key: string]: string };
  }

  function pluralize(word: string, count?: number | boolean, inclusive?: boolean): string;

  namespace pluralize {
    function plural(word: string, count?: number | boolean, inclusive?: boolean): string;
    function singular(word: string): string;
    function addPluralRule(rule: string | RegExp, replacement: string): void;
    function addSingularRule(rule: string | RegExp, replacement: string): void;
    function addUncountableRule(word: string | RegExp): void;
    function addIrregularRule(singular: string, plural: string): void;
    function isPlural(word: string): boolean;
    function isSingular(word: string): boolean;
  }

  export = pluralize;
}
