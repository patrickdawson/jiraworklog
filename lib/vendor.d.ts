declare module "fuzzy" {
    interface FilterResult<T> {
        original: T;
        string: string;
        score: number;
        index: number;
    }
    interface FilterOptions<T> {
        extract?: (el: T) => string;
        pre?: string;
        post?: string;
    }
    function filter<T>(pattern: string, arr: T[], opts?: FilterOptions<T>): FilterResult<T>[];
    export { filter };
}

declare module "inquirer-autocomplete-prompt" {
    const AutocompletePrompt: unknown;
    export = AutocompletePrompt;
}
